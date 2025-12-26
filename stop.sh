#!/bin/bash

echo "Stopping services..."

docker stop mongo mqtt 2>/dev/null
docker rm mongo mqtt 2>/dev/null

echo "✓ All services stopped"

