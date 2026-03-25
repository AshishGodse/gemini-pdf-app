import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000
});

export const scanAPI = {
  startScan: async (filename: string, s3Path: string, s3ConfigId?: string) => {
    const response = await api.post('/scan/start', { filename, s3Path, s3ConfigId });
    return response.data;
  },

  uploadAndScan: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/scan/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000
    });
    return response.data;
  },

  getScanStatus: async (jobId: string) => {
    const response = await api.get(`/scan/${jobId}`);
    return response.data;
  },

  listScans: async () => {
    const response = await api.get('/scan');
    return response.data;
  },

  autoFix: async (jobId: string) => {
    const response = await api.post(`/scan/${jobId}/fix`, {}, { timeout: 60000 });
    return response.data;
  }
};

export const dashboardAPI = {
  getMetrics: async () => {
    const response = await api.get('/dashboard/metrics');
    return response.data;
  }
};

export const healthAPI = {
  check: async () => {
    try {
      const response = await axios.get('http://localhost:5000/health');
      return response.data;
    } catch {
      return null;
    }
  }
};

export const s3API = {
  saveConfig: async (config: {
    name: string;
    endpoint: string;
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  }) => {
    const response = await api.post('/s3/config', config);
    return response.data;
  },

  getConfigs: async () => {
    const response = await api.get('/s3/configs');
    return response.data;
  },

  deleteConfig: async (id: string) => {
    const response = await api.delete(`/s3/config/${id}`);
    return response.data;
  },

  testConnection: async (config: {
    endpoint: string;
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  }) => {
    const response = await api.post('/s3/test', config, { timeout: 15000 });
    return response.data;
  },

  listFiles: async (configId: string) => {
    const response = await api.get(`/s3/list/${configId}`);
    return response.data;
  },
};

export default api;
