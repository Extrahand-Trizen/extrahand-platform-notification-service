import dotenv from 'dotenv'; dotenv.config();
import mongoose from 'mongoose';
import { connectMongo } from '../config/database';
import FCMToken from '../models/FCMToken';
import { NotificationService } from '../services/NotificationService';

async function run() {
  await connectMongo(process.env.MONGODB_URI as string);
  const tok = await FCMToken.findOne({ platform: 'android' }).sort({ updatedAt: -1 }).lean();
  const userId = process.argv[2] || tok!.userId;
  console.log('creating in-app seller notification for', userId);
  const res = await NotificationService.createInAppNotification({
    userId,
    title: 'Amul Milk 1L is out of stock',
    body: 'Sold out after order QC-TEST. Tap to restock.',
    type: 'success',
    category: 'system' as any,
    data: { eventKey: 'QC_STOCK_OUT', recipientRole: 'seller', category: 'system' },
  });
  console.log('created:', res ? (res as any)._id : 'NULL (blocked)');
  await mongoose.disconnect(); process.exit(0);
}
run().catch(async e => { console.error(e); await mongoose.disconnect().catch(()=>{}); process.exit(1); });
