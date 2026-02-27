import { Request, Response, NextFunction } from 'express';
import { authMiddleware } from './auth';
import { serviceAuthMiddleware } from './serviceAuth';

/**
 * Combined middleware that accepts EITHER:
 * - Service-to-service auth from API Gateway (X-Service-Auth + X-User-Id), OR
 * - Direct user auth via Firebase ID token (Authorization: Bearer <idToken>)
 *
 * This lets the notification service work both behind the gateway and,
 * if needed, when called directly from clients.
 */
export function userOrServiceAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const hasServiceAuthHeader = typeof req.headers['x-service-auth'] === 'string';

  if (hasServiceAuthHeader) {
    // Prefer service-to-service auth when present (gateway calls)
    return serviceAuthMiddleware(req, res, next);
  }

  // Fallback to direct user auth (Firebase ID token)
  // authMiddleware is async, but we don't need to await it here;
  // Express will handle the returned promise.
  void authMiddleware(req as any, res, next);
}

