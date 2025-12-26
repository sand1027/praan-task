#!/bin/bash

echo "Setting up AWS Secrets Manager..."

# Create MongoDB URI secret
aws secretsmanager create-secret \
  --name "praan-iot/mongodb-uri" \
  --description "MongoDB connection string" \
  --secret-string "mongodb+srv://username:password@cluster.mongodb.net/praan-iot"

# Create MQTT broker secret  
aws secretsmanager create-secret \
  --name "praan-iot/mqtt-broker" \
  --description "MQTT broker URL" \
  --secret-string "mqtt://your-mqtt-broker:1883"

echo "Secrets created successfully!"
echo "Update the values in AWS Console > Secrets Manager"