import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { scanAPI, s3API } from '../services/api';

interface PDFFile {
  name: string;
  size: number;
  lastModified: string;
}

interface ScanState {
  jobId: string;
  status: 'pending' | 'scanning' | 'completed' | 'failed';
  progress: number;
}

interface S3ConfigItem {
  _id: string;
  name: string;
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  createdAt: string;
}

type SourceTab = 's3' | 'upload';

export default function Home() {
  const [sourceTab, setSourceTab] = useState<SourceTab>('s3');
  const [pdfs, setPdfs] = useState<PDFFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [scanStates, setScanStates] = useState<Record<string, ScanState>>({});
  const pollingTimers = useRef<Record<string, number>>({});

  // Upload state
  const [uploadedFiles, setUploadedFiles] = useState<PDFFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // S3 config state
  const [s3Configs, setS3Configs] = useState<S3ConfigItem[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string>('');
  const [showS3Modal, setShowS3Modal] = useState(false);
  const [s3Form, setS3Form] = useState({
    name: '',
    endpoint: '',
    bucket: '',
    region: 'us-east-1',
    accessKeyId: '',
    secretAccessKey: '',
  });
  const [s3Saving, setS3Saving] = useState(false);
  const [s3Testing, setS3Testing] = useState(false);
  const [s3TestResult, setS3TestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [s3Error, setS3Error] = useState('');

  // Clean up polling timers on unmount
  useEffect(() => {
    return () => {
      Object.values(pollingTimers.current).forEach((id) => clearInterval(id));
    };
  }, []);

  // Load PDFs from mock S3 on component mount
  useEffect(() => {
    loadS3Configs();
    restoreScanStates();
  }, []);

  // When selected config changes, fetch files from that S3 source
  useEffect(() => {
    if (selectedConfigId) {
      fetchS3PDFs(selectedConfigId);
    } else {
      setPdfs([]);
    }
  }, [selectedConfigId]);

  const loadS3Configs = async () => {
    try {
      const configs = await s3API.getConfigs();
      setS3Configs(configs);
      if (configs.length > 0) {
        setSelectedConfigId(configs[0]._id);
      }
    } catch {
      // Silently fail
    }
  };

  // Restore scan states from backend on mount (so progress survives navigation)
  const restoreScanStates = async () => {
    try {
      const jobs = await scanAPI.listScans();
      // Jobs are sorted newest-first by the backend. Only keep the latest job per filename.
      const restored: Record<string, ScanState> = {};
      const seen = new Set<string>();
      for (const job of jobs) {
        if (seen.has(job.filename)) continue;
        seen.add(job.filename);
        const status = job.status as ScanState['status'];
        const progress = status === 'completed' ? 100 : status === 'failed' ? 0 : (job.progress || 20);
        restored[job.filename] = { jobId: job.jobId, status, progress };
        // Only resume polling for recently started scans (within last 2 minutes)
        if ((status === 'pending' || status === 'scanning') && job.startedAt) {
          const age = Date.now() - new Date(job.startedAt).getTime();
          if (age < 2 * 60 * 1000) {
            startPollingForScan(job.filename, job.jobId);
          } else {
            // Old stuck job — mark as failed so it doesn't show a stuck progress bar
            restored[job.filename] = { jobId: job.jobId, status: 'failed', progress: 0 };
          }
        }
      }
      setScanStates(prev => ({ ...restored, ...prev }));
    } catch {
      // Silently fail — not critical
    }
  };

  const fetchS3PDFs = async (configId: string) => {
    setLoadingFiles(true);
    try {
      const files = await s3API.listFiles(configId);
      setPdfs(files);
    } catch (error) {
      console.error('Error loading PDFs from S3');
      setPdfs([]);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleSaveS3Config = async () => {
    setS3Error('');
    if (!s3Form.name || !s3Form.endpoint || !s3Form.bucket || !s3Form.accessKeyId || !s3Form.secretAccessKey) {
      setS3Error('All fields are required');
      return;
    }
    setS3Saving(true);
    try {
      await s3API.saveConfig(s3Form);
      setShowS3Modal(false);
      setS3Form({ name: '', endpoint: '', bucket: '', region: 'us-east-1', accessKeyId: '', secretAccessKey: '' });
      setS3TestResult(null);
      await loadS3Configs();
    } catch (err: any) {
      setS3Error(err?.response?.data?.error || 'Failed to save S3 configuration');
    } finally {
      setS3Saving(false);
    }
  };

  const handleTestS3Connection = async () => {
    setS3Testing(true);
    setS3TestResult(null);
    try {
      const result = await s3API.testConnection({
        endpoint: s3Form.endpoint,
        bucket: s3Form.bucket,
        region: s3Form.region,
        accessKeyId: s3Form.accessKeyId,
        secretAccessKey: s3Form.secretAccessKey,
      });
      setS3TestResult(result);
    } catch (err: any) {
      setS3TestResult({ success: false, message: err?.response?.data?.message || 'Connection failed' });
    } finally {
      setS3Testing(false);
    }
  };

  const handleDeleteS3Config = async (id: string) => {
    try {
      await s3API.deleteConfig(id);
      if (selectedConfigId === id) {
        setSelectedConfigId('');
        setPdfs([]);
      }
      await loadS3Configs();
    } catch {
      // Silently fail
    }
  };

  const startPollingForScan = useCallback((filename: string, jobId: string) => {
    // Clear any existing timer for this file
    if (pollingTimers.current[filename]) {
      clearInterval(pollingTimers.current[filename]);
    }

    let simulatedProgress = 15;

    pollingTimers.current[filename] = window.setInterval(async () => {
      try {
        const data = await scanAPI.getScanStatus(jobId);
        const status = data.status as ScanState['status'];

        let progress: number;
        if (status === 'completed') {
          progress = 100;
        } else if (status === 'failed') {
          progress = simulatedProgress;
        } else if (status === 'scanning') {
          simulatedProgress = Math.min(simulatedProgress + 8, 90);
          progress = simulatedProgress;
        } else {
          simulatedProgress = Math.min(simulatedProgress + 3, 25);
          progress = simulatedProgress;
        }

        setScanStates(prev => ({
          ...prev,
          [filename]: { jobId, status, progress }
        }));

        if (status === 'completed' || status === 'failed') {
          clearInterval(pollingTimers.current[filename]);
          delete pollingTimers.current[filename];
        }
      } catch {
        // Keep polling on transient errors
      }
    }, 2000);
  }, []);

  const handleScan = async (filename: string) => {
    setScanStates(prev => ({
      ...prev,
      [filename]: { jobId: '', status: 'pending', progress: 5 }
    }));
    try {
      const selectedConfig = s3Configs.find(c => c._id === selectedConfigId);
      const bucket = selectedConfig?.bucket || 'pdf-bucket';
      const result = await scanAPI.startScan(filename, `s3://${bucket}/${filename}`, selectedConfigId || undefined);
      setScanStates(prev => ({
        ...prev,
        [filename]: { jobId: result.jobId, status: 'pending', progress: 10 }
      }));
      startPollingForScan(filename, result.jobId);
    } catch {
      setScanStates(prev => ({
        ...prev,
        [filename]: { ...prev[filename], status: 'failed', progress: 0 }
      }));
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type !== 'application/pdf') continue;
      const filename = file.name;

      setScanStates(prev => ({
        ...prev,
        [filename]: { jobId: '', status: 'pending', progress: 5 }
      }));

      try {
        const result = await scanAPI.uploadAndScan(file);
        setUploadedFiles(prev => {
          if (prev.some(p => p.name === filename)) return prev;
          return [...prev, { name: filename, size: file.size, lastModified: new Date().toISOString() }];
        });
        setScanStates(prev => ({
          ...prev,
          [filename]: { jobId: result.jobId, status: 'pending', progress: 10 }
        }));
        startPollingForScan(filename, result.jobId);
      } catch {
        setScanStates(prev => ({
          ...prev,
          [filename]: { ...prev[filename], status: 'failed', progress: 0 }
        }));
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const isScanActive = (filename: string) => {
    const s = scanStates[filename];
    return s && (s.status === 'pending' || s.status === 'scanning');
  };

  const getProgressBarColor = (status: string) => {
    if (status === 'completed') return 'bg-green-500';
    if (status === 'failed') return 'bg-red-500';
    return 'bg-blue-500';
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-3xl font-bold mb-2">PDF Accessibility Scanner</h2>
      <p className="text-gray-600 mb-6">
        Select a PDF to scan for accessibility compliance (WCAG 2.1, PDF/UA, ADA, Section 508)
      </p>

      {/* Source Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setSourceTab('s3')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            sourceTab === 's3'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
            S3 Bucket
          </span>
        </button>
        <button
          onClick={() => setSourceTab('upload')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            sourceTab === 'upload'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Local Upload
          </span>
        </button>
      </div>

      <div className="mb-8">
        {sourceTab === 's3' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">S3 PDF Files</h3>
              <button
                onClick={() => { setShowS3Modal(true); setS3Error(''); setS3TestResult(null); }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add S3 Source
              </button>
            </div>

            {/* S3 Source Selector */}
            {s3Configs.length > 0 && (
              <div className="flex items-center gap-3 mb-4">
                <label className="text-sm font-medium text-gray-700">Source:</label>
                <select
                  value={selectedConfigId}
                  onChange={(e) => setSelectedConfigId(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 flex-1 max-w-xs"
                >
                  {s3Configs.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name} ({c.bucket})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => selectedConfigId && handleDeleteS3Config(selectedConfigId)}
                  className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg border border-red-200"
                  title="Delete this S3 source"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
                <button
                  onClick={() => selectedConfigId && fetchS3PDFs(selectedConfigId)}
                  className="px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200"
                  title="Refresh file list"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            )}

            {s3Configs.length === 0 && !loadingFiles && (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
                <p className="text-gray-600 mb-2">No S3 sources configured</p>
                <p className="text-gray-400 text-sm mb-4">Add an S3 source to browse and scan PDFs from your bucket</p>
                <button
                  onClick={() => { setShowS3Modal(true); setS3Error(''); setS3TestResult(null); }}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium text-sm"
                >
                  + Add S3 Source
                </button>
              </div>
            )}

            {s3Configs.length > 0 && loadingFiles && (
              <div className="text-center py-8">
                <div className="inline-block animate-spin">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <p className="text-gray-600 mt-2">Loading PDFs from S3...</p>
              </div>
            )}

            {s3Configs.length > 0 && !loadingFiles && pdfs.length === 0 && (
              <p className="text-gray-500 text-center py-8">No PDF files found in this S3 bucket</p>
            )}

            {s3Configs.length > 0 && !loadingFiles && pdfs.length > 0 && renderFileTable(pdfs)}

            {/* Add S3 Source Modal */}
            {showS3Modal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowS3Modal(false)}>
                <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-xl font-bold text-gray-900">Add S3 Source</h3>
                    <button onClick={() => setShowS3Modal(false)} className="text-gray-400 hover:text-gray-600">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {s3Error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                      {s3Error}
                    </div>
                  )}

                  {s3TestResult && (
                    <div className={`mb-4 p-3 rounded-lg text-sm border ${
                      s3TestResult.success
                        ? 'bg-green-50 border-green-200 text-green-700'
                        : 'bg-red-50 border-red-200 text-red-700'
                    }`}>
                      {s3TestResult.success ? '✅ ' : '❌ '}{s3TestResult.message}
                    </div>
                  )}

                  {/* Quick Preset */}
                  <button
                    type="button"
                    onClick={() => setS3Form({
                      name: 'LocalStack Dev',
                      endpoint: 'http://localstack:4566',
                      bucket: 'pdf-bucket',
                      region: 'us-east-1',
                      accessKeyId: 'test',
                      secretAccessKey: 'test',
                    })}
                    className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700 hover:bg-orange-100 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Use LocalStack Defaults
                  </button>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Source Name</label>
                      <input
                        type="text"
                        placeholder="e.g., Production Bucket"
                        value={s3Form.name}
                        onChange={(e) => setS3Form(f => ({ ...f, name: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Endpoint URL</label>
                      <input
                        type="text"
                        placeholder="e.g., https://s3.amazonaws.com or http://localhost:4566"
                        value={s3Form.endpoint}
                        onChange={(e) => setS3Form(f => ({ ...f, endpoint: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Bucket Name</label>
                        <input
                          type="text"
                          placeholder="e.g., my-pdf-bucket"
                          value={s3Form.bucket}
                          onChange={(e) => setS3Form(f => ({ ...f, bucket: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Region</label>
                        <input
                          type="text"
                          placeholder="us-east-1"
                          value={s3Form.region}
                          onChange={(e) => setS3Form(f => ({ ...f, region: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Access Key ID</label>
                      <input
                        type="text"
                        placeholder="AKIAIOSFODNN7EXAMPLE"
                        value={s3Form.accessKeyId}
                        onChange={(e) => setS3Form(f => ({ ...f, accessKeyId: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Secret Access Key
                        <span className="ml-2 text-xs text-green-600 font-normal">🔒 Encrypted at rest</span>
                      </label>
                      <input
                        type="password"
                        placeholder="••••••••••••••••"
                        value={s3Form.secretAccessKey}
                        onChange={(e) => setS3Form(f => ({ ...f, secretAccessKey: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-6">
                    <button
                      onClick={handleTestS3Connection}
                      disabled={s3Testing || !s3Form.endpoint || !s3Form.bucket || !s3Form.accessKeyId || !s3Form.secretAccessKey}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {s3Testing ? 'Testing...' : 'Test Connection'}
                    </button>
                    <div className="flex-1" />
                    <button
                      onClick={() => setShowS3Modal(false)}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveS3Config}
                      disabled={s3Saving}
                      className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {s3Saving ? 'Saving...' : 'Save Source'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {sourceTab === 'upload' && (
          <>
            <h3 className="text-xl font-semibold mb-4">Upload Local PDF</h3>
            {/* Drag & Drop Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors mb-6 ${
                dragOver
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
              </svg>
              <p className="text-gray-600 mb-2">
                {uploading ? 'Uploading...' : 'Drag and drop PDF files here, or'}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                multiple
                onChange={(e) => handleFileUpload(e.target.files)}
                className="hidden"
                id="pdf-upload"
              />
              <label
                htmlFor="pdf-upload"
                className={`inline-block px-4 py-2 rounded font-medium cursor-pointer ${
                  uploading
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {uploading ? 'Uploading...' : 'Browse Files'}
              </label>
              <p className="text-xs text-gray-400 mt-2">PDF files only, max 50MB each</p>
            </div>

            {/* Uploaded files table */}
            {uploadedFiles.length > 0 && renderFileTable(uploadedFiles)}
            {uploadedFiles.length === 0 && (
              <p className="text-gray-400 text-center py-4">No files uploaded yet</p>
            )}
          </>
        )}
      </div>

      <div className="pt-6 border-t border-gray-200">
        <Link
          to="/dashboard"
          className="inline-block bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700 font-medium"
        >
          → View Dashboard & Results
        </Link>
      </div>
    </div>
  );

  function renderFileTable(files: PDFFile[]) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-3 px-4 font-semibold">File Name</th>
              <th className="text-left py-3 px-4 font-semibold">Size</th>
              <th className="text-left py-3 px-4 font-semibold">Modified</th>
              <th className="text-left py-3 px-4 font-semibold w-48">Progress</th>
              <th className="text-right py-3 px-4 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {files.map((pdf) => {
              const scan = scanStates[pdf.name];
              const active = isScanActive(pdf.name);
              return (
                <tr key={pdf.name} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" />
                      </svg>
                      {pdf.name}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-600">{formatFileSize(pdf.size)}</td>
                  <td className="py-3 px-4 text-gray-600">{formatDate(pdf.lastModified)}</td>
                  <td className="py-3 px-4">
                    {scan ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ease-out ${getProgressBarColor(scan.status)} ${active ? 'animate-pulse' : ''}`}
                            style={{ width: `${scan.progress}%` }}
                          />
                        </div>
                        <span className={`text-xs font-medium min-w-[3rem] text-right ${
                          scan.status === 'completed' ? 'text-green-600' :
                          scan.status === 'failed' ? 'text-red-600' :
                          'text-blue-600'
                        }`}>
                          {scan.status === 'completed' ? '100%' :
                           scan.status === 'failed' ? 'Failed' :
                           `${Math.round(scan.progress)}%`}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2 justify-end">
                      {sourceTab === 's3' && (
                        <button
                          onClick={() => handleScan(pdf.name)}
                          disabled={active}
                          className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-1.5 ${
                            active
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          {active && (
                            <svg className="animate-spin w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          )}
                          {active ? 'Scanning...' : 'Scan'}
                        </button>
                      )}

                      {scan && scan.jobId && (
                        <Link
                          to={`/scan/${scan.jobId}`}
                          className={`px-3 py-1.5 rounded text-sm font-medium ${
                            scan.status === 'completed'
                              ? 'bg-green-600 text-white hover:bg-green-700'
                              : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                          }`}
                        >
                          View Results
                        </Link>
                      )}

                      <a
                        href={`http://localhost:5000/pdfs/${pdf.name}`}
                        download={pdf.name}
                        className="px-3 py-1.5 rounded text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        PDF
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
}
