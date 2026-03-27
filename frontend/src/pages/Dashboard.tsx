import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardAPI } from '../services/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

interface DashboardMetrics {
  summary: {
    totalScanned: number;
    totalIssuesFound: number;
    totalIssuesFixed: number;
    avgCompliance: number;
    complianceStatus: {
      compliant: number;
      partiallyCompliant: number;
      nonCompliant: number;
    };
  };
  trends: Record<string, number>;
  topIssueTypes: Array<{ type: string; count: number }>;
  recentScans: Array<{
    jobId: string;
    filename: string;
    compliance: number;
    issues: number;
    fixed: number;
    status: string;
  }>;
}

interface ScanEntry {
  jobId: string;
  filename: string;
  compliance: number;
  issues: number;
  fixed: number;
  status: string;
  createdAt: string;
}

interface PaginatedScans {
  scans: ScanEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/* ---------- Circular Gauge ---------- */
function GaugeCircle({ value, size = 180 }: { value: number; size?: number }) {
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(Math.max(value, 0), 100);
  const offset = circumference - (pct / 100) * circumference;

  let color = '#ef4444';
  if (pct >= 80) color = '#10b981';
  else if (pct >= 50) color = '#f59e0b';
  else if (pct >= 25) color = '#f97316';

  return (
    <svg width={size} height={size} className="block">
      {/* background ring */}
      <circle cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
      {/* value arc */}
      <circle cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke={color} strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{
          transform: 'rotate(-90deg)',
          transformOrigin: '50% 50%',
          transition: 'stroke-dashoffset 1s ease-in-out',
        }}
      />
      {/* label */}
      <text x="50%" y="44%" textAnchor="middle" className="fill-gray-900 text-4xl font-bold" dy="0.1em" style={{ fontSize: size * 0.22 }}>
        {pct}
      </text>
      <text x="50%" y="62%" textAnchor="middle" className="fill-gray-500" style={{ fontSize: size * 0.09 }}>
        %
      </text>
    </svg>
  );
}

function ratingLabel(pct: number) {
  if (pct >= 90) return { text: 'Excellent', color: 'text-green-600' };
  if (pct >= 75) return { text: 'Good', color: 'text-green-500' };
  if (pct >= 50) return { text: 'Fair', color: 'text-yellow-500' };
  if (pct >= 25) return { text: 'Poor', color: 'text-orange-500' };
  return { text: 'Very poor', color: 'text-red-500' };
}

/* ---------- Guideline Level Card ---------- */
function LevelCard({ label, pct, accent }: { label: string; pct: number; accent: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col items-center">
      <div className="flex items-center gap-2 mb-3 w-full">
        <span className="font-semibold text-gray-800">{label}</span>
        <div className="flex-1 h-1 rounded-full bg-gray-200 overflow-hidden ml-2">
          <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: accent }} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-4xl font-bold text-gray-800">{pct}%</span>
      </div>
    </div>
  );
}

