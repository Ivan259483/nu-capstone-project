import { getBaseApiUrl } from '@/lib/api';

// Backend API configuration
export const BACKEND_API_URL = getBaseApiUrl();

export const EmailService = {
  /**
   * Generate a 6-digit OTP.
   * Kept only for backwards compatibility; the backend is the source of truth.
   */
  generateOtp: (): string => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  },

  /**
   * Send OTP via backend API.
   * The backend generates, stores, and emails the OTP. Do not send a client
   * generated code here, otherwise the UI can show/expect a different code
   * than the one saved in MongoDB.
   * 
   * @param userEmail - Email address to send OTP to
   * @param otp - Deprecated and ignored
   * @returns Response with success status and error message if failed
   */
  sendOtp: async (userEmail: string, otp?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const normalizedEmail = userEmail.trim().toLowerCase();
      console.log('📧 [EMAIL SERVICE] Sending OTP via Backend API:', {
        backendUrl: BACKEND_API_URL,
        email: normalizedEmail,
        clientOtpIgnored: Boolean(otp),
      });

      const requestBody = {
        email: normalizedEmail,
      };

      console.log('📧 [EMAIL SERVICE] Request body:', requestBody);

      const response = await fetch(`${BACKEND_API_URL}/auth/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('📧 [EMAIL SERVICE] Response status:', response.status, response.statusText);

      // Parse response
      const data = await response.json().catch((err) => {
        console.error('📧 [EMAIL SERVICE] Failed to parse JSON:', err);
        return null;
      });

      console.log('📧 [EMAIL SERVICE] Response data:', data);

      if (response.ok && data?.success) {
        console.log('✅ [EMAIL SERVICE] OTP sent successfully via backend:', {
          email: normalizedEmail,
          expiresIn: data.data?.expiresIn,
        });
        return { success: true };
      } else {
        const errorMessage = data?.message || data?.error || `HTTP ${response.status}`;
        console.error('❌ [EMAIL SERVICE] Backend failed to send OTP:', {
          status: response.status,
          statusText: response.statusText,
          error: errorMessage,
          details: data,
        });
        return { success: false, error: errorMessage };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ [EMAIL SERVICE] Failed to reach backend:', {
        error: errorMessage,
        backendUrl: BACKEND_API_URL,
        stack: error instanceof Error ? error.stack : 'no stack',
      });
      return {
        success: false,
        error: `Could not reach server: ${errorMessage}. Make sure backend is running on port 3000.`
      };
    }
  },
};
