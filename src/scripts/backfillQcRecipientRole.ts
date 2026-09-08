/**
 * One-off backfill: tag existing quick-commerce in-app notifications with
 * `data.recipientRole` so they keep showing after the `role=seller` filter
 * goes live. Only touches rows where recipientRole is currently unset AND the
 * eventKey is a known QC event. Idempotent. Pass `--dry` to preview counts.
 *
 * Run: `npx ts-node src/scripts/backfillQcRecipientRole.ts [--dry]`
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectMongo } from '../config/database';
import InAppNotification from '../models/InAppNotification';

const SELLER_EVENTS = ['QC_ORDER_PLACED', 'QC_ORDER_AUTO_REJECTED', 'QC_SHOP_AUTO_PAUSED', 'QC_SHOP_REOPENED'];
const CUSTOMER_EVENTS = [
  'QC_ORDER_ACCEPTED', 'QC_ORDER_PREPARING', 'QC_ORDER_REJECTED', 'QC_ORDER_READY',
  'QC_ORDER_HANDED_OVER', 'QC_ORDER_TIMED_OUT', 'QC_ORDER_PREP_EXTENDED',
];

const untagged = { $or: [{ 'data.recipientRole': { $exists: false } }, { 'data.recipientRole': null }, { 'data.recipientRole': '' }] };

async function run() {
  const dry = process.argv.includes('--dry');
  await connectMongo(process.env.MONGODB_URI as string);

  for (const [role, events] of [['seller', SELLER_EVENTS], ['customer', CUSTOMER_EVENTS]] as const) {
    const filter = { ...untagged, 'data.eventKey': { $in: events } };
    const count = await InAppNotification.countDocuments(filter);
    if (dry) {
      console.log(`[dry] would set recipientRole='${role}' on ${count} notification(s)`);
      continue;
    }
    const res = await InAppNotification.updateMany(filter, { $set: { 'data.recipientRole': role } });
    console.log(`set recipientRole='${role}' on ${res.modifiedCount}/${count} notification(s)`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
