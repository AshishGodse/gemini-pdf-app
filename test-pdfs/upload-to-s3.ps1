#!/usr/bin/env pwsh
# Upload all test PDFs (pass/ and fail/) to localstack S3 bucket.
# Requires: docker running with localstack on port 4566.

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$passDir   = Join-Path $scriptDir "pass"
$failDir   = Join-Path $scriptDir "fail"

$S3_ENDPOINT = "http://localhost:4566"
$BUCKET      = "pdf-bucket"

Write-Host "Uploading test PDFs to localstack S3 ($S3_ENDPOINT / $BUCKET) ..."
Write-Host ""

$uploaded = 0

foreach ($dir in @($passDir, $failDir)) {
    $label = Split-Path -Leaf $dir
    $pdfs  = Get-ChildItem -Path $dir -Filter "*.pdf" -ErrorAction SilentlyContinue
    if (-not $pdfs) {
        Write-Host "  No PDFs in $label/ - run download-test-pdfs.ps1 first." -ForegroundColor Yellow
        continue
    }
    foreach ($pdf in $pdfs) {
        $key = "test-pdfs/$label/$($pdf.Name)"
        Write-Host "  $key ..." -NoNewline
        try {
            docker cp $pdf.FullName "pdf-localstack-dev:/tmp/$($pdf.Name)"
            docker exec pdf-localstack-dev awslocal s3 cp "/tmp/$($pdf.Name)" "s3://$BUCKET/$key" --content-type "application/pdf"
            if ($LASTEXITCODE -ne 0) { throw "upload failed" }
            Write-Host " OK" -ForegroundColor Green
            $uploaded++
        } catch {
            Write-Host " FAILED ($($_.Exception.Message))" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "Uploaded $uploaded PDF(s) to s3://$BUCKET/test-pdfs/"
Write-Host ""
Write-Host "Listing bucket contents:"
docker exec pdf-localstack-dev sh -c 'awslocal s3 ls s3://pdf-bucket/test-pdfs/ --recursive'
