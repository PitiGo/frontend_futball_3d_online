#!/bin/bash

# Server details
SERVER_IP="147.79.118.190"
USER="root"

# Log file locations
LOG_FILE_1="/opt/football3d-server/server.log" # you can add logging to the console, by using a library like winston
LOG_FILE_2="/opt/football3d-server/server2.log" # you can add logging to the console, by using a library like winston

# Local directory to save logs
LOCAL_DIR="./server_logs"

# Create local directory if it doesn't exist
mkdir -p "$LOCAL_DIR"

# Function to download logs
download_log() {
    local log_file="$1"
    local local_file="${LOCAL_DIR}/$(basename "$log_file")"
    echo "Downloading $log_file to $local_file..."
    scp "$USER@$SERVER_IP:$log_file" "$local_file"
    if [ $? -ne 0 ]; then
      echo "Failed to download $log_file"
    fi
}
# Download logs
download_log "$LOG_FILE_1"
download_log "$LOG_FILE_2"


echo "Logs downloaded to $LOCAL_DIR"