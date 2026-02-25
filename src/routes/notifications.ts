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

// ============================================================
// IN-APP NOTIFICATIONS (Polling) - User endpoints
// ============================================================

router.get(
  '/in-app',
  authMiddleware,
  asyncHandler(NotificationController.getInAppNotifications)
);

router.get(
  '/in-app/unread-count',
  authMiddleware,
  asyncHandler(NotificationController.getUnreadCount)
);

router.patch(
  '/in-app/:notificationId/read',
  authMiddleware,
  asyncHandler(NotificationController.markAsRead)
);

router.patch(
  '/in-app/mark-all-read',
  authMiddleware,
  asyncHandler(NotificationController.markAllAsRead)
);

router.delete(
  '/in-app/:notificationId',
  authMiddleware,
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



