import { Response, NextFunction } from 'express';
import { auth } from '../config/firebase';
import { AuthenticatedRequest } from '../types';
import logger from '../config/logger';

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Skip auth for preflight requests
  if (req.method === 'OPTIONS') {
    next();
    return;
  }

  try {
    const header = req.headers.authorization || '';
    const match = /^Bearer (.+)$/.exec(header);
    
    if (!match) {
      logger.warn('❌ [Auth Middleware] Missing Authorization header', {
        path: req.path,
        method: req.method,
        headers: Object.keys(req.headers),
      });
      res.status(401).json({ error: 'Missing Authorization header' });
      return;
    }
    
    const idToken = match[1];
    logger.debug('🔐 [Auth Middleware] Verifying token', {
      tokenLength: idToken.length,
      tokenPrefix: idToken.substring(0, 20) + '...',
    });

    const token = await auth.verifyIdToken(idToken);
    
    logger.info('✅ [Auth Middleware] Token verified', {
      uid: token.uid,
      email: token.email,
      path: req.path,
    });

    req.user = { uid: token.uid, token };
    next();
  } catch (e: any) {
    logger.error('❌ [Auth Middleware] Token verification failed', {
      error: e.message,
      code: e.code,
      path: req.path,
      method: req.method,
    });
    
    res.status(401).json({ 
      error: 'Invalid token',
      details: process.env.NODE_ENV === 'development' ? e.message : undefined
    });
    return;
  }
}



























