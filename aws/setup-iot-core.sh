#!/bin/bash

echo "Setting up AWS IoT Core..."

# Create IoT Thing
aws iot create-thing --thing-name "AIR_PURIFIER_001"

# Create IoT Policy
aws iot create-policy \
  --policy-name "PraanIoTPolicy" \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "iot:Connect",
          "iot:Publish",
          "iot:Subscribe",
          "iot:Receive"
        ],
        "Resource": "*"
      }
    ]
  }'

# Create certificates
aws iot create-keys-and-certificate \
  --set-as-active \
  --certificate-pem-outfile device.cert.pem \
  --public-key-outfile device.public.key \
  --private-key-outfile device.private.key

echo "IoT Core setup complete!"
echo "MQTT Endpoint:"
aws iot describe-endpoint --endpoint-type iot:Data-ATS