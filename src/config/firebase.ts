import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import logger from './logger';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  let credential: admin.credential.Credential | undefined = undefined;

  const {
    FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY,
    FIREBASE_SERVICE_ACCOUNT_PATH,
  } = process.env;

  try {
    // 1) Env vars with raw private key
    if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
      const privateKey = FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
      credential = admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey,
      });
      logger.info('✅ Firebase initialized with environment variables');
    } else {
      // 2) Local service account file
      const candidatePath = FIREBASE_SERVICE_ACCOUNT_PATH || path.join(__dirname, '..', '..', 'serviceAccountKey.json');
      if (fs.existsSync(candidatePath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
        credential = admin.credential.cert(serviceAccount);
        logger.info('✅ Firebase initialized with service account file');
      }
    }
  } catch (e) {
    logger.warn('⚠️ Failed to load Firebase credentials from env/file, falling back to ADC');
  }

  if (credential) {
    admin.initializeApp({ credential });
  } else {
    // 3) ADC (GOOGLE_APPLICATION_CREDENTIALS or GCP runtime)
    try {
      admin.initializeApp();
      logger.info('✅ Firebase initialized with Application Default Credentials');
    } catch (error) {
      logger.error('❌ Failed to initialize Firebase:', error);
      throw new Error('Firebase initialization failed. Please provide credentials.');
    }
  }
}

// Export auth instance for use in middleware
export const auth = admin.auth();

const MOBILE_FIREBASE_APP_NAME = 'extrahand-mobile-firebase';
let mobileCredential: admin.credential.Credential | undefined;

try {
  const {
    FIREBASE_MOBILE_PROJECT_ID,
    FIREBASE_MOBILE_CLIENT_EMAIL,
    FIREBASE_MOBILE_PRIVATE_KEY,
    FIREBASE_MOBILE_SERVICE_ACCOUNT_PATH,
  } = process.env;

  if (FIREBASE_MOBILE_PROJECT_ID && FIREBASE_MOBILE_CLIENT_EMAIL && FIREBASE_MOBILE_PRIVATE_KEY) {
    mobileCredential = admin.credential.cert({
      projectId: FIREBASE_MOBILE_PROJECT_ID,
      clientEmail: FIREBASE_MOBILE_CLIENT_EMAIL,
      privateKey: FIREBASE_MOBILE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
  } else {
    const mobileServiceAccountPath =
      FIREBASE_MOBILE_SERVICE_ACCOUNT_PATH ||
      path.join(__dirname, '..', '..', 'serviceAccountKey-mobile.json');
    if (fs.existsSync(mobileServiceAccountPath)) {
      mobileCredential = admin.credential.cert(
        JSON.parse(fs.readFileSync(mobileServiceAccountPath, 'utf8')),
      );
    }
  }
} catch {
  logger.warn('Failed to load mobile Firebase credentials');
}

const existingMobileApp = admin.apps.find((app) => app?.name === MOBILE_FIREBASE_APP_NAME);
const mobileFirebaseApp = existingMobileApp || (mobileCredential
  ? admin.initializeApp({ credential: mobileCredential }, MOBILE_FIREBASE_APP_NAME)
  : null);

const mobileProjectId = process.env.FIREBASE_MOBILE_PROJECT_ID || 'extrahand-ca02c';
const primaryProjectMatchesMobile =
  String(process.env.FIREBASE_PROJECT_ID || '').trim() === mobileProjectId;

if (!mobileFirebaseApp && primaryProjectMatchesMobile) {
  logger.info('Using primary Firebase sender for matching mobile project', {
    projectId: mobileProjectId,
  });
} else if (!mobileFirebaseApp) {
  logger.warn('Mobile FCM sender is not configured; mobile assignment pushes cannot be sent');
}

export const mobileMessaging = mobileFirebaseApp
  ? admin.messaging(mobileFirebaseApp)
  : primaryProjectMatchesMobile
  ? admin.messaging()
  : null;

export { admin };



























