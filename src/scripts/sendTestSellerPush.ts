/**
 * Fire a real seller push through the exact prod code path, to the most recently
 * registered android token. Used to verify killed-app notification + sound on a
 * physical device. Run: npx ts-node src/scripts/sendTestSellerPush.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import '../config/firebase';
import mongoose from 'mongoose';
import { connectMongo } from '../config/database';
import FCMToken from '../models/FCMToken';
import { NotificationService } from '../services/NotificationService';

async function run() {
  await connectMongo(process.env.MONGODB_URI as string);

  const tok = await FCMToken.findOne({ platform: 'android' }).sort({ updatedAt: -1 }).lean();
  if (!tok) {
    console.error('No android FCM token registered. Log in on the device first.');
    process.exit(1);
  }
  console.log('Target userId:', tok.userId, '| token:', String(tok.token).slice(0, 16) + '…', '| updated:', (tok as any).updatedAt);

  const result = await NotificationService.sendPushNotification(tok.userId, {
    type: 'QC_STOCK_OUT',
    title: 'Test — Amul Milk 1L is out of stock',
    body: 'This is a push test. If you can see this with the app closed, the fix works.',
    category: 'system',
    data: {
      eventKey: 'QC_STOCK_OUT', category: 'system',
      recipientRole: 'seller',
      category: 'system',
    },
  });

  console.log('sendPushNotification result:', JSON.stringify(result));
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
