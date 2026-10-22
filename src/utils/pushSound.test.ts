import assert from 'node:assert';
import test from 'node:test';
import {
  usesMobileProjectFcm,
  buildPushSoundPayload,
} from './pushSound';

test('usesMobileProjectFcm returns true for customer booking confirmation', () => {
  const result = usesMobileProjectFcm({
    type: 'TASK_UPDATED',
    data: {
      action: 'booking_confirmed',
      recipientRole: 'customer',
      bookingSource: 'book_now',
      taskId: 'task123',
    },
  });
  assert.strictEqual(result, true);
});

test('usesMobileProjectFcm returns true for task_posted confirmation', () => {
  const result = usesMobileProjectFcm({
    type: 'TASK_UPDATED',
    data: {
      action: 'task_posted',
      recipientRole: 'customer',
      taskId: 'task456',
    },
  });
  assert.strictEqual(result, true);
});

test('usesMobileProjectFcm returns true for all mobile roles', () => {
  assert.strictEqual(usesMobileProjectFcm({ data: { recipientRole: 'customer' } }), true);
  assert.strictEqual(usesMobileProjectFcm({ data: { recipientRole: 'partner' } }), true);
  assert.strictEqual(usesMobileProjectFcm({ data: { recipientRole: 'helper' } }), true);
  assert.strictEqual(usesMobileProjectFcm({ data: { recipientRole: 'tasker' } }), true);
  assert.strictEqual(usesMobileProjectFcm({ data: { recipientRole: 'seller' } }), true);
  assert.strictEqual(usesMobileProjectFcm({ data: { recipientRole: 'poster' } }), true);
  assert.strictEqual(usesMobileProjectFcm({ data: { recipientRole: 'requester' } }), true);
});

test('usesMobileProjectFcm returns true for task and booking events', () => {
  assert.strictEqual(usesMobileProjectFcm({ type: 'TASK_UPDATED' }), true);
  assert.strictEqual(usesMobileProjectFcm({ type: 'BOOK_NOW_PARTNER_ASSIGNED' }), true);
  assert.strictEqual(usesMobileProjectFcm({ type: 'TASK_NEARBY' }), true);
  assert.strictEqual(usesMobileProjectFcm({ type: 'HELPER_ON_THE_WAY' }), true);
  assert.strictEqual(usesMobileProjectFcm({ type: 'REVIEW_REQUEST' }), true);
});

test('buildPushSoundPayload includes apns alert with title and body and priority 10', () => {
  const payload = buildPushSoundPayload({
    type: 'TASK_UPDATED',
    category: 'taskUpdates',
    data: {
      title: 'Booking Confirmed',
      body: 'Your booking has been placed.',
      action: 'booking_confirmed',
      recipientRole: 'customer',
    },
  });

  assert.strictEqual(payload.apns.headers['apns-priority'], '10');
  assert.strictEqual(payload.apns.headers['apns-push-type'], 'alert');
  assert.strictEqual(payload.apns.payload.aps.alert.title, 'Booking Confirmed');
  assert.strictEqual(payload.apns.payload.aps.alert.body, 'Your booking has been placed.');
  assert.strictEqual(payload.apns.payload.aps.sound, 'default');
  assert.strictEqual(payload.apns.payload.aps.badge, 1);
});
