import axios from 'axios';
import logger from '../config/logger';
import { validateEnv } from '../config/env';

export type DialogTriggerInput = {
  eventKey: string;
  recipientPhone: string;
  payload?: Record<string, unknown>;
  idempotencyKey: string;
};

/**
 * Fire-and-forget WhatsApp via dialog-backend notification rules.
 * Templates / sender numbers are configured in dialog-frontend (rules + Meta templates).
 */
export class DialogWhatsAppClient {
  static isConfigured(): boolean {
    const env = validateEnv();
    return Boolean(
      env.DIALOG_WHATSAPP_ENABLED &&
        env.DIALOG_SERVICE_URL &&
        env.DIALOG_ORGANIZATION_ID &&
        env.SERVICE_AUTH_TOKEN,
    );
  }

  static async triggerNotification(input: DialogTriggerInput): Promise<boolean> {
    const env = validateEnv();
    if (!this.isConfigured()) {
      return false;
    }

    const base = String(env.DIALOG_SERVICE_URL).replace(/\/$/, '');
    const url = `${base}/api/v1/internal/notifications/trigger`;

    try {
      const response = await axios.post(
        url,
        {
          eventKey: input.eventKey,
          recipientPhone: input.recipientPhone,
          payload: input.payload ?? {},
          idempotencyKey: input.idempotencyKey.slice(0, 200),
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Service-Auth': env.SERVICE_AUTH_TOKEN || '',
            'X-Organization-Id': env.DIALOG_ORGANIZATION_ID || '',
            'X-Service-Name': 'notification-service',
          },
          timeout: 12000,
          validateStatus: (s) => s >= 200 && s < 300,
        },
      );

      logger.info('DialogWhatsAppClient: trigger accepted', {
        eventKey: input.eventKey,
        status: response.status,
        duplicate: response.data?.data?.duplicate,
        eventIngestId: response.data?.data?.eventIngestId,
      });
      return true;
    } catch (error: any) {
      logger.warn('DialogWhatsAppClient: trigger failed', {
        eventKey: input.eventKey,
        status: error?.response?.status,
        message: error?.message || 'Unknown error',
        responseData: error?.response?.data,
      });
      return false;
    }
  }
}
