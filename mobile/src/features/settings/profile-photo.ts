import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import type { ImagePickerAsset } from 'expo-image-picker';

const PROFILE_PHOTO_EDGE_PX = 1280;
const PROFILE_PHOTO_RETRY_EDGE_PX = 1024;
const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;

type ProfilePhotoErrorCode =
  | 'PROFILE_PHOTO_UNSUPPORTED'
  | 'PROFILE_PHOTO_TOO_LARGE'
  | 'PROFILE_PHOTO_NETWORK'
  | 'PROFILE_PHOTO_UNAUTHORIZED'
  | 'PROFILE_PHOTO_STORAGE_FAILED'
  | 'PROFILE_PHOTO_INVALID_RESPONSE';

export class ProfilePhotoUploadError extends Error {
  code: ProfilePhotoErrorCode | string;
  status: number | null;

  constructor(message: string, code: ProfilePhotoErrorCode | string, status: number | null = null) {
    super(message);
    this.name = 'ProfilePhotoUploadError';
    this.code = code;
    this.status = status;
  }
}

const resizeActionFor = (asset: Pick<ImagePickerAsset, 'width' | 'height'>, edge: number) => {
  const width = Math.max(1, Number(asset.width) || edge);
  const height = Math.max(1, Number(asset.height) || edge);
  return width >= height
    ? { resize: { width: Math.min(edge, width) } }
    : { resize: { height: Math.min(edge, height) } };
};

const renderJpeg = async (asset: ImagePickerAsset, edge: number, compress: number) =>
  manipulateAsync(
    asset.uri,
    [resizeActionFor(asset, edge)],
    { compress, format: SaveFormat.JPEG },
  );

const isUnsupportedMessage = (message: string) =>
  /unsupported|valid jpg|valid jpeg|valid png|image format|could not decode/i.test(message);

export function getProfilePhotoUploadMessage(error: unknown): string {
  const value = error as any;
  const status = Number(value?.status || value?.response?.status) || null;
  const code = String(value?.code || value?.response?.data?.code || '').toUpperCase();
  const message = String(value?.message || value?.response?.data?.message || '');

  if (status === 401 || code.includes('UNAUTHORIZED') || code === 'TOKEN_EXPIRED') {
    return 'Your session expired. Please sign in again.';
  }
  if (status === 413 || code.includes('TOO_LARGE') || /too large|under 2 mb|file size/i.test(message)) {
    return 'This photo is too large. Please choose a smaller image.';
  }
  if (code.includes('UNSUPPORTED') || isUnsupportedMessage(message)) {
    return 'This image format isn\u2019t supported. Please choose another photo.';
  }
  if (
    code.includes('NETWORK')
    || value?.name === 'AbortError'
    || /network request failed|network error|timed out|timeout|failed to fetch/i.test(message)
  ) {
    return 'We couldn\u2019t upload your photo. Check your connection and try again.';
  }
  return 'We couldn\u2019t save your profile photo. Please try again.';
}

/**
 * Profile photos never need full camera resolution. Resizing before upload keeps
 * the multipart request comfortably below the API's 2 MB limit on mobile data.
 */
export async function prepareProfilePhoto(asset: ImagePickerAsset) {
  if (!asset?.uri) {
    throw new ProfilePhotoUploadError(
      'The selected image could not be read.',
      'PROFILE_PHOTO_UNSUPPORTED',
    );
  }

  if (__DEV__) {
    console.log('[ProfilePhoto] selected asset', {
      uri: asset.uri,
      mimeType: asset.mimeType || null,
      fileName: asset.fileName || null,
      fileSize: asset.fileSize || null,
      width: asset.width || null,
      height: asset.height || null,
    });
  }

  let prepared;
  try {
    // ImageManipulator reads the picker URI (including iOS library-backed
    // selections) and writes a real cache file. It also converts HEIC/HEIF to
    // JPEG, so the native upload never depends on a browser File object.
    prepared = await renderJpeg(asset, PROFILE_PHOTO_EDGE_PX, 0.8);
    let preparedFile = new File(prepared.uri);

    if (preparedFile.size > PROFILE_PHOTO_MAX_BYTES) {
      prepared = await renderJpeg(asset, PROFILE_PHOTO_RETRY_EDGE_PX, 0.68);
      preparedFile = new File(prepared.uri);
    }

    if (!preparedFile.exists || preparedFile.size <= 0) {
      throw new ProfilePhotoUploadError(
        'The normalized image file is unreadable.',
        'PROFILE_PHOTO_UNSUPPORTED',
      );
    }
    if (preparedFile.size > PROFILE_PHOTO_MAX_BYTES) {
      throw new ProfilePhotoUploadError(
        'The normalized profile photo exceeds the 2 MB upload limit.',
        'PROFILE_PHOTO_TOO_LARGE',
        413,
      );
    }

    if (__DEV__) {
      console.log('[ProfilePhoto] normalized asset', {
        uri: prepared.uri,
        mimeType: 'image/jpeg',
        fileName: preparedFile.name,
        fileSize: preparedFile.size,
        width: prepared.width,
        height: prepared.height,
      });
    }

    return {
      uri: prepared.uri,
      fileName: `profile-${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      fileSize: preparedFile.size,
    };
  } catch (error) {
    if (error instanceof ProfilePhotoUploadError) throw error;
    throw new ProfilePhotoUploadError(
      error instanceof Error ? error.message : 'The selected image could not be prepared.',
      'PROFILE_PHOTO_UNSUPPORTED',
    );
  }
}
