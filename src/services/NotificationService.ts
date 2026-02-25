import { admin } from '../config/firebase';
import logger from '../config/logger';
import NotificationPreferences from '../models/NotificationPreferences';
import FCMToken, { IFCMTokenDocument } from '../models/FCMToken';
import { NotificationPayload, NotificationPreferences as INotificationPreferences } from '../types';
import { NotFoundError } from '../errors/AppError';

export class NotificationService {
  /**
   * Check if notification should be sent based on user preferences
   */
  static async shouldSendNotification(
    userId: string,
    category: keyof INotificationPreferences,
    channel: 'push' | 'email' | 'sms'
  ): Promise<boolean> {
    try {
      // Validate userId
      if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        logger.warn('Invalid userId passed to shouldSendNotification', { userId });
        return false; // Don't send if userId is invalid
      }

      let preferences = await NotificationPreferences.findOne({ userId });

      // Create default preferences if they don't exist
      if (!preferences) {
        try {
          preferences = await (NotificationPreferences as any).createDefault(userId);
          logger.info(`Created default notification preferences for user: ${userId}`);
        } catch (error: any) {
          // Handle duplicate key error (race condition)
          if (error.code === 11000) {
            logger.warn('Duplicate key error, trying to fetch existing preferences', { userId });
            preferences = await NotificationPreferences.findOne({ userId });
          } else {
            throw error;
          }
        }
      }

      // If still no preferences after all attempts, allow by default
      if (!preferences) {
        logger.warn('No preferences found after creation attempts, allowing notification by default', { userId, category });
        return true;
      }

      const categoryPrefs = preferences[category as keyof INotificationPreferences];

      // If category doesn't exist in preferences, allow by default
      if (!categoryPrefs) {
        logger.warn('Category not found in preferences, allowing notification by default', { userId, category });
        return true;
      }

      // For categories that only have push (keywordTaskAlerts, recommendedTaskAlerts)
      if (category === 'keywordTaskAlerts' || category === 'recommendedTaskAlerts') {
        return channel === 'push' && (categoryPrefs as { push: boolean }).push === true;
      }

      // For other categories with multiple channels
      if ('push' in categoryPrefs && 'email' in categoryPrefs && 'sms' in categoryPrefs) {
        const channelPrefs = categoryPrefs as { email: boolean; push: boolean; sms: boolean };
        return channelPrefs[channel] === true;
      }

      return false;
    } catch (error: any) {
      logger.error('Error checking notification preferences:', error);
      // Default to allowing notifications if check fails (fail open)
      return true;
    }
  }

  /**
   * Get all FCM tokens for a user
   */
  static async getUserFCMTokens(userId: string): Promise<IFCMTokenDocument[]> {
    try {
      const tokens = await FCMToken.find({ userId }).sort({ lastActive: -1 });
      return tokens;
    } catch (error: any) {
      logger.error('Error fetching FCM tokens:', error);
      throw new Error('Failed to fetch FCM tokens');
    }
  }

  /**
   * Send push notification via FCM
   */
  static async sendPushNotification(
    userId: string,
    notification: Omit<NotificationPayload, 'userId'>
  ): Promise<{ success: boolean; sent: number; failed: number }> {
    try {
      // Check if user has push notifications enabled for this category
      const category = notification.category || 'taskUpdates';
      const shouldSend = await this.shouldSendNotification(userId, category, 'push');

      if (!shouldSend) {
        logger.info(`Notification skipped - user preferences disabled`, {
          userId,
          category,
          type: notification.type
        });
        return { success: true, sent: 0, failed: 0 };
      }

      // Get user's FCM tokens
      const tokens = await this.getUserFCMTokens(userId);

      if (tokens.length === 0) {
        logger.warn(`No FCM tokens found for user: ${userId}`);
        return { success: true, sent: 0, failed: 0 };
      }

      // Prepare FCM message
      const message = {
        notification: {
          title: notification.title,
          body: notification.body
        },
        data: {
          type: notification.type,
          ...(notification.data || {})
        },
        android: {
          priority: 'high' as const,
          notification: {
            sound: 'default',
            channelId: 'default'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };

      // Send to all tokens
      const tokenStrings = tokens.map(t => t.token);
      const response = await admin.messaging().sendEachForMulticast({
        tokens: tokenStrings,
        ...message
      });

      // Update lastActive for successful tokens
      const successfulTokens = response.responses
        .map((resp, idx) => resp.success ? tokens[idx].token : null)
        .filter(Boolean) as string[];

      if (successfulTokens.length > 0) {
        await FCMToken.updateMany(
          { token: { $in: successfulTokens } },
          { lastActive: new Date() }
        );
      }

      // Remove invalid tokens
      const invalidTokens = response.responses
        .map((resp, idx) => {
          if (!resp.success && (
            resp.error?.code === 'messaging/invalid-registration-token' ||
            resp.error?.code === 'messaging/registration-token-not-registered'
          )) {
            return tokens[idx].token;
          }
          return null;
        })
        .filter(Boolean) as string[];

      if (invalidTokens.length > 0) {
        await FCMToken.deleteMany({ token: { $in: invalidTokens } });
        logger.info(`Removed ${invalidTokens.length} invalid FCM tokens`);
      }

      logger.info(`Push notification sent`, {
        userId,
        type: notification.type,
        sent: response.successCount,
        failed: response.failureCount
      });

      return {
        success: response.successCount > 0,
        sent: response.successCount,
        failed: response.failureCount
      };
    } catch (error: any) {
      logger.error('Error sending push notification:', error);
      throw new Error(`Failed to send push notification: ${error.message}`);
    }
  }

  /**
   * Send notification to multiple users (batch)
   */
  static async sendToMultipleUsers(
    userIds: string[],
    notification: Omit<NotificationPayload, 'userId'>
  ): Promise<{ total: number; sent: number; failed: number }> {
    let totalSent = 0;
    let totalFailed = 0;

    for (const userId of userIds) {
      try {
        const result = await this.sendPushNotification(userId, notification);
        totalSent += result.sent;
        totalFailed += result.failed;
      } catch (error: any) {
        logger.error(`Failed to send notification to user ${userId}:`, error);
        totalFailed++;
      }
    }

    return {
      total: userIds.length,
      sent: totalSent,
      failed: totalFailed
    };
  }

  /**
   * Register/Update FCM token
   */
  static async registerToken(
    userId: string,
    token: string,
    platform: 'ios' | 'android' | 'web',
    deviceId?: string
  ): Promise<IFCMTokenDocument> {
    try {
      // Check if token already exists
      let fcmToken = await FCMToken.findOne({ token });

      if (fcmToken) {
        // Update existing token
        fcmToken.userId = userId;
        fcmToken.platform = platform;
        fcmToken.deviceId = deviceId;
        fcmToken.lastActive = new Date();
        await fcmToken.save();
        logger.info(`Updated FCM token for user: ${userId}`);
      } else {
        // Create new token
        fcmToken = await FCMToken.create({
          userId,
          token,
          platform,
          deviceId,
          lastActive: new Date()
        });
        logger.info(`Registered new FCM token for user: ${userId}`);
      }

      return fcmToken;
    } catch (error: any) {
      logger.error('Error registering FCM token:', error);
      throw new Error(`Failed to register FCM token: ${error.message}`);
    }
  }

  /**
   * Remove FCM token
   */
  static async removeToken(token: string): Promise<void> {
    try {
      const result = await FCMToken.deleteOne({ token });
      if (result.deletedCount === 0) {
        throw new NotFoundError('FCM token not found');
      }
      logger.info(`Removed FCM token`);
    } catch (error: any) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error('Error removing FCM token:', error);
      throw new Error(`Failed to remove FCM token: ${error.message}`);
    }
  }

  /**
   * Get notification preferences
   */
  static async getPreferences(userId: string): Promise<INotificationPreferences> {
    try {
      // Validate userId
      if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        logger.warn('Invalid userId passed to getPreferences', { userId });
        // Return default preferences without saving
        return {
          transactional: { email: false, push: true, sms: true },
          taskUpdates: { email: true, push: true, sms: true },
          taskReminders: { email: true, push: true, sms: true },
          keywordTaskAlerts: { push: true },
          recommendedTaskAlerts: { push: true },
          helpfulInformation: { email: true, push: true, sms: true },
          updatesNewsletters: { email: true, push: true, sms: true }
        };
      }

      let preferences = await NotificationPreferences.findOne({ userId });

      if (!preferences) {
        // Create default preferences
        try {
          preferences = await (NotificationPreferences as any).createDefault(userId);
        } catch (error: any) {
          // Handle duplicate key error
          if (error.code === 11000) {
            logger.warn('Duplicate key error in getPreferences, fetching existing', { userId });
            preferences = await NotificationPreferences.findOne({ userId });
          } else {
            throw error;
          }
        }
      }

      return {
        transactional: preferences?.transactional || { email: false, push: true, sms: true },
        taskUpdates: preferences?.taskUpdates || { email: true, push: true, sms: true },
        taskReminders: preferences?.taskReminders || { email: true, push: true, sms: true },
        keywordTaskAlerts: preferences?.keywordTaskAlerts || { push: true },
        recommendedTaskAlerts: preferences?.recommendedTaskAlerts || { push: true },
        helpfulInformation: preferences?.helpfulInformation || { email: true, push: true, sms: true },
        updatesNewsletters: preferences?.updatesNewsletters || { email: true, push: true, sms: true }
      };
    } catch (error: any) {
      logger.error('Error fetching notification preferences:', error);
      throw new Error(`Failed to fetch preferences: ${error.message}`);
    }
  }

  /**
   * Update notification preferences
   */
  static async updatePreferences(
    userId: string,
    preferences: Partial<INotificationPreferences>
  ): Promise<INotificationPreferences> {
    try {
      // Validate userId
      if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        logger.warn('Invalid userId passed to updatePreferences', { userId });
        throw new Error('Invalid userId');
      }

      let userPreferences = await NotificationPreferences.findOne({ userId });

      if (!userPreferences) {
        try {
          userPreferences = await (NotificationPreferences as any).createDefault(userId);
        } catch (error: any) {
          // Handle duplicate key error
          if (error.code === 11000) {
            logger.warn('Duplicate key error in updatePreferences, fetching existing', { userId });
            userPreferences = await NotificationPreferences.findOne({ userId });
          } else {
            throw error;
          }
        }
      }

      // Update preferences
      if (preferences.transactional) {
        userPreferences!.transactional = {
          ...userPreferences!.transactional,
          ...preferences.transactional
        };
        // Ensure push is always true for transactional
        userPreferences!.transactional.push = true;
      }

      if (preferences.taskUpdates) {
        userPreferences!.taskUpdates = {
          ...userPreferences!.taskUpdates,
          ...preferences.taskUpdates
        };
      }

      if (preferences.taskReminders) {
        userPreferences!.taskReminders = {
          ...userPreferences!.taskReminders,
          ...preferences.taskReminders
        };
      }

      if (preferences.keywordTaskAlerts) {
        userPreferences!.keywordTaskAlerts = {
          ...userPreferences!.keywordTaskAlerts,
          ...preferences.keywordTaskAlerts
        };
      }

      if (preferences.recommendedTaskAlerts) {
        userPreferences!.recommendedTaskAlerts = {
          ...userPreferences!.recommendedTaskAlerts,
          ...preferences.recommendedTaskAlerts
        };
      }

      if (preferences.helpfulInformation) {
        userPreferences!.helpfulInformation = {
          ...userPreferences!.helpfulInformation,
          ...preferences.helpfulInformation
        };
      }

      if (preferences.updatesNewsletters) {
        userPreferences!.updatesNewsletters = {
          ...userPreferences!.updatesNewsletters,
          ...preferences.updatesNewsletters
        };
      }

      await userPreferences?.save();

      logger.info(`Updated notification preferences for user: ${userId}`);

      return {
        transactional: userPreferences?.transactional || { email: false, push: true, sms: true },
        taskUpdates: userPreferences?.taskUpdates || { email: true, push: true, sms: true },
        taskReminders: userPreferences?.taskReminders || { email: true, push: true, sms: true },
        keywordTaskAlerts: userPreferences?.keywordTaskAlerts || { push: true },
        recommendedTaskAlerts: userPreferences?.recommendedTaskAlerts || { push: true },
        helpfulInformation: userPreferences?.helpfulInformation || { email: true, push: true, sms: true },
        updatesNewsletters: userPreferences?.updatesNewsletters || { email: true, push: true, sms: true }
      };
    } catch (error: any) {
      logger.error('Error updating notification preferences:', error);
      throw new Error(`Failed to update preferences: ${error.message}`);
    }
  }

  /**
   * ============================================================
   * IN-APP NOTIFICATIONS (Polling)
   * ============================================================
   */

  /**
   * Create a single in-app notification
   */
  static async createInAppNotification(data: {
    userId: string;
    title: string;
    body: string;
    type?: 'info' | 'warning' | 'error' | 'success';
    category?: string;
    data?: Record<string, any>;
  }): Promise<any> {
    try {
      const InAppNotification = (await import('../models/InAppNotification')).default;
      
      const notification = await InAppNotification.create({
        userId: data.userId,
        title: data.title,
        body: data.body,
        type: data.type || 'info',
        category: data.category,
        data: data.data,
        read: false
      });

      logger.info(`Created in-app notification for user: ${data.userId}`, {
        notificationId: notification._id,
        type: data.type
      });

      return notification;
    } catch (error: any) {
      logger.error('Error creating in-app notification:', error);
      throw new Error(`Failed to create in-app notification: ${error.message}`);
    }
  }

  /**
   * Create batch in-app notifications for multiple users
   */
  static async createInAppBatchNotifications(data: {
    userIds: string[];
    title: string;
    body: string;
    type?: 'info' | 'warning' | 'error' | 'success';
    category?: string;
    data?: Record<string, any>;
  }): Promise<{ total: number; created: number; failed: number }> {
    try {
      const InAppNotification = (await import('../models/InAppNotification')).default;
      
      const notifications = data.userIds.map(userId => ({
        userId,
        title: data.title,
        body: data.body,
        type: data.type || 'info',
        category: data.category,
        data: data.data,
        read: false
      }));

      const result = await InAppNotification.insertMany(notifications, { ordered: false });

      logger.info(`Created batch in-app notifications`, {
        total: data.userIds.length,
        created: result.length,
        userIds: data.userIds.slice(0, 5).join(',') + (data.userIds.length > 5 ? '...' : '')
      });

      return {
        total: data.userIds.length,
        created: result.length,
        failed: data.userIds.length - result.length
      };
    } catch (error: any) {
      logger.error('Error creating batch in-app notifications:', error);
      throw new Error(`Failed to create batch in-app notifications: ${error.message}`);
    }
  }

  /**
   * Get in-app notifications for a user
   */
  static async getInAppNotifications(
    userId: string,
    limit: number = 50,
    skip: number = 0,
    unreadOnly: boolean = false
  ): Promise<{
    notifications: any[];
    unreadCount: number;
    hasMore: boolean;
  }> {
    try {
      const InAppNotification = (await import('../models/InAppNotification')).default;
      
      const query = { userId };
      if (unreadOnly) {
        (query as any).read = false;
      }

      // Get total unread count
      const unreadCount = await InAppNotification.countDocuments({
        userId,
        read: false
      });

      // Fetch notifications
      const notifications = await InAppNotification
        .find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean();

      // Check if there are more notifications
      const totalCount = await InAppNotification.countDocuments(query);
      const hasMore = skip + limit < totalCount;

      logger.info(`Fetched in-app notifications for user: ${userId}`, {
        returned: notifications.length,
        unreadCount,
        hasMore
      });

      return {
        notifications,
        unreadCount,
        hasMore
      };
    } catch (error: any) {
      logger.error('Error fetching in-app notifications:', error);
      throw new Error(`Failed to fetch in-app notifications: ${error.message}`);
    }
  }

  /**
   * Get unread notification count for a user
   */
  static async getUnreadNotificationCount(userId: string): Promise<number> {
    try {
      const InAppNotification = (await import('../models/InAppNotification')).default;
      
      const count = await InAppNotification.countDocuments({
        userId,
        read: false
      });

      return count;
    } catch (error: any) {
      logger.error('Error counting unread notifications:', error);
      throw new Error(`Failed to count unread notifications: ${error.message}`);
    }
  }

  /**
   * Mark a specific notification as read
   */
  static async markInAppNotificationAsRead(
    notificationId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const InAppNotification = (await import('../models/InAppNotification')).default;
      
      const result = await InAppNotification.updateOne(
        {
          _id: notificationId,
          userId
        },
        {
          read: true,
          readAt: new Date()
        }
      );

      return result.modifiedCount > 0;
    } catch (error: any) {
      logger.error('Error marking notification as read:', error);
      throw new Error(`Failed to mark notification as read: ${error.message}`);
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  static async markAllInAppNotificationsAsRead(userId: string): Promise<{ modifiedCount: number }> {
    try {
      const InAppNotification = (await import('../models/InAppNotification')).default;
      
      const result = await InAppNotification.updateMany(
        {
          userId,
          read: false
        },
        {
          read: true,
          readAt: new Date()
        }
      );

      logger.info(`Marked all notifications as read for user: ${userId}`, {
        modifiedCount: result.modifiedCount
      });

      return { modifiedCount: result.modifiedCount };
    } catch (error: any) {
      logger.error('Error marking all notifications as read:', error);
      throw new Error(`Failed to mark all notifications as read: ${error.message}`);
    }
  }

  /**
   * Delete a notification
   */
  static async deleteInAppNotification(
    notificationId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const InAppNotification = (await import('../models/InAppNotification')).default;
      
      const result = await InAppNotification.deleteOne({
        _id: notificationId,
        userId
      });

      return result.deletedCount > 0;
    } catch (error: any) {
      logger.error('Error deleting notification:', error);
      throw new Error(`Failed to delete notification: ${error.message}`);
    }
  }
}



