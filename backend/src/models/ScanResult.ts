import mongoose, { Schema, Document } from 'mongoose';

export interface IAccessibilityIssue {
  type: string;
  category: string;
  severity: 'critical' | 'major' | 'minor';
  description: string;
  suggestion: string;
  lineNumber?: number;
}

export interface IScanResult extends Document {
  jobId: string;
  filename: string;
  s3Path: string;
  totalIssues: number;
  issuesFixed: number;
  compliancePercentage: number;
  status: 'compliant' | 'partially_compliant' | 'non_compliant';
  issues: IAccessibilityIssue[];
  guidelines: {
    wcag: number;
    pdfua: number;
    ada: number;
    section508: number;
    eu: number;
  };
  scanStartTime: Date;
  scanEndTime: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AccessibilityIssueSchema = new Schema({
  type: String,
  category: String,
  severity: String,
  description: String,
  suggestion: String,
  lineNumber: Number
});

const ScanResultSchema = new Schema<IScanResult>(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    filename: { type: String, required: true },
    s3Path: { type: String, required: true },
    totalIssues: { type: Number, default: 0 },
    issuesFixed: { type: Number, default: 0 },
    compliancePercentage: { type: Number, default: 0 },
    status: { type: String, enum: ['compliant', 'partially_compliant', 'non_compliant'] },
    issues: [AccessibilityIssueSchema],
    guidelines: {
      wcag: { type: Number, default: 0 },
      pdfua: { type: Number, default: 0 },
      ada: { type: Number, default: 0 },
      section508: { type: Number, default: 0 },
      eu: { type: Number, default: 0 }
    },
    scanStartTime: { type: Date },
    scanEndTime: { type: Date }
  },
  { timestamps: true }
);

export const ScanResultModel = mongoose.model<IScanResult>('ScanResult', ScanResultSchema);
