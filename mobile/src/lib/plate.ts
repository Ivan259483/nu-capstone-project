/** Plate display/storage: uppercase letters & digits only (spaces/punctuation stripped). */
export function normalizePlateNumber(input: string): string {
  return String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}
