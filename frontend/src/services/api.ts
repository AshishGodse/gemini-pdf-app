import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000
});

export const scanAPI = {
  startScan: async (filename: string, s3Path: string) => {
    const response = await api.post('/scan/start', { filename, s3Path });
    return response.data;
  },

  getScanStatus: async (jobId: string) => {
    const response = await api.get(`/scan/${jobId}`);
    return response.data;
  },

  listScans: async () => {
    const response = await api.get('/scan');
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

export default api;
