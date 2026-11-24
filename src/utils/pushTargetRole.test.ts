import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePushTargetRole } from './pushTargetRole';

test('routes helper-on-the-way OTP pushes to customer devices', () => {
  assert.equal(
    resolvePushTargetRole({ eventKey: 'HELPER_ON_THE_WAY', category: 'taskUpdates' }),
    'customer',
  );
});

test('keeps other helper events scoped to partner devices', () => {
  assert.equal(
    resolvePushTargetRole({ eventKey: 'HELPER_ASSIGNED', category: 'taskUpdates' }),
    'partner',
  );
});

test('explicit recipient roles override event defaults', () => {
  assert.equal(
    resolvePushTargetRole({
      eventKey: 'HELPER_ON_THE_WAY',
      category: 'taskUpdates',
      explicitRole: ' customer ',
    }),
    'customer',
  );
});

test('routes payment received and refunds to customer devices', () => {
  assert.equal(
    resolvePushTargetRole({ eventKey: 'PAYMENT_RECEIVED', category: 'payments' }),
    'customer',
  );
  assert.equal(
    resolvePushTargetRole({ eventKey: 'REFUND_PROCESSED', category: 'payments' }),
    'customer',
  );
});

test('routes payouts to partner devices', () => {
  assert.equal(
    resolvePushTargetRole({ eventKey: 'PAYOUT_COMPLETED', category: 'payments' }),
    'partner',
  );
});
