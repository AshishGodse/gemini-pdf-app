import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { scanAPI } from '../services/api';

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

  // Clean up polling timers on unmount
  useEffect(() => {
    return () => {
      Object.values(pollingTimers.current).forEach((id) => clearInterval(id));
    };
  }, []);

  // Load PDFs from mock S3 on component mount
  useEffect(() => {
    fetchS3PDFs();
    restoreScanStates();
  }, []);

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

  const fetchS3PDFs = async () => {
    setLoadingFiles(true);
    try {
      // Mock S3 PDFs - in production these would come from AWS S3
      const mockPdfs: PDFFile[] = [
        {
          name: 'sample1.pdf',
          size: 245000,
          lastModified: '2024-03-20T10:30:00Z'
        },
        {
          name: 'sample2.pdf',
          size: 512000,
          lastModified: '2024-03-21T14:15:00Z'
        },
        {
          name: 'sample3.pdf',
          size: 128000,
          lastModified: '2024-03-21T16:45:00Z'
        },
        {
          name: 'sample4.pdf',
          size: 789000,
          lastModified: '2024-03-22T09:00:00Z'
        }
      ];
      setPdfs(mockPdfs);
    } catch (error) {
      console.error('Error loading PDFs from S3');
    } finally {
      setLoadingFiles(false);
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
      const result = await scanAPI.startScan(filename, `s3://pdf-bucket/${filename}`);
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
            <h3 className="text-xl font-semibold mb-4">S3 PDF Files</h3>
            {loadingFiles ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <p className="text-gray-600 mt-2">Loading PDFs...</p>
              </div>
            ) : pdfs.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No PDFs found in S3 bucket</p>
            ) : (
              renderFileTable(pdfs)
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
