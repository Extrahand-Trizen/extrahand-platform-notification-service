/**
 * Custom push sound applies only to task-match alerts driven by profile
 * categories/skills (not keyword alerts or general task updates).
 */

export const PUSH_NOTIFICATION_SOUND_ANDROID = 'urgent_notify_single_ring';
export const PUSH_NOTIFICATION_SOUND_IOS = 'urgent_notify_single_ring.wav';
export const PUSH_ANDROID_MATCH_CHANNEL_ID = 'extrahand_match_alerts';

const CUSTOM_SOUND_EVENT_KEYS = new Set([
  'TASK_CREATED_RECOMMENDED',
  'TASK_CREATED_CATEGORY',
]);

function normalizeEventKey(value: unknown): string {
  if (value == null) return '';
  return String(value).toUpperCase().replace(/[\s-]+/g, '_');
}

export function usesCustomPushSound(input: {
  type?: string;
  category?: string;
  data?: Record<string, unknown> | null;
}): boolean {
  const data = input.data && typeof input.data === 'object' ? input.data : {};
  const eventKey = normalizeEventKey(
    data.eventKey ?? data.event_key ?? input.type,
  );

  if (eventKey && CUSTOM_SOUND_EVENT_KEYS.has(eventKey)) {
    return true;
  }

  const category = String(input.category ?? data.category ?? '').trim();
  return category === 'recommendedTaskAlerts';
}

export function buildPushSoundPayload(input: {
  type?: string;
  category?: string;
  data?: Record<string, unknown> | null;
}): {
  android: { priority: 'high'; notification: { sound: string; channelId: string } };
  apns: { payload: { aps: { sound: string; badge: number } } };
} {
  if (usesCustomPushSound(input)) {
    return {
      android: {
        priority: 'high',
        notification: {
          sound: PUSH_NOTIFICATION_SOUND_ANDROID,
          channelId: PUSH_ANDROID_MATCH_CHANNEL_ID,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: PUSH_NOTIFICATION_SOUND_IOS,
            badge: 1,
          },
        },
      },
    };
  }

  return {
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'default',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
        },
      },
    },
  };
}
