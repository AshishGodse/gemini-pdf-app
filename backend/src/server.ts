import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import axios from 'axios';
import { mongoConnect } from './config/database';
import { logger } from './config/logger';
import healthRoutes from './routes/health';
import scanRoutes from './routes/scan';
import dashboardRoutes from './routes/dashboard';
import s3Routes from './routes/s3';
import { errorHandler } from './middleware/errorHandler';

import path from 'path';

dotenv.config();

const app: Express = express();
const PORT = process.env.BACKEND_PORT || 5000;
const PYTHON_AGENT_URL = process.env.PYTHON_AGENT_URL || 'http://python-agent:8000';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: 'application/pdf', limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// Static files for mock PDFs
app.use('/pdfs', express.static(path.join(__dirname, '../public/pdfs')));

// V1 API — proxy to Python agent (stateless evaluation endpoints)
app.post('/api/v1/scan', async (req: Request, res: Response) => {
  try {
    const response = await axios.post(`${PYTHON_AGENT_URL}/api/v1/scan`, req.body, { timeout: 120000 });
    res.status(200).json(response.data);
  } catch (err: any) {
    logger.error('V1 scan proxy error:', err?.response?.data || err.message);
    res.status(err?.response?.status || 500).json(err?.response?.data || { error: 'Scan failed' });
  }
});

app.post('/api/v1/remediate', async (req: Request, res: Response) => {
  try {
    const response = await axios.post(`${PYTHON_AGENT_URL}/api/v1/remediate`, req.body, { timeout: 120000 });
    res.status(200).json(response.data);
  } catch (err: any) {
    logger.error('V1 remediate proxy error:', err?.response?.data || err.message);
    res.status(err?.response?.status || 500).json(err?.response?.data || { error: 'Remediate failed' });
  }
});

app.post('/api/v1/dashboard', async (req: Request, res: Response) => {
  try {
    const response = await axios.post(`${PYTHON_AGENT_URL}/api/v1/dashboard`, req.body, { timeout: 120000 });
    res.status(200).json(response.data);
  } catch (err: any) {
    logger.error('V1 dashboard proxy error:', err?.response?.data || err.message);
    res.status(err?.response?.status || 500).json(err?.response?.data || { error: 'Dashboard failed' });
  }
});

// Routes
app.use('/health', healthRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/s3', s3Routes);

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error Handler
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    await mongoConnect();
    logger.info('Connected to MongoDB');

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
