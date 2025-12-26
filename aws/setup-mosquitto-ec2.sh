#!/bin/bash

echo "🦟 Setting up Mosquitto MQTT Broker on EC2"

# Update system
sudo yum update -y

# Install Mosquitto
sudo amazon-linux-extras install epel -y
sudo yum install mosquitto mosquitto-clients -y

# Create Mosquitto config
sudo tee /etc/mosquitto/mosquitto.conf > /dev/null << EOF
# Basic Configuration
listener 1883 0.0.0.0
allow_anonymous true

# Persistence
persistence true
persistence_location /var/lib/mosquitto/

# Logging
log_dest file /var/log/mosquitto/mosquitto.log
log_type error
log_type warning
log_type notice
log_type information

# Connection limits
max_connections 1000
EOF

# Create log directory
sudo mkdir -p /var/log/mosquitto
sudo chown mosquitto:mosquitto /var/log/mosquitto

# Start and enable Mosquitto
sudo systemctl enable mosquitto
sudo systemctl start mosquitto

# Configure firewall
sudo yum install -y iptables-services
sudo iptables -A INPUT -p tcp --dport 1883 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
sudo service iptables save

echo "✅ Mosquitto MQTT Broker is running on port 1883"
echo "Test with: mosquitto_pub -h localhost -t test -m 'Hello World'"