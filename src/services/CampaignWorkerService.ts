import NotificationCampaign from '../models/NotificationCampaign';
import { NotificationService } from './NotificationService';
import { CampaignAudienceService } from './CampaignAudienceService';
import logger from '../config/logger';

export class CampaignWorkerService {
  private static isRunning = false;
  private static intervalId: NodeJS.Timeout | null = null;
  private static isProcessing = false;

  /**
   * Start the campaign background worker polling loop
   */
  static start(intervalMs: number = 10000): void {
    if (this.isRunning) {
      logger.info('Campaign background worker is already running');
      return;
    }

    this.isRunning = true;
    logger.info(`Campaign background worker started with interval: ${intervalMs}ms`);

    this.intervalId = setInterval(async () => {
      if (this.isProcessing) return; // Prevent concurrent campaign processing runs
      try {
        await this.processNextCampaign();
      } catch (error) {
        logger.error('Error in campaign polling cycle:', error);
      }
    }, intervalMs);
  }

  /**
   * Stop the background worker
   */
  static stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('Campaign background worker stopped');
  }

  /**
   * Query database and process the next queued campaign
   */
  private static async processNextCampaign(): Promise<void> {
    this.isProcessing = true;
    try {
      const now = new Date();
      // Find the oldest campaign queued for execution
      const campaign = await NotificationCampaign.findOne({
        status: 'QUEUED',
        $or: [
          { scheduledAt: null },
          { scheduledAt: { $lte: now } }
        ]
      }).sort({ createdAt: 1 });

      if (!campaign) {
        this.isProcessing = false;
        return;
      }

      logger.info(`Processing campaign: ${campaign._id} ("${campaign.title}")`);
      campaign.status = 'SENDING';
      await campaign.save();

      // 1. Resolve matching users from user-service
      let userIds: string[] = [];
      try {
        userIds = await CampaignAudienceService.resolveAudience(campaign.audienceFilter);
        campaign.audienceSize = userIds.length;
        await campaign.save();
        logger.info(`Resolved audience of size ${userIds.length} for campaign: ${campaign._id}`);
      } catch (err: any) {
        logger.error(`Failed to resolve audience for campaign ${campaign._id}:`, err);
        campaign.status = 'FAILED';
        await campaign.save();
        this.isProcessing = false;
        return;
      }

      if (userIds.length === 0) {
        logger.warn(`No users resolved for campaign: ${campaign._id}. Completing execution.`);
        campaign.status = 'COMPLETED';
        await campaign.save();
        this.isProcessing = false;
        return;
      }

      // 2. Batch send in chunks of 500 (standard FCM multicast constraint / bulk limit)
      const chunkSize = 500;
      let totalSent = 0;
      let totalFailed = 0;

      // Handle resume cursor if it was interrupted previously
      let startIndex = 0;
      if (campaign.resumeCursor) {
        const resumeIndex = parseInt(campaign.resumeCursor, 10);
        if (!isNaN(resumeIndex) && resumeIndex > 0 && resumeIndex < userIds.length) {
          startIndex = resumeIndex;
          totalSent = campaign.sentCount;
          totalFailed = campaign.failedCount;
          logger.info(`Resuming campaign ${campaign._id} execution from index: ${startIndex}`);
        }
      }

      for (let i = startIndex; i < userIds.length; i += chunkSize) {
        // Double-check if status has been aborted or modified externally
        const refreshedCampaign = await NotificationCampaign.findById(campaign._id);
        if (refreshedCampaign && refreshedCampaign.status !== 'SENDING') {
          logger.warn(`Campaign ${campaign._id} status changed to ${refreshedCampaign.status}. Aborting execution.`);
          this.isProcessing = false;
          return;
        }

        const chunk = userIds.slice(i, i + chunkSize);
        logger.info(`Sending batch chunk (${i} to ${i + chunk.length}) for campaign: ${campaign._id}`);

        // Loop inside chunk to invoke NotificationService (reusing preferences validation and token registration fetches)
        for (const userId of chunk) {
          try {
            const result = await NotificationService.sendPushNotification(userId, {
              type: 'promotions',
              title: campaign.title,
              body: campaign.body,
              category: campaign.audienceFilter.category || 'promotions',
              data: {
                ...(campaign.imageUrl ? { imageUrl: campaign.imageUrl } : {}),
                ...(campaign.deepLink ? { screen: campaign.deepLink, deepLink: campaign.deepLink } : {}),
                campaignId: campaign._id.toString(),
              }
            });

            totalSent += result.sent;
            totalFailed += result.failed;
          } catch (err: any) {
            logger.error(`Error sending campaign notification to user ${userId}:`, err);
            totalFailed++;
          }
        }

        // Update progress counters and resume cursor in database after each batch
        campaign.sentCount = totalSent;
        campaign.failedCount = totalFailed;
        campaign.resumeCursor = (i + chunk.length).toString();
        await campaign.save();
      }

      // 3. Mark campaign execution complete
      campaign.status = 'COMPLETED';
      campaign.resumeCursor = undefined; // clear resume pointer
      await campaign.save();
      logger.info(`Campaign ${campaign._id} completed processing. Sent: ${totalSent}, Failed: ${totalFailed}`);

    } catch (error: any) {
      logger.error('Error executing campaign background run:', error);
    } finally {
      this.isProcessing = false;
    }
  }
}
