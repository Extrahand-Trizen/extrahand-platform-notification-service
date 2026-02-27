import { Router } from 'express';
import { NotificationController } from '../controllers/NotificationController';
import { serviceAuthMiddleware } from '../middleware/serviceAuth';
import { asyncHandler } from '../middleware/errorHandler';
import { userOrServiceAuth } from '../middleware/userOrServiceAuth';

const router = Router();

// Public endpoints (can be called either directly with user auth
// or via API Gateway with service auth + X-User-Id)
router.post(
  '/token',
  userOrServiceAuth,
  asyncHandler(NotificationController.registerToken)
);

router.delete(
  '/token',
  userOrServiceAuth,
  asyncHandler(NotificationController.removeToken)
);

router.get(
  '/preferences',
  userOrServiceAuth,
  asyncHandler(NotificationController.getPreferences)
);

router.put(
  '/preferences',
  userOrServiceAuth,
  asyncHandler(NotificationController.updatePreferences)
);

// Service-to-service endpoints (require service auth only)
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

// ============================================================
// IN-APP NOTIFICATIONS (Polling) - User endpoints
// ============================================================

router.get(
  '/in-app',
  userOrServiceAuth,
  asyncHandler(NotificationController.getInAppNotifications)
);

router.get(
  '/in-app/unread-count',
  userOrServiceAuth,
  asyncHandler(NotificationController.getUnreadCount)
);

router.patch(
  '/in-app/:notificationId/read',
  userOrServiceAuth,
  asyncHandler(NotificationController.markAsRead)
);

router.patch(
  '/in-app/mark-all-read',
  userOrServiceAuth,
  asyncHandler(NotificationController.markAllAsRead)
);

router.delete(
  '/in-app/:notificationId',
  userOrServiceAuth,
  asyncHandler(NotificationController.deleteNotification)
);

// ============================================================
// IN-APP NOTIFICATIONS - Service endpoints
// ============================================================

router.post(
  '/in-app/send',
  serviceAuthMiddleware,
  asyncHandler(NotificationController.createInAppNotification)
);

router.post(
  '/in-app/send-batch',
  serviceAuthMiddleware,
  asyncHandler(NotificationController.createInAppBatchNotification)
);

export default router;



