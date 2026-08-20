import mongoose, { Schema, Model, Document } from 'mongoose';

export interface IFCMTokenDocument extends Document {
  userId: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  deviceId?: string;
  lastActive: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const FCMTokenSchema = new Schema<IFCMTokenDocument>({
  userId: {
    type: String,
    required: true,
    index: true
  },
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  platform: {
    type: String,
    enum: ['ios', 'android', 'web'],
    required: true,
    index: true
  },
  deviceId: {
    type: String,
    index: true
  },
  lastActive: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound index for user + platform queries
FCMTokenSchema.index({ userId: 1, platform: 1 });

// Remove old tokens when new one is added for same device
FCMTokenSchema.pre('save', async function(next) {
  if (this.isNew && this.deviceId) {
    // Remove old tokens for the same device
    await (this.constructor as Model<IFCMTokenDocument>).deleteMany({ 
      userId: this.userId, 
      deviceId: this.deviceId,
      _id: { $ne: this._id }
    });
  }
  next();
});

const FCMToken: Model<IFCMTokenDocument> = 
  mongoose.models.FCMToken || 
  mongoose.model<IFCMTokenDocument>('FCMToken', FCMTokenSchema);

export default FCMToken;



























