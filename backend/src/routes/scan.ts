import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import AWS from 'aws-sdk';
import { ScanJobModel } from '../models/ScanJob';
import { ScanResultModel } from '../models/ScanResult';
import S3Config from '../models/S3Config';
import { decrypt } from '../utils/encryption';
import { logger } from '../config/logger';

const router = Router();

const PYTHON_AGENT_URL = process.env.PYTHON_AGENT_URL || 'http://localhost:8000';

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../public/pdfs');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for PDF uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    // Sanitize: keep only alphanumeric, dots, hyphens, underscores
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, safe);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Upload a PDF and start a scan
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }

    const filename = req.file.filename;
    const filePath = `/pdfs/${filename}`;
    const jobId = uuidv4();

    const scanJob = await ScanJobModel.create({
      jobId,
      filename,
      s3Path: `local://${filePath}`,
      status: 'pending'
    });

    logger.info(`Created upload scan job: ${jobId} for file: ${filename}`);

    // Trigger async scan
    axios.post(`${PYTHON_AGENT_URL}/scan`, {
      jobId,
      s3Path: `local://${filePath}`,
      filename
    }).catch(err => logger.error('Scan trigger failed:', err.message));

    res.status(201).json({
      jobId,
      filename,
      status: 'pending',
      message: 'File uploaded and scan started'
    });
  } catch (error) {
    logger.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload and scan file' });
  }
});

// Start a new scan job
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { filename, s3Path, s3ConfigId } = req.body;

    if (!filename || !s3Path) {
      return res.status(400).json({ error: 'filename and s3Path are required' });
    }

    // If s3ConfigId is provided, download PDF from S3 to local disk first
    if (s3ConfigId) {
      try {
        const config = await S3Config.findById(s3ConfigId);
        if (!config) {
          return res.status(404).json({ error: 'S3 configuration not found' });
        }

        const decryptedSecret = decrypt(config.secretAccessKey);
        const s3 = new AWS.S3({
          endpoint: config.endpoint,
          region: config.region,
          accessKeyId: config.accessKeyId,
          secretAccessKey: decryptedSecret,
          s3ForcePathStyle: true,
        });

        const data = await s3.getObject({ Bucket: config.bucket, Key: filename }).promise();
        const localPath = path.join(uploadsDir, filename);
        fs.writeFileSync(localPath, data.Body as Buffer);
        logger.info(`Downloaded S3 file ${filename} (${(data.Body as Buffer).length} bytes) to ${localPath}`);
      } catch (s3Err: any) {
        logger.error('Failed to download from S3:', s3Err.message);
        return res.status(500).json({ error: `Failed to download PDF from S3: ${s3Err.message}` });
      }
    }

    const jobId = uuidv4();

    const scanJob = await ScanJobModel.create({
      jobId,
      filename,
      s3Path,
      status: 'pending'
    });

    logger.info(`Created scan job: ${jobId}`);

    // Trigger async scan (don't wait for response)
    axios.post(`${PYTHON_AGENT_URL}/scan`, {
      jobId,
      s3Path,
      filename
    }).catch(err => logger.error('Scan trigger failed:', err.message));

    res.status(201).json({
      jobId,
      status: 'pending',
      message: 'Scan job created'
    });
  } catch (error) {
    logger.error('Error creating scan job:', error);
    res.status(500).json({ error: 'Failed to create scan job' });
  }
});

// Get scan job status
router.get('/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const scanJob = await ScanJobModel.findOne({ jobId });
    if (!scanJob) {
      return res.status(404).json({ error: 'Scan job not found' });
    }

    const scanResult = await ScanResultModel.findOne({ jobId });

    res.status(200).json({
      jobId,
      status: scanJob.status,
      filename: scanJob.filename,
      startedAt: scanJob.startedAt,
      completedAt: scanJob.completedAt,
      result: scanResult || null
    });
  } catch (error) {
    logger.error('Error fetching scan job:', error);
    res.status(500).json({ error: 'Failed to fetch scan job' });
  }
});

// Update scan job status (called by Python agent)
router.put('/:jobId/status', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { status, progress, error: errorMsg } = req.body;

    const update: Record<string, unknown> = { status };
    if (progress !== undefined) update.progress = progress;
    if (errorMsg) update.error = errorMsg;
    if (status === 'completed' || status === 'failed') {
      update.completedAt = new Date();
    }

    const scanJob = await ScanJobModel.findOneAndUpdate(
      { jobId },
      { $set: update },
      { new: true }
    );

    if (!scanJob) {
      return res.status(404).json({ error: 'Scan job not found' });
    }

    logger.info(`Updated scan job ${jobId} status to ${status}`);
    res.status(200).json({ jobId, status: scanJob.status });
  } catch (error) {
    logger.error('Error updating scan status:', error);
    res.status(500).json({ error: 'Failed to update scan status' });
  }
});

