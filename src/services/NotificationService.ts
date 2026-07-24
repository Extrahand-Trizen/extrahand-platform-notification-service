import axios from 'axios';
import mongoose from 'mongoose';
import { admin } from '../config/firebase';
import logger from '../config/logger';
import NotificationPreferences from '../models/NotificationPreferences';
import FCMToken, { IFCMTokenDocument } from '../models/FCMToken';
import { NotificationPayload, NotificationPreferences as INotificationPreferences } from '../types';
import { NotFoundError } from '../errors/AppError';
import { validateEnv } from '../config/env';
import { buildPushSoundPayload, usesCustomPushSound } from '../utils/pushSound';
import { fcmCircuit } from '../utils/CircuitBreaker';

export class NotificationService {
  /**
   * OTP, payments, and other critical alerts must always appear in-app
   * even when the category is not in the user's preference schema.
   */
  private static isMandatoryInAppNotification(
    category?: string,
    data?: Record<string, any>
  ): boolean {
    const cat = String(category || '').trim().toLowerCase();
    if (cat === 'transactional' || cat === 'system') return true;
    if (String(data?.otpType || '').trim() === 'task_start') return true;
    if (data?.mandatory === true) return true;
    return false;
  }

  /**
   * Check if notification should be sent based on user preferences
   */
  static async shouldSendNotification(
    userId: string,
    category: keyof INotificationPreferences,
    channel: 'push' | 'email' | 'sms'
  ): Promise<boolean> {
    try {
      const normalizedCategory = String(category || '').trim().toLowerCase();
      const isTaskDiscoveryCategory =
        normalizedCategory === 'recommendedtaskalerts' ||
        normalizedCategory === 'keywordtaskalerts';

      const env = validateEnv();
      const userServiceUrl = env.USER_SERVICE_URL;

      if (userServiceUrl) {
        try {
          const response = await axios.get(
            `${userServiceUrl}/api/v1/notification-preferences/${userId}/can-send`,
            {
              params: {
                channel,
                category,
              },
              headers: {
                'X-Service-Auth': env.SERVICE_AUTH_TOKEN || '',
                'X-Service-Name': 'notification-service',
              },
              timeout: 5000,
            }
          );

          const canSend = response.data?.data?.canSend;
          if (typeof canSend === 'boolean') {
            return canSend;
          }

          logger.warn('User-service preference check returned invalid format, falling back to local prefs', {
            userId,
            category,
            channel,
          });
        } catch (error: any) {
          logger.warn('User-service preference check failed, falling back to local prefs', {
            userId,
            category,
            channel,
            error: error?.message || 'Unknown error',
          });
        }
      }

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

      // If still no preferences after all attempts, block to avoid unwanted sends
      // Exception: chat messages (CHAT_MESSAGE / taskUpdates) are always allowed
      // because blocking them silently breaks the core messaging feature.
      if (!preferences) {
        const isChatCategory = normalizedCategory === 'taskupdates';
        if (isChatCategory || (channel === 'push' && isTaskDiscoveryCategory)) {
          logger.warn('No preferences found — allowing notification (fail-open)', {
            userId,
            category,
            channel,
          });
          return true;
        }
        logger.warn('No preferences found after creation attempts, blocking notification', { userId, category });
        return false;
      }

      const categoryPrefs = preferences[category as keyof INotificationPreferences];

      // If category doesn't exist in preferences, block to avoid unwanted sends
      // Exception: taskUpdates (chat messages) are always allowed
      if (!categoryPrefs) {
        const isChatCategory = normalizedCategory === 'taskupdates';
        if (isChatCategory || (channel === 'push' && isTaskDiscoveryCategory)) {
          logger.warn('Category not found in preferences — allowing notification (fail-open)', {
            userId,
            category,
            channel,
          });
          return true;
        }
        logger.warn('Category not found in preferences, blocking notification', { userId, category });
        return false;
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
      const normalizedCategory = String(category || '').trim().toLowerCase();
      const shouldFailOpenForPush =
        normalizedCategory === 'taskupdates' ||
        normalizedCategory === 'recommendedtaskalerts' ||
        normalizedCategory === 'keywordtaskalerts';

      // Fail open for key real-time channels so task discovery/chat never silently drops.
      // Other channels/categories remain fail-closed to avoid spam.
      if (channel === 'push' && shouldFailOpenForPush) {
        logger.warn('shouldSendNotification: failing open for push after preference-check error', {
          userId,
          category,
        });
        return true;
      }
      return false;
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

      const pushData: Record<string, unknown> = {
        type: notification.type,
        eventKey: notification.type,
        category: notification.category,
        title: notification.title,
        body: notification.body,
        ...(notification.data || {}),
      };

      const soundPayload = buildPushSoundPayload({
        type: notification.type,
        category: notification.category,
        data: pushData,
      });

      const stringifiedData = Object.fromEntries(
        Object.entries(pushData).map(([k, v]) => [k, v == null ? '' : String(v)]),
      );

      const playCustomSound = usesCustomPushSound({
        type: notification.type,
        category: notification.category,
        data: pushData,
      });

      // Data-only for custom-sound alerts so the mobile app displays via Notifee
      // with the correct Android channel + bundled sound (OS-handled notification
      // blocks skip Notifee and often miss the custom ringtone).
      const message = playCustomSound
        ? {
            data: stringifiedData,
            android: { priority: 'high' as const },
            apns: {
              payload: {
                aps: {
                  'content-available': 1,
                },
              },
              headers: {
                'apns-priority': '10',
              },
            },
          }
        : {
            notification: {
              title: notification.title,
              body: notification.body,
            },
            data: stringifiedData,
            ...soundPayload,
          };

      // Send to all tokens (circuit breaker — push failures must not break callers)
      const tokenStrings = tokens.map(t => t.token);
      const response = await fcmCircuit.runSafe(
        () =>
          admin.messaging().sendEachForMulticast({
            tokens: tokenStrings,
            ...message,
          }),
        null
      );

      if (!response) {
        logger.warn('Push notification skipped (FCM circuit open or provider error)', {
          userId,
          type: notification.type,
        });
        return { success: false, sent: 0, failed: tokenStrings.length };
      }

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
      logger.error('Error sending push notification (non-fatal):', error);
      return { success: false, sent: 0, failed: 0 };
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
    const normalizedToken = typeof token === 'string' ? token.trim() : '';
    if (!normalizedToken) {
      throw new Error('FCM token is required');
    }

    const updatePayload = {
      userId,
      token: normalizedToken,
      platform,
      deviceId,
      lastActive: new Date(),
    };

    try {
      // Atomic upsert — safe when the app re-registers the same device token
      // (e.g. account switch) or when concurrent POST /token requests race.
      const fcmToken = await FCMToken.findOneAndUpdate(
        { token: normalizedToken },
        { $set: updatePayload },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      if (!fcmToken) {
        throw new Error('FCM token upsert returned no document');
      }

      logger.info(`Registered/updated FCM token for user: ${userId}`, {
        platform,
        hasDeviceId: !!deviceId,
      });

      return fcmToken;
    } catch (error: any) {
      // Concurrent upserts can still collide on the unique token index — retry once as update.
      if (error?.code === 11000) {
        try {
          const existing = await FCMToken.findOneAndUpdate(
            { token: normalizedToken },
            { $set: updatePayload },
            { new: true },
          );
          if (existing) {
            logger.info(`Reassigned existing FCM token to user after duplicate-key race: ${userId}`);
            return existing;
          }
        } catch (retryError: any) {
          logger.error('Error reassigning FCM token after duplicate-key race:', retryError);
          throw new Error(`Failed to register FCM token: ${retryError.message}`);
        }
      }

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
          payments: { email: true, push: true, sms: true },
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
        payments: preferences?.payments || { email: true, push: true, sms: true },
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
      if (preferences.payments) {
        userPreferences!.payments = {
          ...userPreferences!.payments,
          ...preferences.payments
        };
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
        payments: userPreferences?.payments || { email: true, push: true, sms: true },
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
      const category = (data.category || 'taskUpdates') as keyof INotificationPreferences;
      const mandatory = this.isMandatoryInAppNotification(data.category, data.data);
      const canSend = mandatory
        ? true
        : await this.shouldSendNotification(data.userId, category, 'push');

      logger.info('[NotificationService.createInAppNotification] Preference decision', {
        userId: data.userId,
        category,
        channel: 'push',
        canSend,
        mandatory,
        type: data.type || 'info',
        taskId: data.data?.taskId,
      });

      if (!canSend) {
        logger.info('In-app notification skipped - user preferences disabled', {
          userId: data.userId,
          category,
          type: data.type || 'info'
        });
        return null;
      }

      const InAppNotification = (await import('../models/InAppNotification')).default;

      // Resolve recipientRole from the task before saving
      let resolvedData: Record<string, any> = { ...(data.data || {}) };
      const taskId = resolvedData.taskId;
      if (taskId) {
        try {
          logger.info('[NotificationService] STEP 1 - Querying task doc', {
            dbName: mongoose.connection.db?.databaseName,
            readyState: mongoose.connection.readyState,
            taskId,
            recipientUserId: data.userId,
            existingRecipientRole: resolvedData.recipientRole ?? 'none',
          });
          const taskDoc = await mongoose.connection
            .collection('tasks')
            .findOne(
              { _id: new mongoose.Types.ObjectId(String(taskId)) },
              { projection: { bookingSource: 1, requesterId: 1, assigneeId: 1, assigneeUid: 1 } }
            );
          logger.info('[NotificationService] STEP 2 - Task query result', {
            found: Boolean(taskDoc),
            bookingSource: (taskDoc as any)?.bookingSource,
            requesterId: (taskDoc as any)?.requesterId?.toString(),
            assigneeId: (taskDoc as any)?.assigneeId?.toString(),
            assigneeUid: (taskDoc as any)?.assigneeUid,
          });

          if (taskDoc) {
            const currentRole = resolvedData.recipientRole;

            if ((taskDoc as any).bookingSource === 'book_now') {
              resolvedData.recipientRole = 'partner';
              logger.info('[NotificationService] STEP 3 - Role from bookingSource=book_now', { recipientRole: 'partner' });
            } else if (currentRole === 'helper' || currentRole === 'tasker') {
              resolvedData.recipientRole = 'tasker';
              logger.info('[NotificationService] STEP 3 - Role from explicit currentRole', { currentRole, recipientRole: 'tasker' });
            } else if (currentRole === 'customer') {
              resolvedData.recipientRole = 'customer';
              logger.info('[NotificationService] STEP 3 - Role from explicit currentRole', { currentRole, recipientRole: 'customer' });
            } else {
              // currentRole is absent — infer by matching userId against task's assignee/requester
              logger.info('[NotificationService] STEP 3 - currentRole absent, inferring from task fields', {
                recipientUserId: data.userId,
              });

              // Step 3a: Check if recipient is the assignee (helper) via Firebase UID directly
              const isAssigneeByUid = (taskDoc as any).assigneeUid && (taskDoc as any).assigneeUid === data.userId;

              // Step 3b: Look up profile to get MongoDB _id for requesterId/assigneeId comparison
              let profileId: string | undefined;
              try {
                const profileDoc = await mongoose.connection
                  .collection('profiles')
                  .findOne({ uid: data.userId }, { projection: { _id: 1 } });
                profileId = profileDoc?._id?.toString();
                logger.info('[NotificationService] STEP 3b - Profile lookup', {
                  recipientUserId: data.userId,
                  profileId: profileId ?? 'not found',
                });
              } catch (profileErr: any) {
                logger.warn('[NotificationService] STEP 3b - Profile lookup failed', { error: profileErr?.message });
              }

              const isAssigneeById = profileId && (taskDoc as any).assigneeId?.toString() === profileId;
              const isRequesterById = profileId && (taskDoc as any).requesterId?.toString() === profileId;

              logger.info('[NotificationService] STEP 3c - Comparison results', {
                isAssigneeByUid,
                isAssigneeById,
                isRequesterById,
              });

              if (isAssigneeByUid || isAssigneeById) {
                resolvedData.recipientRole = 'tasker';
              } else if (isRequesterById) {
                resolvedData.recipientRole = 'customer';
              } else {
                logger.warn('[NotificationService] STEP 3d - Could not infer role, leaving recipientRole unset', {
                  recipientUserId: data.userId,
                  taskId,
                });
              }
            }

            logger.info('[NotificationService] STEP 4 - Final resolved recipientRole', {
              taskId,
              bookingSource: (taskDoc as any).bookingSource,
              recipientRole: resolvedData.recipientRole ?? 'UNSET',
            });
          }
        } catch (roleErr: any) {
          logger.warn('[NotificationService] Failed to resolve recipientRole from task', {
            taskId,
            error: roleErr?.message,
          });
        }
      }


      const notification = await InAppNotification.create({
        userId: data.userId,
        title: data.title,
        body: data.body,
        type: data.type || 'info',
        category: data.category,
        data: resolvedData,
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
      const category = (data.category || 'taskUpdates') as keyof INotificationPreferences;
      const mandatory = this.isMandatoryInAppNotification(data.category, data.data);

      // Resolve recipientRole from the task before batch-saving
      let resolvedBatchData: Record<string, any> = { ...(data.data || {}) };
      const batchTaskId = resolvedBatchData.taskId;
      if (batchTaskId) {
        try {
          const taskDoc = await mongoose.connection
            .collection('tasks')
            .findOne(
              { _id: new mongoose.Types.ObjectId(String(batchTaskId)) },
              { projection: { bookingSource: 1 } }
            );
          if (taskDoc) {
            const currentRole = resolvedBatchData.recipientRole;
            if ((taskDoc as any).bookingSource === 'book_now') {
              resolvedBatchData.recipientRole = 'partner';
            } else if (currentRole === 'helper' || !currentRole) {
              resolvedBatchData.recipientRole = 'tasker';
            }
            logger.info('[NotificationService] Batch resolved recipientRole', {
              taskId: batchTaskId,
              bookingSource: (taskDoc as any).bookingSource,
              recipientRole: resolvedBatchData.recipientRole,
            });
          }
        } catch (roleErr: any) {
          logger.warn('[NotificationService] Failed to resolve batch recipientRole from task', {
            taskId: batchTaskId,
            error: roleErr?.message,
          });
        }
      }

      const preferenceResults = await Promise.all(
        data.userIds.map(async (userId) => {
          const canSend = mandatory
            ? true
            : await this.shouldSendNotification(userId, category, 'push');
          return { userId, canSend };
        })
      );

      const allowedUserIds = preferenceResults
        .filter((result) => result.canSend)
        .map((result) => result.userId);

      if (allowedUserIds.length === 0) {
        logger.info('Batch in-app notifications skipped - all users have disabled preferences', {
          totalRequested: data.userIds.length,
          category,
          type: data.type || 'info'
        });
        return {
          total: data.userIds.length,
          created: 0,
          failed: data.userIds.length
        };
      }
      
      const notifications = allowedUserIds.map(userId => ({
        userId,
        title: data.title,
        body: data.body,
        type: data.type || 'info',
        category: data.category,
        data: resolvedBatchData,
        read: false
      }));

      const result = await InAppNotification.insertMany(notifications, { ordered: false });

      logger.info(`Created batch in-app notifications`, {
        total: data.userIds.length,
        created: result.length,
        blockedByPreferences: data.userIds.length - allowedUserIds.length,
        userIds: allowedUserIds.slice(0, 5).join(',') + (allowedUserIds.length > 5 ? '...' : '')
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
   * Helper to build the role-based filter query.
   * If role === 'helper', it will match:
   *   - recipientRole is 'helper' or 'tasker'
   *   - OR recipientRole is unset/null/missing/empty
   * If role === 'partner', it will only match:
   *   - recipientRole is 'partner' or 'customer'
   */
  private static getRoleQuery(
    userId: string,
    role?: 'helper' | 'partner',
    extraConditions?: Record<string, any>
  ): Record<string, any> {
    const baseQuery: Record<string, any> = { userId, ...extraConditions };
    if (!role) {
      return baseQuery;
    }
    if (role === 'helper') {
      return {
        ...baseQuery,
        $or: [
          { 'data.recipientRole': { $in: ['helper', 'tasker'] } },
          { 'data.recipientRole': { $exists: false } },
          { 'data.recipientRole': null },
          { 'data.recipientRole': '' },
          { 'data': null }
        ]
      };
    } else {
      return {
        ...baseQuery,
        'data.recipientRole': { $in: ['partner', 'customer'] },
      };
    }
  }

  /**
   * Get in-app notifications for a user
   */
  static async getInAppNotifications(
    userId: string,
    limit: number = 50,
    skip: number = 0,
    unreadOnly: boolean = false,
    role?: 'helper' | 'partner'
  ): Promise<{
    notifications: any[];
    unreadCount: number;
    hasMore: boolean;
  }> {
    try {
      const InAppNotification = (await import('../models/InAppNotification')).default;

      const query = this.getRoleQuery(userId, role, unreadOnly ? { read: false } : {});

      // Get total unread count for this role filter
      const unreadCountQuery = this.getRoleQuery(userId, role, { read: false });
      const unreadCount = await InAppNotification.countDocuments(unreadCountQuery);

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
        hasMore,
        role,
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
  static async getUnreadNotificationCount(userId: string, role?: 'helper' | 'partner'): Promise<number> {
    try {
      const InAppNotification = (await import('../models/InAppNotification')).default;

      const query = this.getRoleQuery(userId, role, { read: false });
      const count = await InAppNotification.countDocuments(query);

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
  static async markAllInAppNotificationsAsRead(userId: string, role?: 'helper' | 'partner'): Promise<{ modifiedCount: number }> {
    try {
      const InAppNotification = (await import('../models/InAppNotification')).default;

      const query = this.getRoleQuery(userId, role, { read: false });

      const result = await InAppNotification.updateMany(query, {
        read: true,
        readAt: new Date()
      });

      logger.info(`Marked all notifications as read for user: ${userId}`, {
        modifiedCount: result.modifiedCount,
        role,
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

  /**
   * Delete all in-app notifications for a user
   */
  static async deleteAllInAppNotifications(
    userId: string,
    role?: 'helper' | 'partner'
  ): Promise<{ deletedCount: number }> {
    try {
      const InAppNotification = (await import('../models/InAppNotification')).default;

      const query = this.getRoleQuery(userId, role);

      const result = await InAppNotification.deleteMany(query);

      logger.info(`Deleted all in-app notifications for user: ${userId}`, {
        deletedCount: result.deletedCount ?? 0,
        role,
      });

      return { deletedCount: result.deletedCount ?? 0 };
    } catch (error: any) {
      logger.error('Error deleting all notifications:', error);
      throw new Error(`Failed to delete all notifications: ${error.message}`);
    }
  }
}



