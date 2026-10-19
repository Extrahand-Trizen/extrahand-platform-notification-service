import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { connectMongo } from '../config/database';
import { NotificationService } from '../services/NotificationService';

async function main() {
  await connectMongo(process.env.MONGODB_URI as string);
  const uid = '1Ac3f3DFTnXb8BJGT4tZg1OX3TZ2';

  console.log(`\n=== CHECKING LIVE NOTIFICATION ROUTING FOR USER: ${uid} ===\n`);

  // 1. Seller query
  const sellerTokens = await NotificationService.getUserFCMTokens(uid, 'seller');
  console.log(`[SELLER QUERY] Matches: ${sellerTokens.length} token(s)`);
  for (const t of sellerTokens) {
    console.log(`  -> Token: ${t.token.slice(0, 30)}... | role: ${t.role} | app: ${t.app}`);
  }

  // 2. Customer query
  const customerTokens = await NotificationService.getUserFCMTokens(uid, 'customer');
  const customerLeakedToSeller = customerTokens.some(t => t.token.startsWith('fwHX0Wif'));
  console.log(`\n[CUSTOMER QUERY] Matches: ${customerTokens.length} token(s)`);
  for (const t of customerTokens) {
    console.log(`  -> Token: ${t.token.slice(0, 20)}... | role: ${t.role} | app: ${t.app} | device: ${t.deviceId}`);
  }
  console.log(`  -> Did it leak the new seller phone token? ${customerLeakedToSeller ? 'YES ❌ BUG' : 'NO ✅ ISOLATED'}`);

  // 3. Partner / Tasker query
  const partnerTokens = await NotificationService.getUserFCMTokens(uid, 'partner');
  const partnerLeakedToSeller = partnerTokens.some(t => t.token.startsWith('fwHX0Wif'));
  console.log(`\n[PARTNER QUERY] Matches: ${partnerTokens.length} token(s)`);
  console.log(`  -> Did it leak the new seller phone token? ${partnerLeakedToSeller ? 'YES ❌ BUG' : 'NO ✅ ISOLATED'}`);

  console.log('\n=== ALL TOKENS FOR USER IN DB ===');
  const allTokens = await (NotificationService as any).getUserFCMTokens(uid);
  for (const t of allTokens) {
    console.log(`  -> Token: ${t.token.slice(0, 20)}... | role: ${t.role} | app: ${t.app} | device: ${t.deviceId}`);
  }

  console.log('\n=== LIVE VERIFICATION FINISHED SUCCESSFULLY ===\n');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
