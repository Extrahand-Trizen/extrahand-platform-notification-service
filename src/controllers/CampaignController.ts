import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import NotificationCampaign from '../models/NotificationCampaign';
import InAppNotification from '../models/InAppNotification';
import { CampaignAudienceService } from '../services/CampaignAudienceService';
import { ADMIN_BROADCAST_SOURCE, CAMPAIGN_APPS, isCampaignApp } from '../constants/campaignApps';

const MAX_SELECTED_USERS = 500;
import { BadRequestError, NotFoundError } from '../errors/AppError';
import logger from '../config/logger';

export class CampaignController {
  /**
   * POST /api/v1/notifications/campaigns/preview
   * Get the matched users count based on audience filters (role, location, status, etc.)
   */
  static async previewAudience(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { filters } = req.body;
      if (!filters) {
        throw new BadRequestError('filters object is required');
      }

      // Resolve matching target user uids
      const userIds = await CampaignAudienceService.resolveAudience(filters);
      res.json({
        success: true,
        data: {
          matchedCount: userIds.length,
          filters,
        },
      });
    } catch (error: any) {
      logger.error('Error previewing campaign audience:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to preview campaign audience',
      });
    }
  }

  /**
   * POST /api/v1/notifications/campaigns
   * Create, queue or schedule a campaign
   */
  static async createCampaign(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { title, body, imageUrl, deepLink, templateId, audienceFilter, scheduledAt, app } = req.body;
      const createdBy = req.body.createdBy || req.user?.uid || (req as any).userId || 'admin';

      if (app !== undefined && app !== null && !isCampaignApp(app)) {
        throw new BadRequestError(`app must be one of: ${Object.keys(CAMPAIGN_APPS).join(', ')}`);
      }
      if (!title || !body || (!app && !audienceFilter)) {
        throw new BadRequestError('title, body, and audienceFilter (or app) are required');
      }
      if (scheduledAt && Number.isNaN(new Date(scheduledAt).getTime())) {
        throw new BadRequestError('scheduledAt must be a valid date');
      }

      let selectedUserIds: string[] | undefined;
      if (req.body.userIds !== undefined) {
        if (!app) {
          throw new BadRequestError('userIds can only be used together with app');
        }
        if (!Array.isArray(req.body.userIds)) {
          throw new BadRequestError('userIds must be an array');
        }
        selectedUserIds = Array.from(
          new Set(req.body.userIds.map((id: unknown) => String(id || '').trim()).filter(Boolean))
        ) as string[];
        if (selectedUserIds.length === 0 || selectedUserIds.length > MAX_SELECTED_USERS) {
          throw new BadRequestError(`userIds must contain 1 to ${MAX_SELECTED_USERS} users`);
        }
      }

      // Query audience list to fetch count
      const userIds = selectedUserIds
        ? selectedUserIds
        : app
          ? await CampaignAudienceService.resolveAppAudience(app)
          : await CampaignAudienceService.resolveAudience(audienceFilter);

      const campaign = await NotificationCampaign.create({
        title,
        body,
        imageUrl,
        deepLink,
        templateId,
        app: app || null,
        userIds: selectedUserIds,
        audienceFilter: audienceFilter || {},
        audienceSize: userIds.length,
        status: 'QUEUED', // The worker polls for scheduledAt <= now to process scheduled ones
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        createdBy,
      });

      res.status(201).json({
        success: true,
        data: campaign,
        message: scheduledAt ? 'Campaign scheduled successfully' : 'Campaign queued successfully',
      });
    } catch (error: any) {
      logger.error('Error creating campaign:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to create campaign',
      });
    }
  }

  /**
   * GET /api/v1/notifications/campaigns
   * Get campaign history (paginated)
   */
  static async getCampaigns(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = parseInt(req.query.skip as string) || 0;
      const { app } = req.query;

      // `app=any` → only app broadcasts; a specific app → that app's broadcasts.
      const filter: Record<string, any> = {};
      if (app === 'any') {
        filter.app = { $in: Object.keys(CAMPAIGN_APPS) };
      } else if (app !== undefined) {
        if (!isCampaignApp(app)) {
          throw new BadRequestError(`app must be 'any' or one of: ${Object.keys(CAMPAIGN_APPS).join(', ')}`);
        }
        filter.app = app;
      }

      const total = await NotificationCampaign.countDocuments(filter);
      const campaigns = await NotificationCampaign.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip);

      res.json({
        success: true,
        data: {
          campaigns,
          total,
          limit,
          skip,
        },
      });
    } catch (error: any) {
      logger.error('Error fetching campaigns list:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to fetch campaigns list',
      });
    }
  }

  /**
   * GET /api/v1/notifications/campaigns/:id
   * Get single campaign details and execution statistics
   */
  static async getCampaignById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const campaign = await NotificationCampaign.findById(id);

      if (!campaign) {
        throw new NotFoundError('Campaign not found');
      }

      res.json({
        success: true,
        data: campaign,
      });
    } catch (error: any) {
      logger.error('Error fetching campaign details:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to fetch campaign details',
      });
    }
  }

  /**
   * POST /api/v1/notifications/campaigns/:id/cancel
   * Cancel a campaign that has not started sending yet.
   */
  static async cancelCampaign(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const campaign = await NotificationCampaign.findOneAndUpdate(
        { _id: id, status: 'QUEUED' },
        { $set: { status: 'CANCELLED' } },
        { new: true }
      );

      if (!campaign) {
        throw new BadRequestError('Only campaigns that have not started sending can be cancelled');
      }

      res.json({ success: true, data: campaign, message: 'Campaign cancelled' });
    } catch (error: any) {
      logger.error('Error cancelling campaign:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to cancel campaign',
      });
    }
  }

  /**
   * POST /api/v1/notifications/campaigns/clear
   * Delete every admin-broadcast in-app notification of one app, for all users.
   * Order, payment, OTP and other system notifications are never touched.
   */
  static async clearAppBroadcasts(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { app } = req.body || {};
      if (!isCampaignApp(app)) {
        throw new BadRequestError(`app must be one of: ${Object.keys(CAMPAIGN_APPS).join(', ')}`);
      }

      const result = await InAppNotification.deleteMany({
        'data.source': ADMIN_BROADCAST_SOURCE,
        'data.app': app,
      });
      const deletedCount = result.deletedCount ?? 0;

      logger.warn('Cleared admin broadcast in-app notifications', {
        app,
        deletedCount,
        sourceService: req.headers['x-service-name'],
      });

      res.json({
        success: true,
        data: { app, deletedCount },
        message: `${deletedCount} notification(s) cleared`,
      });
    } catch (error: any) {
      logger.error('Error clearing app broadcasts:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to clear notifications',
      });
    }
  }
}
