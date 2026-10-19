import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { connectMongo } from '../config/database';
import { NotificationService } from '../services/NotificationService';

async function main() {
  await connectMongo(process.env.MONGODB_URI as string);
  const uid = '1Ac3f3DFTnXb8BJGT4tZg1OX3TZ2';

  console.log(`Sending test seller push notification to user ${uid}...`);

  const res = await NotificationService.sendPushNotification(uid, {
    type: 'QC_TEST_ALERT',
    title: '🔔 Extrahand Seller Alert',
    body: 'FCM push isolation test: This notification is strictly for the Seller app!',
    category: 'system' as any,
    data: {
      recipientRole: 'seller',
      eventKey: 'QC_TEST_ALERT',
    },
  });

  console.log('Push send result:', res);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
