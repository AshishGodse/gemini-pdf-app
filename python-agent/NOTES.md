# Python Agent - Notes

## PDF Scanning MVP
Currently returns mock data for testing. 

For production implementation, integrate:
1. PAC (PDF Accessibility Checker) or custom validators
2. AWS boto3 for S3 file download
3. Background job processing (Celery + Redis)
4. Persistent result storage

The analyzer.py contains the structure for WCAG and PDF/UA validation methods that can be expanded.
