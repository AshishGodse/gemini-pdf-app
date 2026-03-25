import { Router, Request, Response } from 'express';
import AWS from 'aws-sdk';
import S3Config from '../models/S3Config';
import { encrypt, decrypt } from '../utils/encryption';
import { logger } from '../config/logger';

const router = Router();

// POST /api/s3/config — Save a new S3 source configuration
router.post('/config', async (req: Request, res: Response) => {
  try {
    const { name, endpoint, bucket, region, accessKeyId, secretAccessKey } = req.body;

    if (!name || !endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      return res.status(400).json({ error: 'All fields are required: name, endpoint, bucket, accessKeyId, secretAccessKey' });
    }

    const encryptedSecret = encrypt(secretAccessKey);

    const config = new S3Config({
      name,
      endpoint,
      bucket,
      region: region || 'us-east-1',
      accessKeyId,
      secretAccessKey: encryptedSecret,
    });

    await config.save();
    logger.info(`S3 config saved: ${name}`);

    res.status(201).json({
      _id: config._id,
      name: config.name,
      endpoint: config.endpoint,
      bucket: config.bucket,
      region: config.region,
      accessKeyId: config.accessKeyId,
      createdAt: config.createdAt,
    });
  } catch (err: any) {
    logger.error('Error saving S3 config:', err.message);
    res.status(500).json({ error: 'Failed to save S3 configuration' });
  }
});

// GET /api/s3/configs — List all S3 source configurations (secrets masked)
router.get('/configs', async (_req: Request, res: Response) => {
  try {
    const configs = await S3Config.find().sort({ createdAt: -1 }).lean();
    const masked = configs.map((c: any) => ({
      _id: c._id,
      name: c.name,
      endpoint: c.endpoint,
      bucket: c.bucket,
      region: c.region,
      accessKeyId: c.accessKeyId,
      createdAt: c.createdAt,
    }));
    res.json(masked);
  } catch (err: any) {
    logger.error('Error listing S3 configs:', err.message);
    res.status(500).json({ error: 'Failed to list S3 configurations' });
  }
});

// DELETE /api/s3/config/:id — Delete an S3 source configuration
router.delete('/config/:id', async (req: Request, res: Response) => {
  try {
    await S3Config.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    logger.error('Error deleting S3 config:', err.message);
    res.status(500).json({ error: 'Failed to delete S3 configuration' });
  }
});

// POST /api/s3/test — Test S3 connection
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { endpoint, bucket, region, accessKeyId, secretAccessKey } = req.body;

    const s3 = new AWS.S3({
      endpoint,
      region: region || 'us-east-1',
      accessKeyId,
      secretAccessKey,
      s3ForcePathStyle: true,
    });

    await s3.headBucket({ Bucket: bucket }).promise();
    res.json({ success: true, message: 'Connection successful' });
  } catch (err: any) {
    logger.error('S3 connection test failed:', err.message);
    res.status(400).json({ success: false, message: `Connection failed: ${err.message}` });
  }
});

// GET /api/s3/list/:configId — List PDF files from a configured S3 source
router.get('/list/:configId', async (req: Request, res: Response) => {
  try {
    const config = await S3Config.findById(req.params.configId);
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

    const data = await s3.listObjectsV2({ Bucket: config.bucket }).promise();

    const pdfFiles = (data.Contents || [])
      .filter((obj) => obj.Key && obj.Key.toLowerCase().endsWith('.pdf'))
      .map((obj) => ({
        name: obj.Key!,
        size: obj.Size || 0,
        lastModified: obj.LastModified?.toISOString() || new Date().toISOString(),
      }));

    res.json(pdfFiles);
  } catch (err: any) {
    logger.error('Error listing S3 files:', err.message);
    res.status(500).json({ error: 'Failed to list files from S3' });
  }
});

// GET /api/s3/download/:configId/:filename — Download a PDF from S3 to local disk
router.get('/download/:configId/:filename', async (req: Request, res: Response) => {
  try {
    const config = await S3Config.findById(req.params.configId);
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

    const data = await s3.getObject({ Bucket: config.bucket, Key: req.params.filename }).promise();

    // Save to local pdfs directory so the Python agent can access it
    const fs = require('fs');
    const path = require('path');
    const pdfsDir = path.join(__dirname, '../../public/pdfs');
    if (!fs.existsSync(pdfsDir)) {
      fs.mkdirSync(pdfsDir, { recursive: true });
    }
    const localPath = path.join(pdfsDir, req.params.filename);
    fs.writeFileSync(localPath, data.Body as Buffer);

    logger.info(`Downloaded S3 file ${req.params.filename} to ${localPath}`);
    res.json({ success: true, localPath: `/pdfs/${req.params.filename}` });
  } catch (err: any) {
    logger.error('Error downloading S3 file:', err.message);
    res.status(500).json({ error: 'Failed to download file from S3' });
  }
});

export default router;
