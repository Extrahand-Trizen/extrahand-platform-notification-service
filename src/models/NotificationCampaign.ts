import mongoose, { Schema, Model, Document } from 'mongoose';
import { CAMPAIGN_APPS, CampaignApp } from '../constants/campaignApps';

export interface INotificationCampaignDocument extends Document {
  title: string;
  body: string;
  imageUrl?: string;
  deepLink?: string;
  templateId?: mongoose.Types.ObjectId;
  /** When set, the audience is every user of this app (audienceFilter is ignored). */
  app?: CampaignApp | null;
  audienceFilter: Record<string, any>;
  audienceSize: number;
  status: 'DRAFT' | 'QUEUED' | 'SENDING' | 'COMPLETED' | 'FAILED' | 'PARTIAL' | 'CANCELLED';
  failureReason?: string;
  sentCount: number;
  failedCount: number;
  resumeCursor?: string;
  scheduledAt?: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationCampaignSchema = new Schema<INotificationCampaignDocument>(
  {
    title: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    imageUrl: {
      type: String,
      default: null,
    },
    deepLink: {
      type: String,
      default: null,
    },
    templateId: {
      type: Schema.Types.ObjectId,
      ref: 'NotificationTemplate',
      default: null,
    },
    app: {
      type: String,
      enum: [...Object.keys(CAMPAIGN_APPS), null],
      default: null,
      index: true,
    },
    audienceFilter: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    audienceSize: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['DRAFT', 'QUEUED', 'SENDING', 'COMPLETED', 'FAILED', 'PARTIAL', 'CANCELLED'],
      default: 'DRAFT',
      index: true,
    },
    failureReason: {
      type: String,
      default: null,
    },
    sentCount: {
      type: Number,
      default: 0,
    },
    failedCount: {
      type: Number,
      default: 0,
    },
    resumeCursor: {
      type: String,
      default: null,
    },
    scheduledAt: {
      type: Date,
      default: null,
      index: true,
    },
    createdBy: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexing for tracking campaigns by status and creation time
NotificationCampaignSchema.index({ status: 1, createdAt: -1 });
NotificationCampaignSchema.index({ scheduledAt: 1, status: 1 });

const NotificationCampaign: Model<INotificationCampaignDocument> =
  mongoose.models.NotificationCampaign ||
  mongoose.model<INotificationCampaignDocument>(
    'NotificationCampaign',
    NotificationCampaignSchema
  );

export default NotificationCampaign;
