/**
 * Custom push sound applies only to task-match alerts driven by profile
 * categories/skills (not keyword alerts or general task updates).
 */

export const PUSH_NOTIFICATION_SOUND_ANDROID = 'urgent_notify_single_ring';
export const PUSH_NOTIFICATION_SOUND_IOS = 'urgent_notify_single_ring.wav';
export const PUSH_ANDROID_MATCH_CHANNEL_ID = 'extrahand_match_alerts_v3';
export const PUSH_ANDROID_NEARBY_CHANNEL_ID = 'extrahand_nearby_alerts_v3';
export const PUSH_ANDROID_NEARBY_SKILL_CHANNEL_ID = 'extrahand_nearby_skill_alerts_v3';
export const PUSH_ANDROID_BOOK_NOW_RING_CHANNEL_ID = 'extrahand_book_now_ring_alerts';

// Book Now ring sound (15-second looping ring)
export const PUSH_BOOK_NOW_RING_SOUND_ANDROID = 'urgent_notify_10_seconds_gentle_loop';
export const PUSH_BOOK_NOW_RING_SOUND_IOS = 'urgent_notify_10_seconds_gentle_loop.mp3';

const CUSTOM_SOUND_EVENT_KEYS = new Set([
  'TASK_CREATED_RECOMMENDED',
  'TASK_CREATED_CATEGORY',
  'TASK_NEARBY',
  'BOOK_NOW_PARTNER_ASSIGNED',
]);

/** Events that must be rendered by the mobile Notifee layer (actions / largeIcon / expanded). */
const NOTIFEE_OWNED_EVENT_KEYS = new Set([
  'REVIEW_REQUEST',
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

/** True when FCM must be data-only so Notifee owns the tray UI. */
export function usesNotifeeOwnedPushDisplay(input: {
  type?: string;
  category?: string;
  data?: Record<string, unknown> | null;
}): boolean {
  if (usesCustomPushSound(input)) return true;

  const data = input.data && typeof input.data === 'object' ? input.data : {};
  const eventKey = normalizeEventKey(
    data.eventKey ?? data.event_key ?? input.type,
  );
  if (eventKey && NOTIFEE_OWNED_EVENT_KEYS.has(eventKey)) return true;

  const action = String(data.action ?? '').toLowerCase();
  if (action === 'rate_task') return true;
  if (String(data.openReview ?? data.open_review ?? '') === '1') return true;

  return false;
}

export function buildPushSoundPayload(input: {
  type?: string;
  category?: string;
  data?: Record<string, unknown> | null;
}): {
  android: { priority: 'high'; notification: { sound: string; channelId: string } };
  apns: { payload: { aps: { sound: string; badge: number } } };
} {
  const data = input.data && typeof input.data === 'object' ? input.data : {};
  const eventKey = normalizeEventKey(data.eventKey ?? data.event_key ?? input.type);
  const hasNearbyContext =
    typeof data.locationLabel === 'string' ||
    String(data.title ?? '').toLowerCase().includes('nearby') ||
    String(data.body ?? '').toLowerCase().includes('nearby');
  const hasSkillMatchContext =
    typeof data.skillMatchCategory === 'string' ||
    data.skillMatch === true ||
    data.skillMatch === 'true' ||
    String(data.title ?? '').toLowerCase().includes('skill');

  if (usesCustomPushSound(input)) {
    // Book Now ring uses its own dedicated channel and 15-second sound
    if (eventKey === 'BOOK_NOW_PARTNER_ASSIGNED') {
      return {
        android: {
          priority: 'high',
          notification: {
            sound: PUSH_BOOK_NOW_RING_SOUND_ANDROID,
            channelId: PUSH_ANDROID_BOOK_NOW_RING_CHANNEL_ID,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: PUSH_BOOK_NOW_RING_SOUND_IOS,
              badge: 1,
            },
          },
        },
      };
    }

    let channelId = PUSH_ANDROID_MATCH_CHANNEL_ID;
    if (eventKey === 'TASK_NEARBY') {
      channelId = hasSkillMatchContext
        ? PUSH_ANDROID_NEARBY_SKILL_CHANNEL_ID
        : PUSH_ANDROID_NEARBY_CHANNEL_ID;
    } else if (eventKey === 'TASK_CREATED_RECOMMENDED' && (hasNearbyContext || hasSkillMatchContext)) {
      channelId = PUSH_ANDROID_NEARBY_SKILL_CHANNEL_ID;
    }

    return {
      android: {
        priority: 'high',
        notification: {
          sound: PUSH_NOTIFICATION_SOUND_ANDROID,
          channelId,
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
