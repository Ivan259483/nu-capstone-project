const IMAGE_DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=\s]+)$/i;

/**
 * Safari can leave large base64 data-URI images waiting on an `onLoad` event.
 * Converting the persisted proof to a Blob URL gives the browser a normal,
 * decodable image resource without changing or re-uploading the receipt.
 */
export function paymentProofDataUrlToBlob(source: string): Blob | null {
  const match = String(source || '').match(IMAGE_DATA_URL_PATTERN);
  if (!match) return null;

  try {
    const binary = atob(match[2].replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: match[1].toLowerCase() });
  } catch {
    return null;
  }
}

export function isInlinePaymentProof(source: string): boolean {
  return String(source || '').startsWith('data:image/');
}
