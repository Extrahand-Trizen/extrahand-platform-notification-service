import mongoose, { Schema, Model, Document } from 'mongoose';

export interface INotificationTemplateDocument extends Document {
  name: string;
  templateKey: string;
  audience: 'customers' | 'helpers' | 'both';
  title: string;
  body: string;
  placeholders: string[];
  category: string; // e.g., 'promotions', 'taskUpdates'
  imageUrl?: string;
  deepLink?: string;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationTemplateSchema = new Schema<INotificationTemplateDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    templateKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    audience: {
      type: String,
      enum: ['customers', 'helpers', 'both'],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    placeholders: {
      type: [String],
      default: [],
    },
    category: {
      type: String,
      required: true,
      default: 'promotions',
      index: true,
    },
    imageUrl: {
      type: String,
      default: null,
    },
    deepLink: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
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

// Compound index for finding active templates by audience type
NotificationTemplateSchema.index({ audience: 1, isActive: 1 });

const NotificationTemplate: Model<INotificationTemplateDocument> =
  mongoose.models.NotificationTemplate ||
  mongoose.model<INotificationTemplateDocument>(
    'NotificationTemplate',
    NotificationTemplateSchema
  );

export default NotificationTemplate;
