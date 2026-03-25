import mongoose, { Schema, Document } from 'mongoose';

export interface IScanJob extends Document {
  jobId: string;
  filename: string;
  status: 'pending' | 'scanning' | 'completed' | 'failed';
  s3Path: string;
  progress: number;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ScanJobSchema = new Schema<IScanJob>(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    filename: { type: String, required: true },
    status: { type: String, enum: ['pending', 'scanning', 'completed', 'failed'], default: 'pending' },
    s3Path: { type: String, required: true },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    error: { type: String }
  },
  { timestamps: true }
);

export const ScanJobModel = mongoose.model<IScanJob>('ScanJob', ScanJobSchema);
