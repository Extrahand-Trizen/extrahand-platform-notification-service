import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import NotificationCampaign from '../models/NotificationCampaign';
import { CampaignAudienceService } from '../services/CampaignAudienceService';
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
      const { title, body, imageUrl, deepLink, templateId, audienceFilter, scheduledAt } = req.body;
      const createdBy = req.user?.uid || (req as any).userId || 'admin';

      if (!title || !body || !audienceFilter) {
        throw new BadRequestError('title, body, and audienceFilter are required');
      }

      // Query audience list to fetch count
      const userIds = await CampaignAudienceService.resolveAudience(audienceFilter);

      const campaign = await NotificationCampaign.create({
        title,
        body,
        imageUrl,
        deepLink,
        templateId,
        audienceFilter,
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

      const total = await NotificationCampaign.countDocuments();
      const campaigns = await NotificationCampaign.find()
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
}
