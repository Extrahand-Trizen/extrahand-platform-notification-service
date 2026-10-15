import { Request } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    token: DecodedIdToken;
  };
}

export interface NotificationPreferences {
  payments: { email: boolean; push: boolean; sms: boolean };
  taskUpdates: { email: boolean; push: boolean; sms: boolean };
  taskReminders: { email: boolean; push: boolean; sms: boolean };
  keywordTaskAlerts: { push: boolean };
  recommendedTaskAlerts: { push: boolean };
  helpfulInformation: { email: boolean; push: boolean; sms: boolean };
  updatesNewsletters: { email: boolean; push: boolean; sms: boolean };
}

export interface FCMToken {
  token: string;
  platform: 'ios' | 'android' | 'web';
  deviceId?: string;
  lastActive: Date;
}

export interface NotificationPayload {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  category?: keyof NotificationPreferences;
  /** Shown as the large image on the system notification card. */
  imageUrl?: string;
  /** Do not mirror this push to WhatsApp (e.g. admin broadcasts). */
  skipWhatsApp?: boolean;
}



























