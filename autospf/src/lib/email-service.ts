const SERVICE_ID = 'service_uvd7x9o';
const TEMPLATE_ID = 'template_pkumzpa';
const PUBLIC_KEY = '14LBopo14yNJULiG';
const PRIVATE_KEY = 'oIC6GlsuIsqCMm3X8dVWV';
const EMAILJS_URL = 'https://api.emailjs.com/api/v1.0/email/send';

interface EmailParams {
  to_email: string;
  to_name?: string;
  from_name?: string;
  subject?: string;
  message: string;
  reply_to?: string;
  cc?: string;
  bcc?: string;
  attachments?: Array<{
    name: string;
    content: string;
    type: string;
  }>;
}

interface EmailResponse {
  success: boolean;
  message: string;
  error?: string;
  statusCode?: number;
}

interface EmailServiceConfig {
  serviceId?: string;
  templateId?: string;
  publicKey?: string;
  privateKey?: string;
  retryAttempts?: number;
  retryDelay?: number;
}

class EmailServiceClass {
  private serviceId: string;
  private templateId: string;
  private publicKey: string;
  private privateKey: string;
  private retryAttempts: number;
  private retryDelay: number;
  private requestQueue: Array<() => Promise<any>> = [];
  private isProcessingQueue: boolean = false;

  constructor(config: EmailServiceConfig = {}) {
    this.serviceId = config.serviceId || SERVICE_ID;
    this.templateId = config.templateId || TEMPLATE_ID;
    this.publicKey = config.publicKey || PUBLIC_KEY;
    this.privateKey = config.privateKey || PRIVATE_KEY;
    this.retryAttempts = config.retryAttempts || 3;
    this.retryDelay = config.retryDelay || 1000;
  }

  /**
   * Generate a unique OTP (One-Time Password)
   * @returns 6-digit OTP as string
   */
  generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Generate a unique tracking ID for emails
   * @returns Unique tracking ID
   */
  private generateTrackingId(): string {
    return `EMAIL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add request to queue to prevent rate limiting
   */
  private async addToQueue<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const result = await request();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }

  /**
   * Process queued email requests
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      if (request) {
        await request();
        // Add delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Retry logic for failed requests
   */
  private async retryRequest<T>(
    request: () => Promise<T>,
    attempt: number = 0
  ): Promise<T> {
    try {
      return await request();
    } catch (error) {
      if (attempt < this.retryAttempts) {
        console.log(`Retry attempt ${attempt + 1}/${this.retryAttempts}`);
        await new Promise(resolve => 
          setTimeout(resolve, this.retryDelay * Math.pow(2, attempt))
        );
        return this.retryRequest(request, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Send email using EmailJS REST API
   */
  async sendEmail(params: EmailParams): Promise<EmailResponse> {
    return this.addToQueue(async () => {
      return this.retryRequest(async () => {
        try {
          const trackingId = this.generateTrackingId();
          
          console.log('Sending Email via REST API:', {
            url: EMAILJS_URL,
            serviceId: this.serviceId,
            templateId: this.templateId,
            userId: this.publicKey,
            trackingId,
            to: params.to_email,
          });

          const response = await fetch(EMAILJS_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              service_id: this.serviceId,
              template_id: this.templateId,
              user_id: this.publicKey,
              accessToken: this.privateKey,
              template_params: {
                ...params,
                tracking_id: trackingId,
                timestamp: new Date().toISOString(),
              },
            }),
          });

          if (response.ok) {
            const responseText = await response.text();
            console.log('Email sent successfully:', {
              trackingId,
              statusCode: response.status,
              response: responseText,
            });

            return {
              success: true,
              message: 'Email sent successfully',
              statusCode: response.status,
            };
          } else {
            const errorText = await response.text();
            console.error('Email send failed:', {
              trackingId,
              statusCode: response.status,
              error: errorText,
            });

            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }
        } catch (error) {
          console.error('Email send error:', error);
          
          return {
            success: false,
            message: 'Failed to send email',
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      });
    });
  }

  /**
   * Send OTP email
   */
  async sendOtp(userEmail: string, otp?: string): Promise<EmailResponse> {
    const generatedOtp = otp || this.generateOtp();

    return this.sendEmail({
      to_email: userEmail,
      subject: 'Your OTP Code',
      message: `Your OTP code is: ${generatedOtp}. This code will expire in 10 minutes.`,
      from_name: 'AutoSPF Security',
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(
    userEmail: string,
    userName: string
  ): Promise<EmailResponse> {
    return this.sendEmail({
      to_email: userEmail,
      to_name: userName,
      subject: 'Welcome to AutoSPF!',
      message: `Hi ${userName},\n\nWelcome to AutoSPF! We're excited to have you on board.\n\nBest regards,\nThe AutoSPF Team`,
      from_name: 'AutoSPF Team',
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    userEmail: string,
    resetToken: string,
    resetUrl?: string
  ): Promise<EmailResponse> {
    const url = resetUrl || `${window.location.origin}/reset-password?token=${resetToken}`;

    return this.sendEmail({
      to_email: userEmail,
      subject: 'Password Reset Request',
      message: `You requested a password reset. Click the link below to reset your password:\n\n${url}\n\nIf you didn't request this, please ignore this email.\n\nThis link will expire in 1 hour.`,
      from_name: 'AutoSPF Security',
    });
  }

  /**
   * Send notification email
   */
  async sendNotificationEmail(
    userEmail: string,
    subject: string,
    message: string,
    userName?: string
  ): Promise<EmailResponse> {
    return this.sendEmail({
      to_email: userEmail,
      to_name: userName,
      subject,
      message,
      from_name: 'AutoSPF Notifications',
    });
  }

  /**
   * Send bulk emails (with rate limiting)
   */
  async sendBulkEmails(
    emails: Array<{ email: string; params: Partial<EmailParams> }>
  ): Promise<EmailResponse[]> {
    const results: EmailResponse[] = [];

    for (const { email, params } of emails) {
      const result = await this.sendEmail({
        to_email: email,
        ...params,
        message: params.message || '',
      });
      results.push(result);
      
      // Add delay between bulk sends
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  /**
   * Validate email format
   */
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Update service configuration
   */
  updateConfig(config: Partial<EmailServiceConfig>): void {
    if (config.serviceId) this.serviceId = config.serviceId;
    if (config.templateId) this.templateId = config.templateId;
    if (config.publicKey) this.publicKey = config.publicKey;
    if (config.privateKey) this.privateKey = config.privateKey;
    if (config.retryAttempts) this.retryAttempts = config.retryAttempts;
    if (config.retryDelay) this.retryDelay = config.retryDelay;
  }
}

// Export singleton instance
export const EmailService = new EmailServiceClass();

// Export class for custom instances
export { EmailServiceClass };

// Export types
export type { EmailParams, EmailResponse, EmailServiceConfig };