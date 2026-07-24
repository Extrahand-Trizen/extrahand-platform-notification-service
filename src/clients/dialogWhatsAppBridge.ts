import logger from '../config/logger';
import { DialogWhatsAppClient } from './DialogWhatsAppClient';
import { resolveUserPhoneDigits } from './resolveUserPhone';
import { canSendWhatsApp } from './canSendWhatsApp';
import type { NotificationPayload } from '../types';

function mapCategoryForWhatsApp(category: string | undefined): string {
  const c = String(category || 'taskUpdates').trim();
  const allowed = new Set([
    'taskUpdates',
    'payments',
    'taskReminders',
    'keywordTaskAlerts',
    'recommendedTaskAlerts',
    'helpfulInformation',
    'updatesNewsletters',
  ]);
  return allowed.has(c) ? c : 'taskUpdates';
}

/** Sanitize eventKey for dialog ingest: /^[a-zA-Z0-9._-]+$/ */
export function toDialogEventKey(raw: string | undefined): string | null {
  const key = String(raw || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '');
  if (!key || key.length > 120) return null;
  return key;
}

function buildIdempotencyKey(
  userId: string,
  eventKey: string,
  data?: Record<string, unknown>,
): string {
  const entity =
    String(
      data?.entityId ||
        data?.taskId ||
        data?.applicationId ||
        data?.orderId ||
        data?.eventId ||
        '',
    ).trim() || 'na';
  const minute = Math.floor(Date.now() / 60000);
  return `eh-push:${userId}:${eventKey}:${entity}:${minute}`.slice(0, 200);
}

/**
 * After a push notification is allowed, optionally mirror to WhatsApp via dialog-backend.
 * Never throws — failures are logged only.
 */
export function fireDialogWhatsAppForPush(
  userId: string,
  notification: Omit<NotificationPayload, 'userId'>,
): void {
  if (!DialogWhatsAppClient.isConfigured()) return;

  void (async () => {
    try {
      const eventKey = toDialogEventKey(notification.type);
      if (!eventKey) {
        logger.warn('Dialog WhatsApp skipped: invalid eventKey', {
          userId,
          type: notification.type,
        });
        return;
      }

      const category = mapCategoryForWhatsApp(notification.category);
      const canSendWa = await canSendWhatsApp(userId, category);
      if (!canSendWa) {
        logger.warn('Dialog WhatsApp skipped: preferences disabled', {
          userId,
          category,
          eventKey,
        });
        return;
      }

      const phone = await resolveUserPhoneDigits(userId);
      if (!phone) {
        logger.warn('Dialog WhatsApp skipped: no phone on profile', { userId, eventKey });
        return;
      }

      const data = (notification.data || {}) as Record<string, unknown>;
      const title = notification.title;
      const body = notification.body;

      // Derived fields so Dialog template slots resolve even when push `data`
      // only has ids / partial labels (Meta templates need named body vars).
      const taskTitle =
        String(data.taskTitle || data.taskName || data.workTitle || '').trim() ||
        title;
      const categoryLabel = (() => {
        const raw =
          data.skillMatchCategory ||
          data.categoryLabel ||
          data.category ||
          data.matchedKeywords;
        if (Array.isArray(raw)) {
          return String(raw.slice(0, 2).join(', ') || 'work');
        }
        return String(raw || 'work').trim() || 'work';
      })();
      const locationLabel =
        String(data.locationLabel || data.location || data.city || '').trim() ||
        'your area';
      const applicantName =
        String(data.applicantName || data.taskerName || data.helperName || '').trim() ||
        'A helper';
      const scheduledLabel =
        String(
          data.scheduledLabel ||
            data.scheduledDate ||
            data.scheduledAt ||
            data.reminderAt ||
            '',
        ).trim() || body;

      const taskId = String(
        data.taskId || data.workId || data.entityId || '',
      ).trim();

      const payload: Record<string, unknown> = {
        title,
        body,
        category: notification.category || 'taskUpdates',
        ...data,
        taskTitle,
        categoryLabel,
        locationLabel,
        applicantName,
        scheduledLabel,
        ...(taskId ? { taskId } : {}),
      };

      await DialogWhatsAppClient.triggerNotification({
        eventKey,
        recipientPhone: phone,
        payload,
        idempotencyKey: buildIdempotencyKey(userId, eventKey, notification.data),
      });
    } catch (err: unknown) {
      logger.warn('Dialog WhatsApp bridge error (non-fatal)', {
        userId,
        type: notification.type,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}
