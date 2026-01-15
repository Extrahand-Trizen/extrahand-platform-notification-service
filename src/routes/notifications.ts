import { Router } from 'express';
import { NotificationController } from '../controllers/NotificationController';
import { authMiddleware } from '../middleware/auth';
import { serviceAuthMiddleware } from '../middleware/serviceAuth';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Public endpoints (require user auth)
router.post(
  '/token',
  authMiddleware,
  asyncHandler(NotificationController.registerToken)
);

router.delete(
  '/token',
  authMiddleware,
  asyncHandler(NotificationController.removeToken)
);

router.get(
  '/preferences',
  authMiddleware,
  asyncHandler(NotificationController.getPreferences)
);

router.put(
  '/preferences',
  authMiddleware,
  asyncHandler(NotificationController.updatePreferences)
);

// Service-to-service endpoints (require service auth)
router.post(
  '/send',
  serviceAuthMiddleware,
  asyncHandler(NotificationController.sendNotification)
);

router.post(
  '/send-batch',
  serviceAuthMiddleware,
  asyncHandler(NotificationController.sendBatchNotification)
);

export default router;



