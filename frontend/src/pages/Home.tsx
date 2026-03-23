import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { scanAPI } from '../services/api';

export default function Home() {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleScan = async (filename: string) => {
    setLoading(true);
    try {
      const result = await scanAPI.startScan(filename, `s3://pdf-bucket/${filename}`);
      setMessage(`Scan started! Job ID: ${result.jobId}`);
      setTimeout(() => setMessage(''), 5000);
    } catch (error) {
      setMessage('Error starting scan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-3xl font-bold mb-6">PDF Accessibility Scanner</h2>
      
      <div className="mb-6">
        <p className="text-gray-600 mb-4">
          This tool scans PDF documents for accessibility compliance based on WCAG 2.1, PDF/UA, ADA Section 508, and European Accessibility Act standards.
        </p>
      </div>

      {message && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded text-blue-700">
          {message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="border-2 border-dashed border-gray-300 rounded p-6 text-center">
          <button
            onClick={() => handleScan('sample1.pdf')}
            disabled={loading}
            className="inline-block bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Scanning...' : 'Scan Sample PDF 1'}
          </button>
        </div>

        <div className="border-2 border-dashed border-gray-300 rounded p-6 text-center">
          <button
            onClick={() => handleScan('sample2.pdf')}
            disabled={loading}
            className="inline-block bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Scanning...' : 'Scan Sample PDF 2'}
          </button>
        </div>
      </div>

      <div className="mt-8">
        <Link
          to="/dashboard"
          className="inline-block bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700"
        >
          View Dashboard
        </Link>
      </div>
    </div>
  );
}
