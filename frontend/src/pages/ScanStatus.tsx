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
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState<any>(null);
  const [expandedManualFix, setExpandedManualFix] = useState<Record<number, boolean>>({});
  const [showResolved, setShowResolved] = useState(false);

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

  const handleAutoFix = async () => {
    if (!jobId || fixing) return;
    setFixing(true);
    setFixResult(null);
    try {
      const data = await scanAPI.autoFix(jobId);
      setFixResult(data);
      // Refresh scan status to show updated results
      const updated = await scanAPI.getScanStatus(jobId);
      setScanStatus(updated);
    } catch (err) {
      console.error('Auto-fix failed:', err);
      setFixResult({ error: 'Auto-fix failed. Please try again.' });
    } finally {
      setFixing(false);
    }
  };

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

            {/* Auto Fix Button & Result Banner */}
            {result.issues && result.issues.length > 0 && (
              <div className="mt-4 flex items-center gap-4">
                <button
                  onClick={handleAutoFix}
                  disabled={fixing}
                  className={`px-6 py-3 rounded-lg text-white font-semibold text-sm transition-all ${
                    fixing
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 shadow-md hover:shadow-lg'
                  }`}
                >
                  {fixing ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Fixing Issues...
                    </span>
                  ) : (
                    '⚡ Auto Fix All Issues'
                  )}
                </button>
                {fixResult && !fixResult.error && (
                  <span className="text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 text-sm">
                    Fixed {fixResult.issuesFixed} issue(s) — compliance now {fixResult.compliancePercentage}%
                  </span>
                )}
                {fixResult?.error && (
                  <span className="text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 text-sm">
                    {fixResult.error}
                  </span>
                )}
              </div>
            )}

            {fixResult && fixResult.fixedFilename && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="font-semibold text-green-800 mb-2">Fixed PDF Ready</h4>
                <p className="text-sm text-green-700 mb-3">
                  {fixResult.issuesFixed} issue(s) were automatically resolved.
                  {fixResult.fixedIssueTypes && fixResult.fixedIssueTypes.length > 0 && (
                    <> Fixed: {fixResult.fixedIssueTypes.map((t: string) => t.replace(/_/g, ' ')).join(', ')}.</>
                  )}
                </p>
                <a
                  href={`http://localhost:5000/pdfs/${fixResult.fixedFilename}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm font-medium"
                >
                  Download Fixed PDF
                </a>
              </div>
            )}

            {/* Resolved Issues (from auto-fix) */}
            {(result.fixedIssueTypes?.length > 0 || (fixResult?.fixedIssueTypes?.length > 0 && !fixResult.error)) && (() => {
              const resolvedTypes: string[] = result.fixedIssueTypes?.length > 0
                ? result.fixedIssueTypes
                : fixResult?.fixedIssueTypes || [];
              const RESOLVE_LABELS: Record<string, { label: string; detail: string }> = {
                missing_title: { label: 'Missing Document Title', detail: 'A descriptive title was added to the PDF metadata.' },
                missing_author: { label: 'Missing Author', detail: 'Author information was added to the PDF metadata.' },
                missing_subject: { label: 'Missing Subject', detail: 'A subject/description was added to the PDF metadata.' },
                missing_lang: { label: 'Missing Document Language', detail: 'The document language was set to en-US.' },
                missing_language: { label: 'Missing Document Language', detail: 'The document language was set to en-US.' },
                not_marked: { label: 'Missing MarkInfo', detail: 'The MarkInfo /Marked flag was set to true.' },
                missing_mark_info: { label: 'Missing MarkInfo', detail: 'The MarkInfo /Marked flag was set to true.' },
                tab_order: { label: 'Incorrect Tab Order', detail: 'Page tab order was set to follow document structure.' },
              };
              return (
                <div className="mt-4">
                  <button
                    onClick={() => setShowResolved(prev => !prev)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition-colors"
                  >
                    <svg className={`w-4 h-4 transition-transform ${showResolved ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    ✅ View Resolved Issues ({resolvedTypes.length})
                  </button>
                  {showResolved && (
                    <div className="mt-3 space-y-2">
                      {resolvedTypes.map((issueType: string, idx: number) => {
                        const info = RESOLVE_LABELS[issueType] || {
                          label: issueType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                          detail: 'This issue was automatically resolved.'
                        };
                        return (
                          <div key={idx} className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-lg p-3">
                            <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-green-800">{info.label}</p>
                              <p className="text-xs text-green-700">{info.detail}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {result.issues && result.issues.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-4">
                  {fixResult && !fixResult.error ? 'Remaining Issues' : 'Issues Found'}
                </h3>
                <div className="space-y-3">
                  {result.issues.map((issue: any, idx: number) => (
                    <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="p-4">
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

                        {/* Manual Fix Button */}
                        {issue.manualFixSteps && issue.manualFixSteps.length > 0 && (
                          <button
                            onClick={() => setExpandedManualFix(prev => ({ ...prev, [idx]: !prev[idx] }))}
                            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
                          >
                            <svg className={`w-4 h-4 transition-transform ${expandedManualFix[idx] ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                            📋 Manual Fix Guide
                          </button>
                        )}
                      </div>

                      {/* Step-by-step guide (collapsible) */}
                      {expandedManualFix[idx] && issue.manualFixSteps && (
                        <div className="bg-blue-50 border-t border-blue-200 px-5 py-4">
                          <h4 className="text-sm font-semibold text-blue-800 mb-3">Step-by-step Manual Fix:</h4>
                          <ol className="space-y-2">
                            {issue.manualFixSteps.map((step: string, sIdx: number) => (
                              <li key={sIdx} className="flex gap-3 text-sm text-blue-900">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-200 text-blue-800 flex items-center justify-center text-xs font-bold">
                                  {sIdx + 1}
                                </span>
                                <span className="pt-0.5">{step}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
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
