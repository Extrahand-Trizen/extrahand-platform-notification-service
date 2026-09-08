import dotenv from 'dotenv'; dotenv.config();
import mongoose from 'mongoose';
import { connectMongo } from '../config/database';
import InAppNotification from '../models/InAppNotification';

// mirror of the seller app's isSellerNotification
const NON_SELLER_ROLES = new Set(['customer','partner','tasker','helper']);
const CUSTOMER_QC = new Set(['QC_ORDER_ACCEPTED','QC_ORDER_PREPARING','QC_ORDER_REJECTED','QC_ORDER_READY','QC_ORDER_HANDED_OVER','QC_ORDER_TIMED_OUT','QC_ORDER_PREP_EXTENDED']);
const TASK_RE = /^(TASK_|HELPER_|OFFER_|BOOK_NOW|PAYOUT_PENALTY|REVIEW_REQUEST|WORK_)/i;
function isSeller(d: any, cat?: string) {
  const role = d?.recipientRole ? String(d.recipientRole) : '';
  if (role === 'seller') return true;
  if (NON_SELLER_ROLES.has(role)) return false;
  const ek = d?.eventKey ? String(d.eventKey) : '';
  if (CUSTOMER_QC.has(ek)) return false;
  if (TASK_RE.test(ek)) return false;
  const c = String(cat || d?.category || '');
  if (['taskUpdates','recommendedTaskAlerts','keywordTaskAlerts'].includes(c)) return false;
  return true;
}

async function run() {
  await connectMongo(process.env.MONGODB_URI as string);
  const USER = process.argv[2] || '1Ac3f3DFTnXb8BJGT4tZg1OX3TZ2';
  const rows = await InAppNotification.find({ userId: USER }).sort({ createdAt: -1 }).limit(40).lean();
  let shown = 0, hidden = 0;
  for (const r of rows) {
    const keep = isSeller(r.data, r.category);
    if (keep) shown++; else hidden++;
    console.log(`  ${keep ? 'SHOW' : 'hide'}  role=${String((r.data as any)?.recipientRole ?? '-').padEnd(8)} ${String((r.data as any)?.eventKey ?? '').padEnd(22)} | ${r.title}`);
  }
  console.log(`\n  => ${shown} shown, ${hidden} hidden`);
  await mongoose.disconnect(); process.exit(0);
}
run().catch(async e => { console.error(e); await mongoose.disconnect().catch(()=>{}); process.exit(1); });
