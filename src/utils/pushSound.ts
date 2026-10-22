/**
 * Custom push sounds apply to matching alerts, Book Now offers, and partner assignments.
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

export function usesMobileProjectFcm(input: {
  type?: string;
  data?: Record<string, unknown> | null;
}): boolean {
  const data = input.data && typeof input.data === 'object' ? input.data : {};
  const eventKey = normalizeEventKey(data.eventKey ?? data.event_key ?? input.type);
  const action = String(data.action ?? '').trim().toLowerCase();
  const recipientRole = String(data.recipientRole ?? '').trim().toLowerCase();

  // Mobile roles
  if (
    recipientRole === 'customer' ||
    recipientRole === 'seller' ||
    recipientRole === 'partner' ||
    recipientRole === 'helper' ||
    recipientRole === 'tasker' ||
    recipientRole === 'poster' ||
    recipientRole === 'requester'
  ) {
    return true;
  }

  // Lifecycle actions
  if (
    action === 'booking_confirmed' ||
    action === 'task_posted' ||
    action === 'assigned' ||
    action === 'apply_qc_order' ||
    action === 'rate_task' ||
    action === 'rescheduled'
  ) {
    return true;
  }

  // Mobile event keys
  return (
    eventKey === 'BOOK_NOW_PARTNER_ASSIGNED' ||
    (eventKey === 'TASK_NEARBY' &&
      String(data.bookingSource ?? data.booking_source ?? '').trim().toLowerCase() === 'quick_commerce' &&
      action === 'apply_qc_order') ||
    (eventKey === 'TASK_UPDATED' && action === 'assigned') ||
    isPartnerBookNowOffer(data, eventKey)
    eventKey.startsWith('QC_') ||
    eventKey.startsWith('BOOK_NOW_') ||
    eventKey.startsWith('TASK_') ||
    eventKey.startsWith('APPLICATION_') ||
    eventKey.startsWith('OFFER_') ||
    eventKey.startsWith('NEGOTIATION_') ||
    eventKey.startsWith('PAYMENT_') ||
    eventKey.startsWith('REFUND_') ||
    eventKey.startsWith('PAYOUT_') ||
    eventKey === 'HELPER_ON_THE_WAY' ||
    eventKey === 'REVIEW_REQUEST' ||
    eventKey === 'MESSAGE' ||
    eventKey === 'CHAT'
  );
}

function isPartnerWorkAssignment(data: Record<string, unknown>, eventKey: string): boolean {
  return eventKey === 'TASK_UPDATED' && String(data.action ?? '').trim().toLowerCase() === 'assigned';
}

function isPartnerBookNowOffer(data: Record<string, unknown>, eventKey: string): boolean {
  return (
    eventKey === 'TASK_UPDATED' &&
    String(data.action ?? '').trim().toLowerCase() === 'book_now_offer' &&
    String(data.recipientRole ?? '').trim().toLowerCase() === 'partner' &&
    String(data.bookingSource ?? data.booking_source ?? '').trim().toLowerCase() === 'book_now'
  );
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

  if (isPartnerWorkAssignment(data, eventKey) || isPartnerBookNowOffer(data, eventKey)) return true;

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
  apns: {
    headers: { 'apns-priority': string; 'apns-push-type': string };
    payload: { aps: { alert: { title: string; body: string }; sound: string; badge: number } };
  };
} {
  const data = input.data && typeof input.data === 'object' ? input.data : {};
  const eventKey = normalizeEventKey(data.eventKey ?? data.event_key ?? input.type);
  const alertText = {
    title: String(data.title || input.type || 'ExtraHand'),
    body: String(data.body || ''),
  };
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
    // Book Now and partner work assignments use the dedicated ring sound.
    if (
      eventKey === 'BOOK_NOW_PARTNER_ASSIGNED' ||
      isPartnerWorkAssignment(data, eventKey) ||
      isPartnerBookNowOffer(data, eventKey)
    ) {
      return {
        android: {
          priority: 'high',
          notification: {
            sound: PUSH_BOOK_NOW_RING_SOUND_ANDROID,
            channelId: PUSH_ANDROID_BOOK_NOW_RING_CHANNEL_ID,
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
            'apns-push-type': 'alert',
          },
          payload: {
            aps: {
              alert: alertText,
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
        headers: {
          'apns-priority': '10',
          'apns-push-type': 'alert',
        },
        payload: {
          aps: {
            alert: alertText,
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
      headers: {
        'apns-priority': '10',
        'apns-push-type': 'alert',
      },
      payload: {
        aps: {
          alert: alertText,
          sound: 'default',
          badge: 1,
        },
      },
    },
  };
}
