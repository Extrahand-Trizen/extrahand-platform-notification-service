import dotenv from 'dotenv'; dotenv.config();
import mongoose from 'mongoose';
import { connectMongo } from '../config/database';
import InAppNotification from '../models/InAppNotification';

const USER = process.argv[2] || '1Ac3f3DFTnXb8BJGT4tZg1OX3TZ2';

// exactly the 3 query shapes
const q = {
  'no role (app sends nothing / stale build)': { userId: USER },
  "DEPLOYED getRoleQuery('seller') -> else branch": { userId: USER, 'data.recipientRole': { $in: ['partner','customer'] } },
  "FIXED getRoleQuery('seller')": { userId: USER, 'data.recipientRole': 'seller' },
};

async function run() {
  await connectMongo(process.env.MONGODB_URI as string);
  for (const [label, filter] of Object.entries(q)) {
    const rows = await InAppNotification.find(filter as any).sort({ createdAt: -1 }).limit(20).lean();
    console.log(`\n### ${label}  ->  ${rows.length} shown`);
    for (const r of rows) console.log(`   role=${String((r.data as any)?.recipientRole ?? '(unset)').padEnd(9)} | ${r.title}`);
  }
  await mongoose.disconnect(); process.exit(0);
}
run().catch(async e => { console.error(e); await mongoose.disconnect().catch(()=>{}); process.exit(1); });
