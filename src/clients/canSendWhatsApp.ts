import axios from 'axios';
import logger from '../config/logger';
import { validateEnv } from '../config/env';

/**
 * Ask user-service whether WhatsApp is allowed for this uid + category.
 * Fail-closed on errors (respect Settings toggle).
 */
export async function canSendWhatsApp(
  userId: string,
  category: string,
): Promise<boolean> {
  const env = validateEnv();
  if (!env.USER_SERVICE_URL || !userId) return false;

  try {
    const response = await axios.get(
      `${env.USER_SERVICE_URL.replace(/\/$/, '')}/api/v1/notification-preferences/${encodeURIComponent(userId)}/can-send`,
      {
        params: {
          channel: 'whatsapp',
          category: category || 'taskUpdates',
        },
        headers: {
          'X-Service-Auth': env.SERVICE_AUTH_TOKEN || '',
          'X-Service-Name': 'notification-service',
        },
        timeout: 5000,
      },
    );
    const canSend = response.data?.data?.canSend;
    return canSend === true;
  } catch (error: any) {
    logger.warn('canSendWhatsApp failed — blocking WhatsApp', {
      userId,
      category,
      message: error?.message || 'Unknown error',
    });
    return false;
  }
}