// Store scan result and mark job completed (called by Python agent)
router.put('/:jobId/result', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const resultData = req.body;

    // Upsert the scan result
    await ScanResultModel.findOneAndUpdate(
      { jobId },
      { $set: { ...resultData, jobId } },
      { upsert: true, new: true }
    );

    // Mark job as completed
    await ScanJobModel.findOneAndUpdate(
      { jobId },
      { $set: { status: 'completed', progress: 100, completedAt: new Date() } }
    );

    logger.info(`Stored result and completed job ${jobId}`);
    res.status(200).json({ jobId, status: 'completed' });
  } catch (error) {
    logger.error('Error storing scan result:', error);
    res.status(500).json({ error: 'Failed to store scan result' });
  }
});

// List all scan jobs
router.get('/', async (req: Request, res: Response) => {
  try {
    const jobs = await ScanJobModel.find().sort({ createdAt: -1 }).limit(50);
    res.status(200).json(jobs);
  } catch (error) {
    logger.error('Error listing scan jobs:', error);
    res.status(500).json({ error: 'Failed to list scan jobs' });
  }
});

// Receive fixed PDF from Python agent
router.put('/:jobId/fixed-pdf', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const fixedFilename = req.headers['x-fixed-filename'] as string;

    if (!fixedFilename) {
      return res.status(400).json({ error: 'Missing X-Fixed-Filename header' });
    }

    const safeName = fixedFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const destPath = path.join(uploadsDir, safeName);

    // Express raw middleware already parsed application/pdf into req.body as Buffer
    if (req.body && Buffer.isBuffer(req.body) && req.body.length > 0) {
      fs.writeFileSync(destPath, req.body);
      logger.info(`Saved fixed PDF: ${safeName} (${req.body.length} bytes)`);
      return res.status(200).json({ filename: safeName });
    }

    // Fallback: read from stream if body wasn't pre-parsed
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        if (buffer.length === 0) {
          logger.error('Received empty fixed PDF');
          return res.status(400).json({ error: 'Empty PDF received' });
        }
        fs.writeFileSync(destPath, buffer);
        logger.info(`Saved fixed PDF (stream): ${safeName} (${buffer.length} bytes)`);
        res.status(200).json({ filename: safeName });
      } catch (writeErr) {
        logger.error('Error writing fixed PDF:', writeErr);
        res.status(500).json({ error: 'Failed to write fixed PDF' });
      }
    });
    req.on('error', (err) => {
      logger.error('Error receiving fixed PDF stream:', err);
      res.status(500).json({ error: 'Failed to receive fixed PDF' });
    });
  } catch (error) {
    logger.error('Error saving fixed PDF:', error);
    res.status(500).json({ error: 'Failed to save fixed PDF' });
  }
});

// Auto-fix issues in a scanned PDF
router.post('/:jobId/fix', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const scanJob = await ScanJobModel.findOne({ jobId });
    if (!scanJob) {
      return res.status(404).json({ error: 'Scan job not found' });
    }

    const scanResult = await ScanResultModel.findOne({ jobId });
    if (!scanResult) {
      return res.status(400).json({ error: 'No scan results to fix' });
    }

    logger.info(`Auto-fix requested for job ${jobId}`);

    // Call Python agent /fix endpoint
    const fixResponse = await axios.post(`${PYTHON_AGENT_URL}/fix`, {
      jobId,
      filename: scanJob.filename,
      issues: scanResult.issues
    }, { timeout: 180000 });

    const fixData = fixResponse.data;

    // Update the scan result in DB with fixed data
    await ScanResultModel.findOneAndUpdate(
      { jobId },
      {
        $set: {
          totalIssues: fixData.totalIssues,
          issuesFixed: fixData.issuesFixed,
          compliancePercentage: fixData.compliancePercentage,
          status: fixData.status,
          issues: fixData.remainingIssues,
          guidelines: fixData.guidelines,
          fixedFilename: fixData.fixedFilename,
          fixedIssueTypes: fixData.fixedIssueTypes || []
        }
      }
    );

    res.status(200).json({
      jobId,
      fixedFilename: fixData.fixedFilename,
      issuesFixed: fixData.issuesFixed,
      totalIssues: fixData.totalIssues,
      compliancePercentage: fixData.compliancePercentage,
      status: fixData.status,
      remainingIssues: fixData.remainingIssues,
      guidelines: fixData.guidelines,
      fixedIssueTypes: fixData.fixedIssueTypes
    });
  } catch (error: any) {
    logger.error('Error during auto-fix:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Auto-fix failed' });
  }
});

export default router;
