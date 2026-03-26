#!/bin/bash
echo "Creating S3 bucket: pdf-bucket"
awslocal s3 mb s3://pdf-bucket
echo "Bucket created successfully"

# Upload test PDFs if they exist
if [ -d "/test-pdfs" ]; then
  echo "Uploading test PDFs to S3..."
  for f in /test-pdfs/pass/*.pdf /test-pdfs/fail/*.pdf; do
    [ -f "$f" ] && awslocal s3 cp "$f" "s3://pdf-bucket/$(basename "$f")"
  done
  echo "Test PDFs uploaded"
fi

awslocal s3 ls s3://pdf-bucket/ --recursive
