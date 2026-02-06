import api from './api';

export const EmailService = {
  /**
   * Generate a 6-digit OTP
   */
  generateOtp: (): string => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  },

  /**
   * Send OTP via backend API (uses Brevo SMTP)
   */
  sendOtp: async (userEmail: string, otp: string): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log('📧 [EMAIL SERVICE] Sending OTP via API:', { email: userEmail });

      const response = await api.post('/auth/send-otp', {
        email: userEmail,
        otp
      });

      if (response.data?.success) {
        return { success: true };
      } else {
        return { success: false, error: response.data?.message || 'Failed to send OTP' };
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message;
      return { success: false, error: errorMessage };
    }
  },
};