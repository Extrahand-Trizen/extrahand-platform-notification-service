import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { connectMongo } from '../config/database';
import InAppNotification from '../models/InAppNotification';
import FCMToken from '../models/FCMToken';

async function run() {
  await connectMongo(process.env.MONGODB_URI as string);

  // newest android token owner = the device currently logged in
  const tok = await FCMToken.findOne({ platform: 'android' }).sort({ updatedAt: -1 }).lean();
  const userId = process.argv[2] || tok?.userId;
  console.log('userId:', userId, '\n');

  const rows = await InAppNotification.find({ userId }).sort({ createdAt: -1 }).limit(40).lean();
  console.log(`${rows.length} in-app notifications (newest 40):\n`);
  const byRole: Record<string, number> = {};
  for (const r of rows) {
    const role = (r.data as any)?.recipientRole ?? '(unset)';
    const ek = (r.data as any)?.eventKey ?? '';
    byRole[role] = (byRole[role] || 0) + 1;
    console.log(
      `  ${new Date(r.createdAt).toISOString().slice(5, 16)}  role=${String(role).padEnd(9)} cat=${String(r.category || '').padEnd(12)} ${ek.padEnd(20)} | ${r.title}`,
    );
  }
  console.log('\nrole tally:', byRole);

  await mongoose.disconnect();
  process.exit(0);
}
run().catch(async (e) => { console.error(e); await mongoose.disconnect().catch(() => {}); process.exit(1); });
