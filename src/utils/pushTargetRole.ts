type PushTargetRoleInput = {
  eventKey?: unknown;
  category?: unknown;
  explicitRole?: unknown;
};

export function resolvePushTargetRole({
  eventKey: rawEventKey,
  category: rawCategory,
  explicitRole: rawExplicitRole,
}: PushTargetRoleInput): string | undefined {
  const explicitRole = String(rawExplicitRole ?? '').trim().toLowerCase();
  if (explicitRole) return explicitRole;

  const eventKey = String(rawEventKey || '').trim().toUpperCase();
  const category = String(rawCategory || '').trim();

  if (
    eventKey === 'QC_ORDER_PLACED' ||
    eventKey === 'QC_STOCK_OUT' ||
    eventKey === 'QC_SHOP_PAUSED'
  ) {
    return 'seller';
  }
  if (
    eventKey.startsWith('QC_ORDER_') ||
    eventKey === 'HELPER_ON_THE_WAY' ||
    eventKey === 'PAYMENT_RECEIVED' ||
    eventKey.startsWith('REFUND_') ||
    eventKey === 'TASK_CANCELLED_CUSTOMER' ||
    eventKey.endsWith('_CUSTOMER') ||
    eventKey === 'REVIEW_REQUEST' ||
    eventKey === 'TASK_COMPLETED'
  ) {
    return 'customer';
  }
  if (
    eventKey === 'BOOK_NOW_PARTNER_ASSIGNED' ||
    eventKey.startsWith('HELPER_') ||
    eventKey.startsWith('TASK_') ||
    eventKey.startsWith('OFFER_') ||
    eventKey.startsWith('PAYOUT_') ||
    category === 'recommendedTaskAlerts' ||
    category === 'keywordTaskAlerts'
  ) {
    return 'partner';
  }

  return undefined;
}
