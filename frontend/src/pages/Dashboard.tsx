import React, { useState, useEffect } from 'react';
import { dashboardAPI } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface DashboardMetrics {
  summary: {
    totalScanned: number;
    totalIssuesFound: number;
    totalIssuesFixed: number;
    complianceStatus: {
      compliant: number;
      partiallyCompliant: number;
      nonCompliant: number;
    };
  };
  trends: Record<string, number>;
  recentScans: Array<{
    filename: string;
    compliance: number;
    issues: number;
    status: string;
  }>;
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

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
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="text-center py-12">Loading dashboard...</div>;
  }

  if (!metrics) {
    return <div className="text-center py-12">No data available</div>;
  }

  const complianceData = [
    { name: 'Compliant', value: metrics.summary.complianceStatus.compliant },
    { name: 'Partial', value: metrics.summary.complianceStatus.partiallyCompliant },
    { name: 'Non-Compliant', value: metrics.summary.complianceStatus.nonCompliant }
  ];

  const COLORS = ['#10b981', '#f59e0b', '#ef4444'];

  const trendData = Object.entries(metrics.trends).map(([name, value]) => ({
    name: name.toUpperCase(),
    issues: value
  }));

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Accessibility Compliance Dashboard</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-gray-600 text-sm font-semibold">Total Scanned</h3>
          <p className="text-4xl font-bold mt-2">{metrics.summary.totalScanned}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-gray-600 text-sm font-semibold">Issues Found</h3>
          <p className="text-4xl font-bold mt-2">{metrics.summary.totalIssuesFound}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-gray-600 text-sm font-semibold">Issues Fixed</h3>
          <p className="text-4xl font-bold mt-2">{metrics.summary.totalIssuesFixed}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-gray-600 text-sm font-semibold">Compliance Rate</h3>
          <p className="text-4xl font-bold mt-2">
            {metrics.summary.totalScanned > 0 
              ? Math.round((metrics.summary.complianceStatus.compliant / metrics.summary.totalScanned) * 100) 
              : 0}%
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Compliance Status</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={complianceData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {complianceData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Issues by Guideline</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="issues" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Scans */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Scans</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold">Filename</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Compliance</th>
                <th className="px-6 py-3 text-left text-sm font-semibold">Issues</th>
              </tr>
            </thead>
            <tbody>
              {metrics.recentScans.map((scan, idx) => (
                <tr key={idx} className="border-t hover:bg-gray-50">
                  <td className="px-6 py-3">{scan.filename}</td>
                  <td className="px-6 py-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      scan.status === 'compliant' ? 'bg-green-100 text-green-800' :
                      scan.status === 'partially_compliant' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {scan.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-3">{scan.compliance.toFixed(1)}%</td>
                  <td className="px-6 py-3">{scan.issues}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
