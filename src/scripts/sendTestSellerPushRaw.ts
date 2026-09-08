/**
 * Direct FCM send to the newest android token, two ways, to compare on-device:
 *   --data-only  → data message; the app's bg handler + Notifee must display it
 *   (default)    → notification+data; the FCM SDK displays it
 * Run: npx ts-node --transpile-only src/scripts/sendTestSellerPushRaw.ts [--data-only]
 */
import dotenv from 'dotenv';
dotenv.config();

import { admin } from '../config/firebase';
import mongoose from 'mongoose';
import { connectMongo } from '../config/database';
import FCMToken from '../models/FCMToken';

async function run() {
  const dataOnly = process.argv.includes('--data-only');
  await connectMongo(process.env.MONGODB_URI as string);
  const tok = await FCMToken.findOne({ platform: 'android' }).sort({ updatedAt: -1 }).lean();
  if (!tok) { console.error('no token'); process.exit(1); }
  console.log('token:', String(tok.token).slice(0, 16) + '…', '| dataOnly:', dataOnly);

  const data = {
    eventKey: 'QC_STOCK_OUT',
    recipientRole: 'seller',
    category: 'system',
    title: dataOnly ? 'DATA-ONLY test — out of stock' : 'NOTIF test — out of stock',
    body: 'Did this pop with a sound while the app was closed?',
  };

  const msg: any = {
    token: tok.token,
    data,
    android: { priority: 'high' },
  };
  if (!dataOnly) {
    msg.notification = { title: data.title, body: data.body };
    msg.android.notification = { sound: 'default', channelId: 'general-v2' };
  }

  const id = await admin.messaging().send(msg);
  console.log('FCM message id:', id);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (e) => { console.error(e); await mongoose.disconnect().catch(() => {}); process.exit(1); });
