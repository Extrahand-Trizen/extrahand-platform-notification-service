/**
 * Verifies `role=seller` in-app filtering: a seller sees only
 * `data.recipientRole === 'seller'` notifications, never customer / helper /
 * legacy-untagged ones. Run: `npx ts-node src/scripts/testSellerRoleFilter.ts`
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectMongo } from '../config/database';
import InAppNotification from '../models/InAppNotification';
import { NotificationService } from '../services/NotificationService';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ok  ${msg}`);
}

async function run() {
  await connectMongo(process.env.MONGODB_URI as string);
  const userId = `role-test-${Date.now()}`;

  await InAppNotification.create([
    { userId, title: 'QC new order', body: 'x', category: 'orders', data: { recipientRole: 'seller', eventKey: 'QC_ORDER_PLACED' } },
    { userId, title: 'QC order accepted', body: 'x', category: 'orders', data: { recipientRole: 'customer', eventKey: 'QC_ORDER_ACCEPTED' } },
    { userId, title: 'Task assigned', body: 'x', category: 'taskUpdates', data: { recipientRole: 'tasker' } },
    { userId, title: 'Legacy untagged', body: 'x', category: 'system', data: {} },
  ]);

  const seller = await NotificationService.getInAppNotifications(userId, 50, 0, false, 'seller');
  const titles = seller.notifications.map((n: any) => n.title).sort();
  assert(seller.notifications.length === 1, `seller sees exactly 1 notification (got ${seller.notifications.length}: ${titles.join(', ')})`);
  assert(titles[0] === 'QC new order', 'the one seller notification is the QC seller order');
  assert(seller.unreadCount === 1, `seller unread count is 1 (got ${seller.unreadCount})`);

  const noFilter = await NotificationService.getInAppNotifications(userId, 50, 0, false);
  assert(noFilter.notifications.length === 4, `no-filter still returns all 4 (got ${noFilter.notifications.length})`);

  const helper = await NotificationService.getInAppNotifications(userId, 50, 0, false, 'helper');
  const helperTitles = helper.notifications.map((n: any) => n.title).sort();
  assert(!helperTitles.includes('QC new order'), `helper feed no longer leaks the seller order (got ${helperTitles.join(', ')})`);

  // mark-all + clear are scoped too
  const marked = await NotificationService.markAllInAppNotificationsAsRead(userId, 'seller');
  assert(marked.modifiedCount === 1, `mark-all(seller) touched only 1 (got ${marked.modifiedCount})`);
  const customerStillUnread = await NotificationService.getUnreadNotificationCount(userId, 'partner');
  assert(customerStillUnread === 1, `customer notification still unread after seller mark-all (got ${customerStillUnread})`);

  await InAppNotification.deleteMany({ userId });
  console.log('\nALL CHECKS PASSED\n');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
