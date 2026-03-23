import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { ScanJobModel } from '../models/ScanJob';
import { ScanResultModel } from '../models/ScanResult';
import { logger } from '../config/logger';

const router = Router();

const PYTHON_AGENT_URL = process.env.PYTHON_AGENT_URL || 'http://localhost:8000';

// Start a new scan job
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { filename, s3Path } = req.body;

    if (!filename || !s3Path) {
      return res.status(400).json({ error: 'filename and s3Path are required' });
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

export default router;
