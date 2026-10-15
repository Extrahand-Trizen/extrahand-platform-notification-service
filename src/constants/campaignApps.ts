/**
 * Apps an admin broadcast can target. Values follow the user-service auth channels.
 * - `userServiceRole` → audience bucket for user-service `match-users` (type `role`)
 * - `recipientRole`   → `data.recipientRole` tag each app's feed filters on
 */
export const CAMPAIGN_APPS = {
  customer_app: { userServiceRole: 'customer', recipientRole: 'customer' },
  helper_app: { userServiceRole: 'helper', recipientRole: 'helper' },
  seller_app: { userServiceRole: 'seller', recipientRole: 'seller' },
} as const;

export type CampaignApp = keyof typeof CAMPAIGN_APPS;

export const ADMIN_BROADCAST_SOURCE = 'admin_broadcast';
export const ADMIN_BROADCAST_EVENT_KEY = 'ADMIN_BROADCAST';

export function isCampaignApp(value: unknown): value is CampaignApp {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CAMPAIGN_APPS, value);
}
