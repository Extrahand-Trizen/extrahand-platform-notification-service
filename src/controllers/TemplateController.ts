import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import NotificationTemplate from '../models/NotificationTemplate';
import { BadRequestError, NotFoundError } from '../errors/AppError';
import logger from '../config/logger';

export class TemplateController {
  /**
   * POST /api/v1/notifications/templates
   * Create a new notification template
   */
  static async createTemplate(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { name, templateKey, audience, title, body, placeholders, category, imageUrl, deepLink } = req.body;
      const createdBy = req.user?.uid || (req as any).userId || 'admin';

      if (!name || !templateKey || !audience || !title || !body) {
        throw new BadRequestError('name, templateKey, audience, title, and body are required');
      }

      // Check if templateKey already exists
      const existing = await NotificationTemplate.findOne({ templateKey });
      if (existing) {
        throw new BadRequestError(`Template with key '${templateKey}' already exists`);
      }

      const template = await NotificationTemplate.create({
        name,
        templateKey,
        audience,
        title,
        body,
        placeholders: placeholders || [],
        category: category || 'promotions',
        imageUrl,
        deepLink,
        createdBy,
      });

      res.status(201).json({
        success: true,
        data: template,
        message: 'Template created successfully',
      });
    } catch (error: any) {
      logger.error('Error creating template:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to create template',
      });
    }
  }

  /**
   * GET /api/v1/notifications/templates
   * Get all active templates or filter by audience
   */
  static async getTemplates(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { audience, includeInactive } = req.query;
      const filter: Record<string, any> = {};

      if (audience && ['customers', 'helpers', 'both'].includes(audience as string)) {
        filter.audience = audience;
      }
      if (includeInactive !== 'true') {
        filter.isActive = true;
      }

      const templates = await NotificationTemplate.find(filter).sort({ createdAt: -1 });

      res.json({
        success: true,
        data: templates,
      });
    } catch (error: any) {
      logger.error('Error fetching templates:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to fetch templates',
      });
    }
  }

  /**
   * GET /api/v1/notifications/templates/:id
   * Get template by ID
   */
  static async getTemplateById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const template = await NotificationTemplate.findById(id);

      if (!template) {
        throw new NotFoundError('Template not found');
      }

      res.json({
        success: true,
        data: template,
      });
    } catch (error: any) {
      logger.error('Error fetching template details:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to fetch template details',
      });
    }
  }

  /**
   * PUT /api/v1/notifications/templates/:id
   * Update template
   */
  static async updateTemplate(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { name, audience, title, body, placeholders, category, imageUrl, deepLink, isActive } = req.body;

      const template = await NotificationTemplate.findById(id);
      if (!template) {
        throw new NotFoundError('Template not found');
      }

      if (name !== undefined) template.name = name;
      if (audience !== undefined) template.audience = audience;
      if (title !== undefined) template.title = title;
      if (body !== undefined) template.body = body;
      if (placeholders !== undefined) template.placeholders = placeholders;
      if (category !== undefined) template.category = category;
      if (imageUrl !== undefined) template.imageUrl = imageUrl;
      if (deepLink !== undefined) template.deepLink = deepLink;
      if (isActive !== undefined) template.isActive = isActive;

      await template.save();

      res.json({
        success: true,
        data: template,
        message: 'Template updated successfully',
      });
    } catch (error: any) {
      logger.error('Error updating template:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to update template',
      });
    }
  }

  /**
   * DELETE /api/v1/notifications/templates/:id
   * Deactivate or delete template
   */
  static async deleteTemplate(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { hardDelete } = req.query;

      if (hardDelete === 'true') {
        const deleted = await NotificationTemplate.findByIdAndDelete(id);
        if (!deleted) {
          throw new NotFoundError('Template not found');
        }
        res.json({
          success: true,
          message: 'Template permanently deleted',
        });
        return;
      }

      const template = await NotificationTemplate.findById(id);
      if (!template) {
        throw new NotFoundError('Template not found');
      }

      template.isActive = false;
      await template.save();

      res.json({
        success: true,
        message: 'Template deactivated successfully',
      });
    } catch (error: any) {
      logger.error('Error deactivating/deleting template:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to deactivate template',
      });
    }
  }
}
