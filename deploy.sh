#!/bin/bash
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

set -euo pipefail

# Make sure this script is executable: chmod +x deploy.sh

# Enhanced logging functions
echo_info() { echo -e "\033[1;34m[INFO]\033[0m $(date '+%Y-%m-%d %H:%M:%S') $1"; }
echo_error() { echo -e "\033[1;31m[ERROR]\033[0m $(date '+%Y-%m-%d %H:%M:%S') $1"; }
echo_success() { echo -e "\033[1;32m[SUCCESS]\033[0m $(date '+%Y-%m-%d %H:%M:%S') $1"; }
echo_warning() { echo -e "\033[1;33m[WARNING]\033[0m $(date '+%Y-%m-%d %H:%M:%S') $1"; }
echo_debug() { echo -e "\033[1;36m[DEBUG]\033[0m $(date '+%Y-%m-%d %H:%M:%S') $1"; }

# Function to check command exit status
check_exit_status() {
    local exit_code=$1
    local step_name=$2
    if [ $exit_code -eq 0 ]; then
        echo_success "$step_name completed successfully"
    else
        echo_error "$step_name failed with exit code $exit_code"
        return $exit_code
    fi
}

# Function to show system info
show_system_info() {
    echo_info "=== System Information ==="
    echo_debug "Hostname: $(hostname)"
    echo_debug "User: $(whoami)"
    echo_debug "Current directory: $(pwd)"
    echo_debug "Available disk space: $(df -h . | tail -1 | awk '{print $4}')"
    echo_debug "Memory usage: $(free -h | grep Mem | awk '{print $3 "/" $2}')"
    echo_debug "Load average: $(uptime | awk -F'load average:' '{print $2}')"
}

# Function to check dependencies
check_dependencies() {
    echo_info "=== Checking Dependencies ==="
    local missing_deps=()
    
    for cmd in npm pm2 sudo nginx; do
        if command -v $cmd &>/dev/null; then
            local version=$($cmd --version 2>/dev/null | head -1 || echo "version unknown")
            echo_success "$cmd is available: $version"
        else
            echo_error "$cmd is not installed or not in PATH"
            missing_deps+=($cmd)
        fi
    done
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        echo_error "Missing dependencies: ${missing_deps[*]}. Aborting."
        exit 1
    fi
}

# Function to check sudo access
check_sudo_access() {
    echo_info "=== Checking Sudo Access ==="
    if sudo -n true 2>/dev/null; then
        echo_success "Passwordless sudo access confirmed"
    else
        echo_error "Passwordless sudo is required for deployment. Aborting."
        exit 1
    fi
}

# Function to check project structure
check_project_structure() {
    echo_info "=== Checking Project Structure ==="
    local project_root="/home/pi/escape-room"
    
    if [ ! -d "$project_root" ]; then
        echo_error "Project root directory $project_root does not exist"
        exit 1
    fi
    
    if [ ! -d "$project_root/client" ]; then
        echo_error "Client directory $project_root/client does not exist"
        exit 1
    fi
    
    if [ ! -d "$project_root/server" ]; then
        echo_error "Server directory $project_root/server does not exist"
        exit 1
    fi
    
    echo_success "Project structure validation passed"
}

# Start deployment with enhanced logging
echo_info "=== Starting Deployment Process ==="
show_system_info
check_dependencies
check_sudo_access
check_project_structure

# Fix permissions for build
echo_info "=== Fixing Permissions ==="
echo_debug "Fixing permissions for client directory..."
sudo chown -R $(whoami):$(whoami) /home/pi/escape-room/client
check_exit_status $? "Client permissions fix"

echo_debug "Fixing permissions for server directory..."
sudo chown -R $(whoami):$(whoami) /home/pi/escape-room/server
check_exit_status $? "Server permissions fix"

# Build client
echo_info "=== Building Client ==="
cd /home/pi/escape-room/client
echo_debug "Changed to client directory: $(pwd)"

echo_debug "Cleaning previous builds..."
rm -rf /home/pi/escape-room/client/.svelte-kit
rm -rf /home/pi/escape-room/client/build
check_exit_status $? "Client cleanup"

echo_debug "Installing client dependencies..."
npm ci
check_exit_status $? "Client npm install"

echo_debug "Building client application..."
npm run build
check_exit_status $? "Client build"

# Check if build was successful
if [ ! -d "build" ]; then
    echo_error "Build directory was not created"
    exit 1
fi

echo_debug "Build directory contents:"
ls -la build/

echo_info "Deploying client to /var/www/escape-room-client..."
sudo rm -rf /var/www/escape-room-client/*
check_exit_status $? "Client deployment cleanup"

sudo cp -r build/* /var/www/escape-room-client/
check_exit_status $? "Client files copy"

sudo chown -R www-data:www-data /var/www/escape-room-client
check_exit_status $? "Client ownership fix"

echo_debug "Deployed client files:"
sudo ls -la /var/www/escape-room-client/

# Build and deploy server
echo_info "=== Building and Deploying Server ==="
cd /home/pi/escape-room/server
echo_debug "Changed to server directory: $(pwd)"

echo_debug "Installing server dependencies..."
npm ci
check_exit_status $? "Server npm install"

echo_debug "Checking current PM2 processes..."
pm2 list

echo_debug "Stopping existing PM2 processes..."
pm2 delete escape-room-server 2>/dev/null || echo_warning "escape-room-server was not running"
pm2 delete escape-room-lobby 2>/dev/null || echo_warning "escape-room-lobby was not running"

echo_debug "Starting escape-room-server..."
pm2 start index.js --name escape-room-server --cwd /home/pi/escape-room/server --update-env
check_exit_status $? "Server start"

echo_debug "Starting escape-room-lobby..."
pm2 start lobby.js --name escape-room-lobby --cwd /home/pi/escape-room/server --update-env
check_exit_status $? "Lobby start"

echo_debug "Clearing PM2 logs..."
pm2 flush
check_exit_status $? "PM2 log flush"

echo_debug "Current PM2 processes:"
pm2 list

# Reload nginx
echo_info "=== Testing and Reloading Nginx ==="
echo_debug "Testing nginx configuration..."
sudo nginx -t
check_exit_status $? "Nginx configuration test"

echo_debug "Reloading nginx..."
sudo systemctl reload nginx
check_exit_status $? "Nginx reload"

echo_debug "Checking nginx status..."
sudo systemctl status nginx --no-pager -l

echo_info "=== Deployment Summary ==="
echo_success "Deployment completed successfully!"
echo_debug "Client deployed to: /var/www/escape-room-client"
echo_debug "Server processes:"
pm2 list --no-daemon
echo_debug "Nginx status: $(sudo systemctl is-active nginx)"
echo_info "=== End of Deployment Process ==="
