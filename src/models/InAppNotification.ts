import mongoose, { Schema, Model, Document } from 'mongoose';

export interface IInAppNotificationDocument extends Document {
  userId: string;
  title: string;
  body: string;
  type: string; // 'info' | 'warning' | 'error' | 'success'
  category?: string; // 'taskUpdates', 'payments', 'system', etc.
  read: boolean;
  readAt?: Date;
  data?: Record<string, any>; // For storing additional metadata
  expiresAt?: Date; // For auto-deletion
  createdAt: Date;
  updatedAt: Date;
}

const InAppNotificationSchema = new Schema<IInAppNotificationDocument>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['info', 'warning', 'error', 'success'],
      default: 'info',
      index: true,
    },
    category: {
      type: String,
      index: true,
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
    data: {
      type: Schema.Types.Mixed,
      default: null,
    },
    expiresAt: {
      type: Date,
      index: true,
      sparse: true,
    },
  },
  {
    timestamps: true,
  }
);

// Create compound index for user + read status
InAppNotificationSchema.index({ userId: 1, read: 1 });

// Create compound index for user + createdAt for sorting
InAppNotificationSchema.index({ userId: 1, createdAt: -1 });

// TTL index for auto-deletion of old notifications
InAppNotificationSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, sparse: true }
);

// Pre-save hook to set default expiresAt (30 days from now)
InAppNotificationSchema.pre('save', function (next) {
  if (!this.expiresAt) {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    this.expiresAt = thirtyDaysFromNow;
  }
  next();
});

const InAppNotification: Model<IInAppNotificationDocument> =
  mongoose.models.InAppNotification ||
  mongoose.model<IInAppNotificationDocument>(
    'InAppNotification',
    InAppNotificationSchema
  );

export default InAppNotification;
