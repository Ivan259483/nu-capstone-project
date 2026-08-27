import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';

const PROFILE_PHOTO_EDGE_PX = 720;

/**
 * Profile photos never need full camera resolution. Resizing before upload keeps
 * the multipart request comfortably below the API's 2 MB limit on mobile data.
 */
export async function prepareProfilePhoto(asset: ImagePickerAsset) {
  const targetWidth = Math.min(PROFILE_PHOTO_EDGE_PX, Math.max(1, asset.width));
  const prepared = await manipulateAsync(
    asset.uri,
    [{ resize: { width: targetWidth } }],
    { compress: 0.72, format: SaveFormat.JPEG },
  );

  return {
    uri: prepared.uri,
    fileName: `profile-${Date.now()}.jpg`,
    mimeType: 'image/jpeg',
  };
}
