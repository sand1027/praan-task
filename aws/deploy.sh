#!/bin/bash

# AWS Deployment Script for Praan IoT Backend
# This script automates the deployment process to AWS

set -e

# Configuration
ENVIRONMENT=${1:-production}
AWS_REGION=${AWS_REGION:-us-east-1}
STACK_NAME="praan-iot-${ENVIRONMENT}"

echo "=========================================="
echo "Praan IoT Backend - AWS Deployment"
echo "=========================================="
echo "Environment: ${ENVIRONMENT}"
echo "Region: ${AWS_REGION}"
echo "Stack Name: ${STACK_NAME}"
echo "=========================================="

# Step 1: Create CloudFormation Stack
echo ""
echo "Step 1: Creating CloudFormation Stack..."
aws cloudformation create-stack \
  --stack-name ${STACK_NAME} \
  --template-body file://cloudformation-template.yaml \
  --parameters ParameterKey=EnvironmentName,ParameterValue=${ENVIRONMENT} \
  --capabilities CAPABILITY_IAM \
  --region ${AWS_REGION}

echo "Waiting for stack creation to complete..."
aws cloudformation wait stack-create-complete \
  --stack-name ${STACK_NAME} \
  --region ${AWS_REGION}

echo "Stack created successfully!"

# Step 2: Get ECR Repository URI
echo ""
echo "Step 2: Getting ECR Repository URI..."
ECR_URI=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --query "Stacks[0].Outputs[?OutputKey=='ECRRepositoryURI'].OutputValue" \
  --output text \
  --region ${AWS_REGION})

echo "ECR Repository: ${ECR_URI}"

# Step 3: Build and Push Docker Image
echo ""
echo "Step 3: Building and pushing Docker image..."

# Login to ECR
echo "Logging in to ECR..."
aws ecr get-login-password --region ${AWS_REGION} | \
  docker login --username AWS --password-stdin ${ECR_URI}

# Build Docker image
echo "Building Docker image..."
cd ..
docker build -t praan-backend:latest .

# Tag image
echo "Tagging image..."
docker tag praan-backend:latest ${ECR_URI}:latest
docker tag praan-backend:latest ${ECR_URI}:${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S)

# Push image
echo "Pushing image to ECR..."
docker push ${ECR_URI}:latest
docker push ${ECR_URI}:${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S)

echo ""
echo "=========================================="
echo "Deployment completed successfully!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Create ECS Task Definition"
echo "2. Create ECS Service"
echo "3. Configure environment variables"
echo "4. Set up MongoDB (DocumentDB or Atlas)"
echo "5. Configure MQTT broker (AWS IoT Core or EC2)"
echo ""
echo "Load Balancer URL:"
aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --query "Stacks[0].Outputs[?OutputKey=='LoadBalancerDNS'].OutputValue" \
  --output text \
  --region ${AWS_REGION}
echo ""