/* ---------- Issue Type Label ---------- */
function prettyIssueType(raw: string) {
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/* ---------- Main Component ---------- */
export default function Dashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [scansData, setScansData] = useState<PaginatedScans | null>(null);
  const [scansPage, setScansPage] = useState(1);
  const [scansPerPage, setScansPerPage] = useState(10);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const data = await dashboardAPI.getMetrics();
        setMetrics(data);
      } catch (error) {
        console.error('Error fetching metrics:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchScans = async () => {
      try {
        const data = await dashboardAPI.getScans(scansPage, scansPerPage);
        setScansData(data);
      } catch (error) {
        console.error('Error fetching scans:', error);
      }
    };
    fetchScans();
  }, [scansPage, scansPerPage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin h-10 w-10 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="text-center py-24 text-gray-500">
        <p className="text-lg">No scan data yet. Upload & scan PDFs to see the dashboard.</p>
      </div>
    );
  }

  const { summary, trends, topIssueTypes } = metrics;
  const compliancePct = summary.avgCompliance;
  const rating = ratingLabel(compliancePct);

  const complianceData = [
    { name: 'Compliant', value: summary.complianceStatus.compliant },
    { name: 'Partial', value: summary.complianceStatus.partiallyCompliant },
    { name: 'Non-Compliant', value: summary.complianceStatus.nonCompliant },
  ].filter(d => d.value > 0);

  const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444'];
  const ISSUE_COLORS = ['#6366f1', '#0ea5e9', '#f43f5e', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6'];

  const trendData = Object.entries(trends)
    .map(([name, value]) => ({ name: name === 'section508' ? 'Sec 508' : name === 'pdfua' ? 'PDF/UA' : name.toUpperCase(), issues: value }))
    .filter(d => d.issues > 0);

  const issueChartData = topIssueTypes.map(t => ({ name: prettyIssueType(t.type), value: t.count }));

  const wcagPct = trends.wcag > 0 ? Math.max(0, 100 - (trends.wcag * 8)) : 100;
  const pdfuaPct = trends.pdfua > 0 ? Math.max(0, 100 - (trends.pdfua * 10)) : 100;
  const adaPct = trends.ada > 0 ? Math.max(0, 100 - (trends.ada * 12)) : 100;

  return (
    <div className="space-y-6 pb-8">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Accessibility Dashboard</h2>
          <p className="text-gray-500 mt-1">PDF compliance overview across WCAG 2.1, PDF/UA, ADA, Section 508 & EAA</p>
        </div>
      </div>

      {/* ---- Top row: Gauge + Stats + Level Cards ---- */}
      <div className="grid grid-cols-12 gap-5">
        {/* Gauge card */}
        <div className="col-span-4 bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col items-center">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Overall Compliance</h3>
          <GaugeCircle value={compliancePct} size={170} />
          <span className={`mt-2 text-lg font-bold ${rating.color}`}>{rating.text}</span>
          <div className="flex gap-8 mt-4 text-center">
            <div>
              <p className="text-2xl font-bold text-gray-800">{summary.totalScanned}</p>
              <p className="text-xs text-gray-500 uppercase">PDFs Scanned</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{summary.totalIssuesFound}</p>
              <p className="text-xs text-gray-500 uppercase">Issues Found</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{summary.totalIssuesFixed}</p>
              <p className="text-xs text-gray-500 uppercase">Issues Fixed</p>
            </div>
          </div>
        </div>

        {/* Summary stat cards */}
        <div className="col-span-8 grid grid-cols-3 gap-4">
          {/* Compliance status cards */}
          <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl border border-green-200 p-5 flex flex-col justify-between">
            <span className="text-xs font-semibold text-green-600 uppercase tracking-wide">Compliant</span>
            <p className="text-5xl font-extrabold text-green-700 mt-2">{summary.complianceStatus.compliant}</p>
            <span className="text-sm text-green-600 mt-1">PDFs passing all checks</span>
          </div>
          <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl border border-yellow-200 p-5 flex flex-col justify-between">
            <span className="text-xs font-semibold text-yellow-600 uppercase tracking-wide">Partial</span>
            <p className="text-5xl font-extrabold text-yellow-700 mt-2">{summary.complianceStatus.partiallyCompliant}</p>
            <span className="text-sm text-yellow-600 mt-1">PDFs with some issues</span>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl border border-red-200 p-5 flex flex-col justify-between">
            <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">Non-Compliant</span>
            <p className="text-5xl font-extrabold text-red-700 mt-2">{summary.complianceStatus.nonCompliant}</p>
            <span className="text-sm text-red-600 mt-1">PDFs failing checks</span>
          </div>
          {/* Guideline level cards */}
          <LevelCard label="WCAG 2.1" pct={wcagPct} accent="#3b82f6" />
          <LevelCard label="PDF/UA" pct={pdfuaPct} accent="#6366f1" />
          <LevelCard label="ADA / Sec 508" pct={adaPct} accent="#8b5cf6" />
        </div>
      </div>

      {/* ---- Charts Row ---- */}
      <div className="grid grid-cols-2 gap-5">
        {/* Most Common Issues — donut */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Most Common Issues</h3>
          {issueChartData.length > 0 ? (
            <div className="flex items-center">
              <ResponsiveContainer width="50%" height={240}>
                <PieChart>
                  <Pie
                    data={issueChartData}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {issueChartData.map((_, idx) => (
                      <Cell key={idx} fill={ISSUE_COLORS[idx % ISSUE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2 pl-2">
                {issueChartData.map((d, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <span className="w-3 h-3 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: ISSUE_COLORS[idx % ISSUE_COLORS.length] }} />
                    <span className="text-gray-700 truncate">{d.name}</span>
                    <span className="ml-auto font-semibold text-gray-900">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-gray-400 text-center py-12">No issues found yet</p>
          )}
        </div>

        {/* Issues by Standard — bar chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Issues by Standard</h3>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={trendData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="issues" radius={[6, 6, 0, 0]}>
                  {trendData.map((_, idx) => (
                    <Cell key={idx} fill={ISSUE_COLORS[idx % ISSUE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-12">No violations yet</p>
          )}
        </div>
      </div>

      {/* ---- Compliance Breakdown Donut ---- */}
      {complianceData.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Compliance Breakdown</h3>
          <div className="flex items-center justify-center gap-12">
            <ResponsiveContainer width={220} height={220}>
              <PieChart>
                <Pie
                  data={complianceData}
                  cx="50%" cy="50%"
                  innerRadius={60} outerRadius={95}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {complianceData.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              {complianceData.map((d, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <span className="w-4 h-4 rounded-full" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                  <span className="text-gray-700 font-medium">{d.name}</span>
                  <span className="text-xl font-bold text-gray-900 ml-2">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---- All Scans Table with Pagination ---- */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">All Scans</h3>
          {scansData && (
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span>{scansData.pagination.total} total scans</span>
              <select
                value={scansPerPage}
                onChange={e => { setScansPerPage(Number(e.target.value)); setScansPage(1); }}
                className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {[5, 10, 20, 50].map(n => (
                  <option key={n} value={n}>{n} per page</option>
                ))}
              </select>
            </div>
          )}
        </div>
        {scansData && scansData.scans.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b">
                    <th className="pb-3 pr-4">Filename</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">Compliance</th>
                    <th className="pb-3 pr-4">Issues</th>
                    <th className="pb-3 pr-4">Fixed</th>
                    <th className="pb-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {scansData.scans.map((scan, idx) => {
                    const isCompliant = scan.status === 'compliant';
                    const isPartial = scan.status === 'partially_compliant';
                    return (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => navigate(`/scan/${scan.jobId}`)}>
                        <td className="py-3 pr-4 font-medium text-gray-800">{scan.filename}</td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            isCompliant ? 'bg-green-100 text-green-700' :
                            isPartial ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              isCompliant ? 'bg-green-500' : isPartial ? 'bg-yellow-500' : 'bg-red-500'
                            }`} />
                            {scan.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${scan.compliance}%`,
                                  backgroundColor: scan.compliance >= 80 ? '#10b981' : scan.compliance >= 50 ? '#f59e0b' : '#ef4444',
                                }}
                              />
                            </div>
                            <span className="text-gray-700 font-medium">{scan.compliance}%</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-gray-700">{scan.issues}</td>
                        <td className="py-3 pr-4 text-gray-700">{scan.fixed}</td>
                        <td className="py-3 text-right">
                          <span className="text-indigo-500 text-xs font-medium">View →</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Pagination Controls */}
            {scansData.pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  Showing {(scansData.pagination.page - 1) * scansData.pagination.limit + 1}
                  {' '}-{' '}
                  {Math.min(scansData.pagination.page * scansData.pagination.limit, scansData.pagination.total)}
                  {' '}of {scansData.pagination.total}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setScansPage(1)}
                    disabled={scansPage === 1}
                    className="px-2 py-1 text-sm rounded-md border border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    &laquo;
                  </button>
                  <button
                    onClick={() => setScansPage(p => Math.max(1, p - 1))}
                    disabled={scansPage === 1}
                    className="px-3 py-1 text-sm rounded-md border border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Prev
                  </button>
                  {Array.from({ length: scansData.pagination.totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === scansData.pagination.totalPages || Math.abs(p - scansPage) <= 2)
                    .reduce<(number | string)[]>((acc, p, i, arr) => {
                      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('...');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((item, i) =>
                      item === '...' ? (
                        <span key={`dots-${i}`} className="px-2 py-1 text-sm text-gray-400">...</span>
                      ) : (
                        <button
                          key={item}
                          onClick={() => setScansPage(item as number)}
                          className={`px-3 py-1 text-sm rounded-md border ${
                            scansPage === item
                              ? 'bg-indigo-500 text-white border-indigo-500'
                              : 'border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {item}
                        </button>
                      )
                    )}
                  <button
                    onClick={() => setScansPage(p => Math.min(scansData.pagination.totalPages, p + 1))}
                    disabled={scansPage === scansData.pagination.totalPages}
                    className="px-3 py-1 text-sm rounded-md border border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => setScansPage(scansData.pagination.totalPages)}
                    disabled={scansPage === scansData.pagination.totalPages}
                    className="px-2 py-1 text-sm rounded-md border border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    &raquo;
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-gray-400 text-center py-8">No scans yet</p>
        )}
      </div>
    </div>
  );
}
