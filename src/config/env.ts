import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Define environment schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).refine(n => n > 0 && n < 65536, 'Port must be between 1-65535').default('4005'),
  
  // MongoDB
  MONGODB_URI: z.string().url('Invalid MongoDB URI').optional(),
  MONGODB_DB: z.string().default('extrahand'),
  
  // Firebase
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().email().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  
  // Security
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('900000'), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('1000'),
  
  // CORS
  CORS_ORIGIN: z.string().optional(),
  
  // Health check
  HEALTH_CHECK_PATH: z.string().default('/api/v1/health'),
  
  // Service-to-Service Communication
  SERVICE_AUTH_TOKEN: z.string().min(1, 'SERVICE_AUTH_TOKEN is required for service-to-service communication').optional(),
});

// CORS configuration
export function getCorsConfig(env: z.infer<typeof envSchema>) {
  const allowedOrigins = [
    'https://extrahand.in',
    'https://www.extrahand.in',
    'http://localhost:3000',
    'http://localhost:4000',
    'http://localhost:4005',
    'http://localhost:5000',
    'http://localhost:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:4000',
    'http://127.0.0.1:4005',
    'http://127.0.0.1:5000',
    'http://127.0.0.1:8080'
  ];
  
  if (env.CORS_ORIGIN) {
    const customOrigins = env.CORS_ORIGIN.split(',')
      .map(origin => origin.trim())
      .filter(origin => origin.length > 0);
    allowedOrigins.push(...customOrigins);
    console.log('✅ CORS custom origins loaded:', customOrigins);
  }
  
  // Remove duplicates
  const uniqueOrigins = Array.from(new Set(allowedOrigins));
  console.log('✅ CORS allowed origins:', uniqueOrigins);
  
  return {
    origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      // Allow requests without an origin (like mobile apps, curl requests, etc)
      if (!origin) {
        console.log('✅ CORS: No origin header (possibly mobile/app request)');
        return callback(null, true);
      }
      
      // Log the incoming origin
      const isAllowed = uniqueOrigins.includes(origin);
      if (!isAllowed) {
        console.warn(`⚠️ CORS: Origin ${origin} not in allowed list. Allowed: ${uniqueOrigins.join(', ')}`);
      } else {
        console.log(`✅ CORS: Origin ${origin} is allowed`);
      }
      
      if (isAllowed) {
        callback(null, true);
      } else {
        // Still allow the request but let the client know
        console.error(`❌ CORS: Blocking origin ${origin}`);
        callback(new Error(`Origin ${origin} not allowed by CORS policy`));
      }
    },
    credentials: true,
    optionsSuccessStatus: 200, // Changed from 204 to 200
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'Cache-Control',
      'Pragma',
      'X-API-Key',
      'X-Service-Auth',
      'X-User-Id',
      'X-Service-Name'
    ],
    exposedHeaders: [
      'Content-Length',
      'Access-Control-Allow-Origin',
      'Access-Control-Allow-Credentials'
    ],
    preflightContinue: false,
    maxAge: 86400 // 24 hours
  };
}

export function validateEnv() {
  try {
    const env = envSchema.parse(process.env);
    
    // Check for Firebase credentials
    const hasFirebaseEnvVars = env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY;
    const hasFirebaseServiceAccountPath = env.FIREBASE_SERVICE_ACCOUNT_PATH;
    const hasGoogleCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    
    const serviceAccountPath = path.join(__dirname, '..', '..', 'serviceAccountKey.json');
    const hasServiceAccountFile = fs.existsSync(serviceAccountPath);
    
    const hasFirebaseCredentials = hasFirebaseEnvVars || hasFirebaseServiceAccountPath || hasGoogleCredentials || hasServiceAccountFile;
    
    if (!hasFirebaseCredentials && env.NODE_ENV === 'production') {
      throw new Error('Firebase credentials must be provided in production. Either set environment variables or ensure serviceAccountKey.json exists.');
    }
    
    if (hasServiceAccountFile) {
      console.log('✅ Firebase service account file found: serviceAccountKey.json');
    } else if (hasFirebaseEnvVars) {
      console.log('✅ Firebase credentials found in environment variables');
    } else if (hasFirebaseServiceAccountPath) {
      console.log('✅ Firebase service account path specified:', env.FIREBASE_SERVICE_ACCOUNT_PATH);
    } else if (hasGoogleCredentials) {
      console.log('✅ Google Application Credentials found');
    }
    
    return env;
  } catch (error) {
    console.error('❌ Environment validation failed:');
    if (error instanceof z.ZodError) {
      error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    } else {
      console.error(`  - ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    process.exit(1);
  }
}

export type EnvConfig = z.infer<typeof envSchema>;



