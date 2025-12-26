#!/bin/bash

REGION="us-east-1"
KEY_NAME="praan-iot-key"
SECURITY_GROUP="praan-iot-sg"

echo "🚀 Deploying Praan IoT to 2 EC2 Instances"

# Create key pair
echo "🔑 Creating key pair..."
aws ec2 create-key-pair \
  --key-name $KEY_NAME \
  --query 'KeyMaterial' \
  --output text > ${KEY_NAME}.pem
chmod 400 ${KEY_NAME}.pem

# Create security group
echo "🛡️ Creating security group..."
SG_ID=$(aws ec2 create-security-group \
  --group-name $SECURITY_GROUP \
  --description "Praan IoT Security Group" \
  --query 'GroupId' \
  --output text)

# Add security group rules
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 22 \
  --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 1883 \
  --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 3000 \
  --cidr 0.0.0.0/0

# Launch Mosquitto EC2 instance
echo "🦟 Launching Mosquitto EC2 instance..."
MOSQUITTO_INSTANCE=$(aws ec2 run-instances \
  --image-id ami-0c02fb55956c7d316 \
  --count 1 \
  --instance-type t2.micro \
  --key-name $KEY_NAME \
  --security-group-ids $SG_ID \
  --user-data file://setup-mosquitto-ec2.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=Praan-Mosquitto}]' \
  --query 'Instances[0].InstanceId' \
  --output text)

# Wait for Mosquitto instance to be running
echo "⏳ Waiting for Mosquitto instance to be running..."
aws ec2 wait instance-running --instance-ids $MOSQUITTO_INSTANCE

# Get Mosquitto public IP
MOSQUITTO_IP=$(aws ec2 describe-instances \
  --instance-ids $MOSQUITTO_INSTANCE \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

# Update backend setup script with Mosquitto IP
sed -i "s/MOSQUITTO_EC2_IP/$MOSQUITTO_IP/g" setup-backend-ec2.sh

# Launch Backend EC2 instance
echo "🚀 Launching Backend EC2 instance..."
BACKEND_INSTANCE=$(aws ec2 run-instances \
  --image-id ami-0c02fb55956c7d316 \
  --count 1 \
  --instance-type t2.small \
  --key-name $KEY_NAME \
  --security-group-ids $SG_ID \
  --user-data file://setup-backend-ec2.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=Praan-Backend}]' \
  --query 'Instances[0].InstanceId' \
  --output text)

# Wait for Backend instance to be running
echo "⏳ Waiting for Backend instance to be running..."
aws ec2 wait instance-running --instance-ids $BACKEND_INSTANCE

# Get Backend public IP
BACKEND_IP=$(aws ec2 describe-instances \
  --instance-ids $BACKEND_INSTANCE \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

echo "✅ Deployment Complete!"
echo ""
echo "📋 Instance Details:"
echo "Mosquitto MQTT Broker:"
echo "  Instance ID: $MOSQUITTO_INSTANCE"
echo "  Public IP: $MOSQUITTO_IP"
echo "  MQTT URL: mqtt://$MOSQUITTO_IP:1883"
echo ""
echo "Backend Server:"
echo "  Instance ID: $BACKEND_INSTANCE"
echo "  Public IP: $BACKEND_IP"
echo "  API URL: http://$BACKEND_IP:3000"
echo ""
echo "🔑 SSH Commands:"
echo "ssh -i ${KEY_NAME}.pem ec2-user@$MOSQUITTO_IP"
echo "ssh -i ${KEY_NAME}.pem ec2-user@$BACKEND_IP"