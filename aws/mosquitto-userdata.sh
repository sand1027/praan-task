#!/bin/bash

# Update system
yum update -y

# Install Mosquitto
amazon-linux-extras install epel -y
yum install mosquitto -y

# Configure Mosquitto
cat > /etc/mosquitto/mosquitto.conf << EOF
listener 1883
allow_anonymous true
persistence true
persistence_location /var/lib/mosquitto/
log_dest file /var/log/mosquitto/mosquitto.log
EOF

# Start Mosquitto
systemctl enable mosquitto
systemctl start mosquitto

# Open firewall
yum install -y iptables-services
iptables -A INPUT -p tcp --dport 1883 -j ACCEPT
service iptables save

echo "Mosquitto MQTT broker installed and running on port 1883"