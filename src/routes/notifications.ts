import { Router } from 'express';
import { NotificationController } from '../controllers/NotificationController';
import { TemplateController } from '../controllers/TemplateController';
import { CampaignController } from '../controllers/CampaignController';
import { serviceAuthMiddleware } from '../middleware/serviceAuth';
import { asyncHandler } from '../middleware/errorHandler';
import { userOrServiceAuth } from '../middleware/userOrServiceAuth';
import { validateEnv } from '../config/env';

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
  '/in-app',
  userOrServiceAuth,
  asyncHandler(NotificationController.deleteAllNotifications)
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

// ============================================================
// TEMPLATE MANAGEMENT (Service-to-Service)
// ============================================================
router.post(
  '/templates',
  serviceAuthMiddleware,
  asyncHandler(TemplateController.createTemplate)
);

router.get(
  '/templates',
  serviceAuthMiddleware,
  asyncHandler(TemplateController.getTemplates)
);

router.get(
  '/templates/:id',
  serviceAuthMiddleware,
  asyncHandler(TemplateController.getTemplateById)
);

router.put(
  '/templates/:id',
  serviceAuthMiddleware,
  asyncHandler(TemplateController.updateTemplate)
);

router.delete(
  '/templates/:id',
  serviceAuthMiddleware,
  asyncHandler(TemplateController.deleteTemplate)
);

// ============================================================
// CAMPAIGN MANAGEMENT (Service-to-Service)
// ============================================================
router.post(
  '/campaigns/preview',
  serviceAuthMiddleware,
  asyncHandler(CampaignController.previewAudience)
);

router.post(
  '/campaigns',
  serviceAuthMiddleware,
  asyncHandler(CampaignController.createCampaign)
);

router.get(
  '/campaigns',
  serviceAuthMiddleware,
  asyncHandler(CampaignController.getCampaigns)
);

router.get(
  '/campaigns/:id',
  serviceAuthMiddleware,
  asyncHandler(CampaignController.getCampaignById)
);

// ============================================================
// IMAGE UPLOAD MANAGEMENT
// ============================================================
import multer from 'multer';
import fs from 'fs';
import path from 'path';

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'notification-' + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed') as any, false);
    }
  },
});

router.post(
  '/upload',
  serviceAuthMiddleware,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file uploaded' });
    }
    const env = validateEnv();
    const port = env.PORT || 4005;
    const fileUrl = `${req.protocol}://${req.hostname}:${port}/uploads/${req.file.filename}`;
    return res.json({
      success: true,
      url: fileUrl,
    });
  })
);

export default router;



