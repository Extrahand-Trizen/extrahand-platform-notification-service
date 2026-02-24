import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { NotificationService } from '../services/NotificationService';
import { BadRequestError } from '../errors/AppError';
import logger from '../config/logger';

export class NotificationController {
  /**
   * POST /api/v1/notifications/token
   * Register or update FCM token
   */
  static async registerToken(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.uid || (req as any).userId;
      if (!userId) {
        throw new BadRequestError('User ID is required');
      }

      const { token, platform, deviceId } = req.body;

      if (!token || !platform) {
        throw new BadRequestError('Token and platform are required');
      }

      if (!['ios', 'android', 'web'].includes(platform)) {
        throw new BadRequestError('Platform must be ios, android, or web');
      }

      const fcmToken = await NotificationService.registerToken(
        userId,
        token,
        platform,
        deviceId
      );

      res.json({
        success: true,
        data: {
          token: fcmToken.token,
          platform: fcmToken.platform,
          deviceId: fcmToken.deviceId
        },
        message: 'FCM token registered successfully'
      });
    } catch (error: any) {
      logger.error('Error registering FCM token:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to register FCM token'
      });
    }
  }

  /**
   * DELETE /api/v1/notifications/token
   * Remove FCM token
   */
  static async removeToken(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { token } = req.body;

      if (!token) {
        throw new BadRequestError('Token is required');
      }

      await NotificationService.removeToken(token);

      res.json({
        success: true,
        message: 'FCM token removed successfully'
      });
    } catch (error: any) {
      logger.error('Error removing FCM token:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to remove FCM token'
      });
    }
  }

  /**
   * GET /api/v1/notifications/preferences
   * Get notification preferences
   */
  static async getPreferences(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.uid || (req as any).userId;
      if (!userId) {
        throw new BadRequestError('User ID is required');
      }

      const preferences = await NotificationService.getPreferences(userId);

      res.json({
        success: true,
        data: preferences
      });
    } catch (error: any) {
      logger.error('Error fetching notification preferences:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to fetch preferences'
      });
    }
  }

  /**
   * PUT /api/v1/notifications/preferences
   * Update notification preferences
   */
  static async updatePreferences(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.uid || (req as any).userId;
      if (!userId) {
        throw new BadRequestError('User ID is required');
      }

      const preferences = await NotificationService.updatePreferences(userId, req.body);

      res.json({
        success: true,
        data: preferences,
        message: 'Notification preferences updated successfully'
      });
    } catch (error: any) {
      logger.error('Error updating notification preferences:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to update preferences'
      });
    }
  }

  /**
   * POST /api/v1/notifications/send
   * Send notification (service-to-service only)
   */
  static async sendNotification(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Support both old format (single userId) and new format (recipients array)
      const { userId, recipients, type, eventKey, title, body, data, category } = req.body;

      // Accept either userId (single) or recipients (array)
      const targetUsers = recipients && Array.isArray(recipients) ? recipients : [userId];
      const notificationType = type || eventKey;

      if (!targetUsers || targetUsers.length === 0 || !notificationType || !title || !body) {
        throw new BadRequestError('userId (or recipients array), type (or eventKey), title, and body are required');
      }

      // Send to all target users
      let totalSent = 0;
      let totalFailed = 0;

      for (const uid of targetUsers) {
        try {
          const result = await NotificationService.sendPushNotification(uid, {
            type: notificationType,
            title,
            body,
            data,
            category
          });
          totalSent += result.sent || 0;
          totalFailed += result.failed || 0;
        } catch (error) {
          totalFailed++;
          logger.error('Error sending notification to user', { userId: uid, error });
        }
      }

      res.json({
        success: totalSent > 0,
        data: {
          sent: totalSent,
          failed: totalFailed
        },
        message: `Notification sent to ${totalSent} device(s)`
      });
    } catch (error: any) {
      logger.error('Error sending notification:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to send notification'
      });
    }
  }

  /**
   * POST /api/v1/notifications/send-batch
   * Send notification to multiple users (service-to-service only)
   */
  static async sendBatchNotification(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Support both old format (type) and new format (eventKey)
      const { userIds, type, eventKey, title, body, data, category } = req.body;

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        throw new BadRequestError('userIds array is required');
      }

      // Accept either 'type' (old format) or 'eventKey' (new format)
      const notificationType = type || eventKey;
      if (!notificationType || !title || !body) {
        throw new BadRequestError('type (or eventKey), title, and body are required');
      }

      const result = await NotificationService.sendToMultipleUsers(userIds, {
        type: notificationType,
        title,
        body,
        data,
        category
      });

      res.json({
        success: true,
        data: {
          total: result.total,
          sent: result.sent,
          failed: result.failed
        },
        message: `Notifications sent to ${result.sent} user(s)`
      });
    } catch (error: any) {
      logger.error('Error sending batch notification:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to send batch notification'
      });
    }
  }
}



























