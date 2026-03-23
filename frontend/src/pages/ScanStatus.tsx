import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { scanAPI } from '../services/api';
import { usePolling } from '../hooks/usePolling';

interface ScanStatus {
  jobId: string;
  status: string;
  filename: string;
  result: any;
}

export default function ScanStatus() {
  const { jobId } = useParams<{ jobId: string }>();
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const { startPolling, stopPolling, isPolling } = usePolling(
    () => scanAPI.getScanStatus(jobId!),
    (data) => {
      setScanStatus(data);
      if (data.status === 'completed' || data.status === 'failed') {
        stopPolling();
      }
    },
    { interval: 2000 }
  );

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const data = await scanAPI.getScanStatus(jobId!);
        setScanStatus(data);
        if (data.status === 'pending' || data.status === 'scanning') {
          startPolling();
        }
      } catch (error) {
        console.error('Error fetching scan status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [jobId]);

  if (loading) {
    return <div className="text-center py-12">Loading scan status...</div>;
  }

  if (!scanStatus) {
    return <div className="text-center py-12">Scan not found</div>;
  }

  const result = scanStatus.result;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-3xl font-bold mb-4">{scanStatus.filename}</h2>
        
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div>
            <p className="text-gray-600 text-sm">Job ID</p>
            <p className="font-mono text-sm">{scanStatus.jobId}</p>
          </div>
          <div>
            <p className="text-gray-600 text-sm">Status</p>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
              scanStatus.status === 'completed' ? 'bg-green-100 text-green-800' :
              scanStatus.status === 'scanning' ? 'bg-blue-100 text-blue-800' :
              scanStatus.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              {scanStatus.status}
            </span>
          </div>
        </div>

        {isPolling && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded">
            <p className="text-blue-700 animate-pulse">Scanning in progress...</p>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-gray-600 text-sm">Total Issues</p>
                <p className="text-2xl font-bold">{result.totalIssues}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-gray-600 text-sm">Fixed</p>
                <p className="text-2xl font-bold">{result.issuesFixed}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-gray-600 text-sm">Compliance</p>
                <p className="text-2xl font-bold">{result.compliancePercentage}%</p>
              </div>
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-gray-600 text-sm">Overall Status</p>
                <span className={`px-2 py-1 rounded text-sm font-semibold block ${
                  result.status === 'compliant' ? 'bg-green-100 text-green-800' :
                  result.status === 'partially_compliant' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {result.status.replace('_', ' ')}
                </span>
              </div>
            </div>

            {result.issues && result.issues.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-4">Issues Found</h3>
                <div className="space-y-3">
                  {result.issues.map((issue: any, idx: number) => (
                    <div key={idx} className="border border-gray-200 rounded p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold">{issue.description}</p>
                          <p className="text-sm text-gray-600">{issue.category}</p>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          issue.severity === 'critical' ? 'bg-red-100 text-red-800' :
                          issue.severity === 'major' ? 'bg-orange-100 text-orange-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {issue.severity}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mt-2">{issue.suggestion}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
