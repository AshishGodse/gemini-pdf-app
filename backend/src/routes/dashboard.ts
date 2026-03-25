import { Router, Request, Response } from 'express';
import { ScanResultModel } from '../models/ScanResult';
import { ScanJobModel } from '../models/ScanJob';
import { logger } from '../config/logger';

const router = Router();

// Get dashboard metrics
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const totalScanned = await ScanJobModel.countDocuments({ status: 'completed' });
    const compliant = await ScanResultModel.countDocuments({ status: 'compliant' });
    const partiallyCompliant = await ScanResultModel.countDocuments({ status: 'partially_compliant' });
    const nonCompliant = await ScanResultModel.countDocuments({ status: 'non_compliant' });

    const results = await ScanResultModel.find().sort({ createdAt: -1 }).limit(100);

    const totalIssues = results.reduce((sum, r) => sum + r.totalIssues, 0);
    const totalFixed = results.reduce((sum, r) => sum + r.issuesFixed, 0);

    // Aggregate issues by guideline for trends
    let guidelineTrends = {
      wcag: 0,
      pdfua: 0,
      ada: 0,
      section508: 0,
      eu: 0
    };

    // Aggregate issue types
    const issueTypeCounts: Record<string, number> = {};

    results.forEach(result => {
      guidelineTrends.wcag += result.guidelines.wcag;
      guidelineTrends.pdfua += result.guidelines.pdfua;
      guidelineTrends.ada += result.guidelines.ada;
      guidelineTrends.section508 += result.guidelines.section508;
      guidelineTrends.eu += result.guidelines.eu;

      // Count issue types
      if (result.issues) {
        result.issues.forEach((issue: any) => {
          const key = issue.type || issue.description || 'Unknown';
          issueTypeCounts[key] = (issueTypeCounts[key] || 0) + 1;
        });
      }
    });

    // Top issue types sorted by count
    const topIssueTypes = Object.entries(issueTypeCounts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Average compliance across all results
    const avgCompliance = results.length > 0
      ? Math.round(results.reduce((s, r) => s + r.compliancePercentage, 0) / results.length)
      : 0;

    res.status(200).json({
      summary: {
        totalScanned,
        totalIssuesFound: totalIssues,
        totalIssuesFixed: totalFixed,
        avgCompliance,
        complianceStatus: {
          compliant,
          partiallyCompliant,
          nonCompliant
        }
      },
      trends: guidelineTrends,
      topIssueTypes,
      recentScans: results.slice(0, 10).map(r => ({
        jobId: r.jobId,
        filename: r.filename,
        compliance: r.compliancePercentage,
        issues: r.totalIssues,
        fixed: r.issuesFixed,
        status: r.status
      }))
    });
  } catch (error) {
    logger.error('Error fetching dashboard metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

export default router;
