import dotenv from 'dotenv'; dotenv.config();
import mongoose from 'mongoose';
import { connectMongo } from '../config/database';
import FCMToken from '../models/FCMToken';
import { NotificationService } from '../services/NotificationService';

const SUITE = [
  { eventKey: 'QC_ORDER_PLACED',      title: 'New grocery order',        body: 'Order QC-2001 — 3 items · ₹240' },
  { eventKey: 'QC_ORDER_AUTO_REJECTED', title: 'Order missed — auto-rejected', body: "Order QC-2002 wasn't accepted in time." },
  { eventKey: 'QC_SHOP_AUTO_PAUSED',  title: 'Orders paused',            body: '3 orders were rejected or missed. Your shop is paused.' },
  { eventKey: 'QC_SHOP_REOPENED',     title: 'Orders open again',        body: 'Your pause is over — customers can order again.' },
  { eventKey: 'QC_STOCK_OUT',         title: 'Amul Milk 1L is out of stock', body: 'Tap to restock.' },
  { eventKey: 'QC_PAYOUT_SETTLED',    title: 'Payout settled',           body: '₹1,240 credited to your bank account.' },
];

async function run() {
  await connectMongo(process.env.MONGODB_URI as string);
  const tok = await FCMToken.findOne({ platform: 'android' }).sort({ updatedAt: -1 }).lean();
  const userId = process.argv[2] || tok!.userId;
  console.log('sending', SUITE.length, 'seller notifications to', userId, '\n');
  for (const n of SUITE) {
    const res = await NotificationService.createInAppNotification({
      userId, title: n.title, body: n.body, type: 'info', category: 'system' as any,
      data: { eventKey: n.eventKey, recipientRole: 'seller', category: 'system' },
    });
    console.log(`  ${n.eventKey.padEnd(22)} -> ${res ? 'created' : 'BLOCKED'}`);
  }
  await mongoose.disconnect(); process.exit(0);
}
run().catch(async e => { console.error(e); await mongoose.disconnect().catch(()=>{}); process.exit(1); });
