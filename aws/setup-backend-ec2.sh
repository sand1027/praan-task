#!/bin/bash

echo "🚀 Setting up Backend Server on EC2"

# Update system
sudo yum update -y

# Install Node.js 18
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install Git
sudo yum install -y git

# Install PM2 for process management
sudo npm install -g pm2

# Create app directory
sudo mkdir -p /opt/praan-iot
sudo chown ec2-user:ec2-user /opt/praan-iot
cd /opt/praan-iot

# Clone repository (replace with your repo URL)
git clone https://github.com/yourusername/praan-iot-backend.git .

# Install dependencies
npm install

# Create production environment file
cat > .env << EOF
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/praan-iot
MQTT_BROKER_URL=mqtt://MOSQUITTO_EC2_IP:1883
DEVICE_ID=AIR_PURIFIER_001
MAX_RETRIES=3
RETRY_TIMEOUT=30000
EOF

# Create PM2 ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'praan-iot-backend',
    script: 'src/backend/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
EOF

# Start application with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Configure firewall
sudo yum install -y iptables-services
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
sudo service iptables save

echo "✅ Backend server is running on port 3000"
echo "API URL: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):3000"