import mongoose, { Document, Schema } from 'mongoose';

export interface IS3Config extends Document {
  name: string;
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string; // stored encrypted
  createdAt: Date;
  updatedAt: Date;
}

const S3ConfigSchema = new Schema<IS3Config>(
  {
    name: { type: String, required: true },
    endpoint: { type: String, required: true },
    bucket: { type: String, required: true },
    region: { type: String, required: true, default: 'us-east-1' },
    accessKeyId: { type: String, required: true },
    secretAccessKey: { type: String, required: true }, // encrypted via AES-256-GCM
  },
  { timestamps: true }
);

export default mongoose.model<IS3Config>('S3Config', S3ConfigSchema);
