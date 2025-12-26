#!/bin/bash

set -e

REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REPO_NAME="praan-iot-backend"

echo "🚀 Deploying Praan IoT Backend to AWS"
echo "Region: $REGION"
echo "Account: $ACCOUNT_ID"

# Step 1: Create ECR repository
echo "📦 Creating ECR repository..."
aws ecr create-repository --repository-name $REPO_NAME --region $REGION || true

# Step 2: Build and push Docker image
echo "🐳 Building Docker image..."
docker build -t $REPO_NAME .

# Login to ECR
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

# Tag and push
docker tag $REPO_NAME:latest $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:latest
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:latest

# Step 3: Setup secrets
echo "🔐 Setting up secrets..."
./setup-secrets.sh

# Step 4: Setup IoT Core
echo "📡 Setting up IoT Core..."
./setup-iot-core.sh

# Step 5: Deploy ECS service
echo "🚢 Deploying ECS service..."
# Update task definition with actual account ID
sed -i "s/ACCOUNT/$ACCOUNT_ID/g" ecs-task-definition.json
sed -i "s/REGION/$REGION/g" ecs-task-definition.json

aws ecs register-task-definition --cli-input-json file://ecs-task-definition.json

echo "✅ Deployment complete!"
echo "Backend URL: https://your-alb-url.amazonaws.com"
echo "MQTT Endpoint: $(aws iot describe-endpoint --endpoint-type iot:Data-ATS --query endpointAddress --output text)"