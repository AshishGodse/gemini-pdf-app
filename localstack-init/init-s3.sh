#!/bin/bash
echo "Creating S3 bucket: pdf-bucket"
awslocal s3 mb s3://pdf-bucket
echo "Bucket created successfully"
awslocal s3 ls
