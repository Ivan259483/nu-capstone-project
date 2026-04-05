/**
 * Core Validation Utilities for AutoSPF+
 * 
 * Provides robust regex, object verifications, and heuristic checkers to
 * ensure reliable UI states and prevent malformed data injections.
 */

export const RegexRules = {
  // E.g., name@example.com (RFC 5322 approximation)
  email: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/,
  
  // Philippine Standard: +639171234567 or 09171234567
  phPhone: /^(?:\+63|0)9[0-9]{9}$/,
  
  // Requires at least 8 chars, 1 uppercase, 1 lowercase, 1 number
  passwordStrong: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d\w\W]{8,}$/,
};

export const Validation = {
  isValidEmail(email: string): boolean {
    return RegexRules.email.test(email);
  },

  isValidPhone(phone: string): boolean {
    return RegexRules.phPhone.test(phone);
  },

  isStrongPassword(password: string): boolean {
    return RegexRules.passwordStrong.test(password);
  },

  isValidName(name: string): boolean {
    return name.trim().length >= 3;
  },

  /**
   * Validates if an image file size is within acceptable limits.
   * Useful for pre-flight checks before S3/Appwrite bucket uploads.
   * @param sizeInBytes Raw bytes
   * @param maxSizeMB Maximum size in Megabytes (default 10MB)
   */
  isValidImageSize(sizeInBytes: number, maxSizeMB: number = 10): boolean {
    const maxSize = maxSizeMB * 1024 * 1024;
    return sizeInBytes <= maxSize;
  },

  /**
   * Check for acceptable image formats (case-insensitive)
   */
  isValidImageFormat(mimeTypeOrExtension: string): boolean {
    const m = mimeTypeOrExtension.toLowerCase();
    return (
      m.includes('jpeg') || 
      m.includes('jpg') || 
      m.includes('png') ||
      m.includes('webp') // Add webp just in case they have it
    );
  }
};
