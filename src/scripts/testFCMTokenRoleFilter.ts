/**
 * Verifies role-based FCM token isolation:
 * When a user signs in with the same phone number/UID across different apps,
 * customer & partner notifications are NEVER sent to the seller app token,
 * and seller notifications are NEVER sent to the customer or partner tokens.
 *
 * Run: `npx ts-node src/scripts/testFCMTokenRoleFilter.ts`
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectMongo } from '../config/database';
import FCMToken from '../models/FCMToken';
import { NotificationService } from '../services/NotificationService';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ok  ${msg}`);
}

async function run() {
  await connectMongo(process.env.MONGODB_URI as string);
  const userId = `fcm-role-test-${Date.now()}`;

  console.log(`Testing with shared userId: ${userId}`);

  // 1. Register tokens from 3 different apps for the SAME user
  const sellerTokenDoc = await NotificationService.registerToken(
    userId,
    `token-seller-${Date.now()}`,
    'android',
    'device-1',
    'seller',
    'com.extrahand.seller'
  );
  assert(sellerTokenDoc.role === 'seller', 'Seller token registered with role=seller');
  assert(sellerTokenDoc.app === 'com.extrahand.seller', 'Seller token registered with app=com.extrahand.seller');

  const partnerTokenDoc = await NotificationService.registerToken(
    userId,
    `token-partner-${Date.now()}`,
    'android',
    'device-1',
    'partner',
    'com.extrahand.helper'
  );
  assert(partnerTokenDoc.role === 'partner', 'Partner token registered with role=partner');
  assert(partnerTokenDoc.app === 'com.extrahand.helper', 'Partner token registered with app=com.extrahand.helper');

  const customerTokenDoc = await NotificationService.registerToken(
    userId,
    `token-customer-${Date.now()}`,
    'android',
    'device-1',
    'customer',
    'com.extrahand'
  );
  assert(customerTokenDoc.role === 'customer', 'Customer token registered with role=customer');
  assert(customerTokenDoc.app === 'com.extrahand', 'Customer token registered with app=com.extrahand');

  // Also simulate an untagged legacy token from an older app version
  const legacyToken = `token-legacy-${Date.now()}`;
  await FCMToken.create({
    userId,
    token: legacyToken,
    platform: 'android',
  });

  // Total tokens in database for this user
  const allTokens = await NotificationService.getUserFCMTokens(userId);
  assert(allTokens.length === 4, `All 4 tokens exist for shared userId (got ${allTokens.length})`);

  // 2. Query tokens for 'seller'
  const sellerTokens = await NotificationService.getUserFCMTokens(userId, 'seller');
  const sellerTokenStrings = sellerTokens.map((t) => t.token);
  assert(sellerTokens.length === 1, `Seller role matches EXACTLY 1 token (got ${sellerTokens.length})`);
  assert(sellerTokenStrings.includes(sellerTokenDoc.token), 'Seller tokens includes the seller app token');
  assert(!sellerTokenStrings.includes(partnerTokenDoc.token), 'Seller tokens DOES NOT include partner token');
  assert(!sellerTokenStrings.includes(customerTokenDoc.token), 'Seller tokens DOES NOT include customer token');
  assert(!sellerTokenStrings.includes(legacyToken), 'Seller tokens DOES NOT include untagged legacy token');

  // 3. Query tokens for 'customer'
  const customerTokens = await NotificationService.getUserFCMTokens(userId, 'customer');
  const customerTokenStrings = customerTokens.map((t) => t.token);
  assert(!customerTokenStrings.includes(sellerTokenDoc.token), 'Customer tokens NEVER includes seller token');
  assert(!customerTokenStrings.includes(partnerTokenDoc.token), 'Customer tokens NEVER includes partner token');
  assert(customerTokenStrings.includes(customerTokenDoc.token), 'Customer tokens includes customer token');

  // 4. Query tokens for 'partner' / 'tasker'
  const partnerTokens = await NotificationService.getUserFCMTokens(userId, 'partner');
  const partnerTokenStrings = partnerTokens.map((t) => t.token);
  assert(!partnerTokenStrings.includes(sellerTokenDoc.token), 'Partner tokens NEVER includes seller token');
  assert(!partnerTokenStrings.includes(customerTokenDoc.token), 'Partner tokens NEVER includes customer token');
  assert(partnerTokenStrings.includes(partnerTokenDoc.token), 'Partner tokens includes partner token');

  const taskerTokens = await NotificationService.getUserFCMTokens(userId, 'tasker');
  const taskerTokenStrings = taskerTokens.map((t) => t.token);
  assert(!taskerTokenStrings.includes(sellerTokenDoc.token), 'Tasker tokens NEVER includes seller token');
  assert(!taskerTokenStrings.includes(customerTokenDoc.token), 'Tasker tokens NEVER includes customer token');
  assert(taskerTokenStrings.includes(partnerTokenDoc.token), 'Tasker tokens includes partner token');

  // Cleanup test tokens
  await FCMToken.deleteMany({ userId });
  console.log('\nALL FCM ROLE ISOLATION CHECKS PASSED SUCCESSFULLY!\n');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
