import mongoose, { Schema, Model, Document } from 'mongoose';
import { NotificationPreferences as INotificationPreferences } from '../types';

export interface INotificationPreferencesDocument extends Document, INotificationPreferences {
  userId: string;
  /** Master toggle for the push channel (mirrors user-service push.enabled) */
  pushEnabled?: boolean;
  /** Master toggle for the email channel (mirrors user-service email.enabled) */
  emailEnabled?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const NotificationPreferencesSchema = new Schema<INotificationPreferencesDocument>({
  userId: {
    type: String,
    required: false,
    sparse: true,  // Allow multiple null values
    unique: true,  // But enforce uniqueness when userId exists
    index: true
  },
  // Master channel toggles — mirrors user-service push.enabled / email.enabled
  pushEnabled: { type: Boolean, default: true },
  emailEnabled: { type: Boolean, default: true },
  payments: {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    sms: { type: Boolean, default: true }
  },
  taskUpdates: {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    sms: { type: Boolean, default: true }
  },
  taskReminders: {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    sms: { type: Boolean, default: true }
  },
  keywordTaskAlerts: {
    push: { type: Boolean, default: true }
  },
  recommendedTaskAlerts: {
    push: { type: Boolean, default: true }
  },
  helpfulInformation: {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    sms: { type: Boolean, default: true }
  },
  updatesNewsletters: {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    sms: { type: Boolean, default: true }
  }
}, {
  timestamps: true
});

// Create default preferences static method
NotificationPreferencesSchema.statics.createDefault = async function(userId: string) {
  return this.create({
    userId,
    pushEnabled: true,
    emailEnabled: true,
    payments: { email: true, push: true, sms: true },
    taskUpdates: { email: true, push: true, sms: true },
    taskReminders: { email: true, push: true, sms: true },
    keywordTaskAlerts: { push: true },
    recommendedTaskAlerts: { push: true },
    helpfulInformation: { email: true, push: true, sms: true },
    updatesNewsletters: { email: true, push: true, sms: true }
  });
};

const NotificationPreferences: Model<INotificationPreferencesDocument> = 
  mongoose.models.NotificationPreferences || 
  mongoose.model<INotificationPreferencesDocument>('NotificationPreferences', NotificationPreferencesSchema);

export default NotificationPreferences;


























