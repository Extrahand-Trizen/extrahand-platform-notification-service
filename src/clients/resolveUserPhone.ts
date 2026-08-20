import axios from 'axios';
import logger from '../config/logger';
import { validateEnv } from '../config/env';

/** Digits-only phone for dialog Meta send (8–15 digits after normalize). */
export function normalizePhoneForDialog(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  // Prefer India E.164 without plus for Meta (dialog strips non-digits anyway).
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

/**
 * Resolve user phone for WhatsApp via user-service internal profile API.
 */
export async function resolveUserPhoneDigits(uid: string): Promise<string | null> {
  const env = validateEnv();
  if (!env.USER_SERVICE_URL || !uid) return null;

  try {
    const response = await axios.get(
      `${env.USER_SERVICE_URL.replace(/\/$/, '')}/api/v1/profiles/internal/${encodeURIComponent(uid)}`,
      {
        headers: {
          'X-Service-Auth': env.SERVICE_AUTH_TOKEN || '',
          'X-Service-Name': 'notification-service',
        },
        timeout: 5000,
      },
    );

    const profile = response.data?.profile ?? response.data?.data?.profile ?? response.data?.data;
    const phone =
      profile?.phone ||
      profile?.mobile ||
      profile?.phoneNumber ||
      profile?.alternatePhone ||
      null;

    return normalizePhoneForDialog(phone);
  } catch (error: any) {
    logger.warn('resolveUserPhoneDigits failed', {
      uid,
      message: error?.message || 'Unknown error',
      status: error?.response?.status,
    });
    return null;
  }
}
