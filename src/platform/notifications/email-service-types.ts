/**
 * Email Service Types and Interfaces
 */

export interface EmailConfig {
  apiKey: string;
  fromEmail: string;
  fromName?: string;
}

export interface EmailNotification {
  to: string;
  subject: string;
  body: string;
  html?: string;
}
