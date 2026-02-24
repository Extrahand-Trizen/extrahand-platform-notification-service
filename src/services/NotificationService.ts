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
      let preferences = await NotificationPreferences.findOne({ userId });

      // Create default preferences if they don't exist
      if (!preferences) {
        preferences = await (NotificationPreferences as any).createDefault(userId);
        logger.info(`Created default notification preferences for user: ${userId}`);
      }

      const categoryPrefs = preferences?.[category as keyof INotificationPreferences];

      // For categories that only have push (keywordTaskAlerts, recommendedTaskAlerts)
      if (category === 'keywordTaskAlerts' || category === 'recommendedTaskAlerts') {
        return channel === 'push' && (categoryPrefs as { push: boolean }).push === true;
      }

      // For other categories with multiple channels
      if (categoryPrefs && 'push' in categoryPrefs  && 'email' in categoryPrefs && 'sms' in categoryPrefs) {
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
      let preferences = await NotificationPreferences.findOne({ userId });

      if (!preferences) {
        // Create default preferences
        preferences = await (NotificationPreferences as any).createDefault(userId);
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
      let userPreferences = await NotificationPreferences.findOne({ userId });

      if (!userPreferences) {
        userPreferences = await (NotificationPreferences as any).createDefault(userId);
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
}



