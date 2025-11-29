# CamAlert - Smart Camera Monitoring System

A powerful web-based camera monitoring system with motion detection, email alerts, and automatic recording storage to your Raspberry Pi's SD card.

Using a Webcam is way easier than using a Raspberry Pi + Camera, but if you wanna tinker with a RPi no one is stopping you.

> ⚠️ **VPN Compatibility Notice for Raspberry Pi**: This system currently does not work when the Raspberry Pi is connected through a VPN. If you're using a VPN on your Raspberry Pi or router, you may experience connection issues. VPN support is planned for a future update.

## 🎯 Features

- **Motion Detection**: AI-powered motion detection with customizable sensitivity
- **Email Alerts**: Instant notifications with motion snapshots
- **Raspberry Pi Storage**: Automatic recording sync to Pi's SD card with reliable stop control
- **Secure Authentication**: User accounts with secure access
- **Real-time Monitoring**: Live camera feeds with overlay controls
- **Recording Management**: Manual and automatic recording with improved reliability
- **Robust Recording Control**: Signal-based FFmpeg control with automatic timeouts and graceful shutdown

---

## 📋 Prerequisites

- **Raspberry Pi** (3B+ or newer recommended) with SD card
- **IP Cameras** (MJPEG/HTTP streams supported) OR Pi Camera Module
- **Node.js** 18+ and npm
- **Router with Port Forwarding** capability
- **DuckDNS Account** (free dynamic DNS service)
- **Resend Account** (for email notifications)

---

## 🍓 Complete Raspberry Pi Setup Guide

### Step 1: Prepare Your Raspberry Pi

1. **Install Raspberry Pi OS**:
   ```bash
   # Flash Raspberry Pi OS Lite to SD card using Raspberry Pi Imager
   # Enable SSH and configure WiFi during setup
   # Username: pi, Password: (your choice)
   ```

2. **First Boot Setup**:
   ```bash
   # SSH into your Pi
   ssh pi@YOUR_PI_IP
   
   # Update system
   sudo apt update && sudo apt upgrade -y
   
   # Install required packages
   sudo apt install nodejs npm git curl -y
   
   # Check Node.js version (should be 18+)
   node --version
   ```

3. **Create Storage Directory**:
   ```bash
   # Create directory for recordings (adjust path as needed)
   mkdir -p /home/pi/Videos
   
   # Set proper permissions
   chmod 755 /home/pi/Videos
   ```

### Step 2: Setup Camera Streaming (If Using Pi Camera)

If you're using a Raspberry Pi Camera Module:

1. **Enable Camera Interface**:
   ```bash
   sudo raspi-config
   # Navigate to Interface Options > Camera > Enable
   # Reboot when prompted
   sudo reboot
   ```

2. **Install Camera Streaming Service**:
   ```bash
   # Clone the pi-service repository to your Pi
   git clone https://github.com/Shiki07/camalert.git
   cd camalert/pi-service
   
   # Install dependencies
   npm install
   
   # Install Python dependencies for camera streaming
   pip3 install picamera2 flask flask-cors
   ```

3. **Start Camera Stream Server**:
   ```bash
   # Make streaming script executable
   chmod +x libcamera_stream.py
   
   # Test camera streaming (port 8000)
   python3 libcamera_stream.py
   
   # Test from another device: http://PI_IP:8000/stream.mjpg
   ```

### Step 3: Setup Recording Storage Service

1. **Configure Pi Service**:
   ```bash
   # Edit server.js to match your setup
   nano server.js
   
   # Update the videosDir path (around line 11):
   const videosDir = '/home/pi/Videos';  // Match your actual path
   ```

2. **Test Pi Service**:
   ```bash
   # Start the Pi service (port 3002)
   npm start
   
   # Test from Pi itself
   curl http://localhost:3002/health
   
   # Should return: {"status":"running","timestamp":"...","videosPath":"..."}
   ```

### Step 4: Setup Dynamic DNS with DuckDNS

1. **Create DuckDNS Account**:
   - Go to [duckdns.org](https://duckdns.org)
   - Sign up with GitHub/Google account
   - Create a subdomain (e.g., `yourname.duckdns.org`)
   - Note down your token

2. **Configure DuckDNS on Pi**:
   ```bash
   # Create DuckDNS script
   nano ~/duckdns_update.sh
   ```
   
   Add this content (replace with your details):
   ```bash
   #!/bin/bash
   echo url="https://www.duckdns.org/update?domains=yourname&token=your-token&ip=" | curl -k -o ~/duckdns.log -K -
   ```
   
   ```bash
   # Make executable
   chmod +x ~/duckdns_update.sh
   
   # Test it
   ./duckdns_update.sh
   cat ~/duckdns.log  # Should show "OK"
   
   # Add to crontab for auto-updates
   crontab -e
   # Add this line:
   */5 * * * * ~/duckdns_update.sh >/dev/null 2>&1
   ```

### Step 5: Configure Router Port Forwarding

**CRITICAL**: Your Pi services must be accessible from the internet for the webapp to work.

1. **Access Router Admin Panel**:
   - Open router admin (usually `192.168.1.1` or `192.168.0.1`)
   - Login with admin credentials

2. **Setup Port Forwarding Rules**:
   
   **For Camera Stream (if using Pi Camera):**
   - External Port: `8000`
   - Internal IP: `YOUR_PI_IP` (e.g., `192.168.1.100`)
   - Internal Port: `8000`
   - Protocol: `TCP`
   
   **For Recording Storage (Required for Pi Sync):**
   - External Port: `3002`
   - Internal IP: `YOUR_PI_IP` (e.g., `192.168.1.100`)
   - Internal Port: `3002`
   - Protocol: `TCP`

3. **Test External Access**:
   ```bash
   # From your phone's mobile data (not WiFi), test:
   # http://yourname.duckdns.org:8000/stream.mjpg (camera stream)
   # http://yourname.duckdns.org:3002/health (pi service)
   ```

### Step 6: Auto-Start Services on Boot

1. **Create Camera Stream Service** (if using Pi Camera):
   ```bash
   sudo nano /etc/systemd/system/camalert-camera.service
   ```
   
   Add:
   ```ini
   [Unit]
   Description=CamAlert Camera Stream
   After=network.target
   
   [Service]
   Type=simple
   User=pi
   WorkingDirectory=/home/pi/camalert/pi-service
   ExecStart=/usr/bin/python3 libcamera_stream.py
   Restart=always
   RestartSec=10
   
   [Install]
   WantedBy=multi-user.target
   ```

2. **Create Pi Storage Service**:
   ```bash
   sudo nano /etc/systemd/system/camalert-storage.service
   ```
   
   Add:
   ```ini
   [Unit]
   Description=CamAlert Pi Storage Service
   After=network.target
   
   [Service]
   Type=simple
   User=pi
   WorkingDirectory=/home/pi/camalert/pi-service
   ExecStart=/usr/bin/node server.js
   Restart=always
   RestartSec=10
   
   [Install]
   WantedBy=multi-user.target
   ```

3. **Enable and Start Services**:
   ```bash
   # Enable auto-start
   sudo systemctl enable camalert-camera.service   # If using Pi camera
   sudo systemctl enable camalert-storage.service
   
   # Start services
   sudo systemctl start camalert-camera.service    # If using Pi camera
   sudo systemctl start camalert-storage.service
   
   # Check status
   sudo systemctl status camalert-camera.service   # If using Pi camera
   sudo systemctl status camalert-storage.service
   ```

### Step 7: Final Verification

1. **Test All Services**:
   ```bash
   # Check camera stream (if using Pi camera)
   curl -I http://localhost:8000/stream.mjpg
   
   # Check storage service
   curl http://localhost:3002/health
   
   # Check from external network (use mobile data)
   # Visit: http://yourname.duckdns.org:8000/stream.mjpg
   # Visit: http://yourname.duckdns.org:3002/health
   ```

2. **View Service Logs** (if issues):
   ```bash
   # Camera service logs
   sudo journalctl -u camalert-camera.service -f
   
   # Storage service logs
   sudo journalctl -u camalert-storage.service -f
   
   # System logs
   sudo journalctl -f
   ```

---

## 🎮 Connecting Your Pi to the Webapp

### Step 1: Configure Camera Source

1. **Access the Webapp**:
   - Open your CamAlert webapp
   - Login with your account

2. **Add Camera Source**:
   - Go to Camera Source section
   - Select "Network Camera (MJPEG)"
   - Enter camera URL:
     - **Pi Camera**: `http://yourname.duckdns.org:8000/stream.mjpg`
     - **IP Camera**: `http://camera-ip:port/stream.mjpg`
   - Click "Test Connection" - should show ✅ success
   - Click "Connect" to start live feed

### Step 2: Configure Storage Settings

1. **Set Storage Location**:
   - Go to Storage Settings section
   - Select "Cloud" (recommended for Pi sync)
   - Set Recording Quality (medium recommended)

2. **Configure Pi Sync Endpoint**:
   - Enter Pi Sync Endpoint: `http://yourname.duckdns.org:3002`
   - Click "Test Connection" - should show ✅ success
   - Recordings will now automatically sync to your Pi's SD card!

### Step 3: Setup Motion Detection

1. **Enable Motion Detection**:
   - Toggle "Motion Detection" switch
   - Adjust sensitivity (start with 50)
   - Set recording duration (default 30 seconds)

2. **Configure Email Alerts**:
   - Toggle "Email Notifications"
   - Enter your email address
   - Test with "Send Test Email"

---

## 🔧 Troubleshooting

### Pi Services Not Starting

```bash
# Check what's running on your ports
sudo netstat -tulpn | grep :8000  # Camera stream
sudo netstat -tulpn | grep :3002  # Storage service

# Check service status
sudo systemctl status camalert-camera.service
sudo systemctl status camalert-storage.service

# Restart services
sudo systemctl restart camalert-camera.service
sudo systemctl restart camalert-storage.service
```

### Connection Test Failures

1. **Test Local Access First**:
   ```bash
   # From Pi itself
   curl http://localhost:8000/stream.mjpg
   curl http://localhost:3002/health
   ```

2. **Test LAN Access**:
   ```bash
   # From another device on same network
   curl http://PI_IP:8000/stream.mjpg
   curl http://PI_IP:3002/health
   ```

3. **Test External Access**:
   ```bash
   # From mobile data (not WiFi)
   curl http://yourname.duckdns.org:8000/stream.mjpg
   curl http://yourname.duckdns.org:3002/health
   ```

### Port Forwarding Issues

- **Double-check router settings**: External port → Pi's internal IP and port
- **Firewall**: Some routers have additional firewall settings
- **ISP blocking**: Some ISPs block certain ports
- **Dynamic IP**: Make sure DuckDNS is updating correctly

### Pi Sync Not Working

1. **Check Pi Service Health**:
   ```bash
   curl http://yourname.duckdns.org:3002/health
   ```

2. **Check Pi Storage Logs**:
   ```bash
   # View upload log
   cat /home/pi/Videos/upload_log.json
   
   # Check service logs
   sudo journalctl -u camalert-storage.service -f
   ```

3. **Test Manual Upload**:
   ```bash
   # Test upload to Pi from any device
   curl -X POST -F "file=@test.txt" http://yourname.duckdns.org:3002/upload
   ```

### Recording Stop Issues

The system now uses improved signal-based stopping for reliable recording termination:

1. **Normal Stop Behavior**:
   - Recording stop sends `SIGINT` to FFmpeg for graceful shutdown
   - If not stopped within 5 seconds, automatically sends `SIGKILL` for forced termination
   - Includes 15-second timeout to prevent indefinite hanging
   - Toast notifications keep you informed of stop progress

2. **If Stop Appears Stuck**:
   ```bash
   # Check if FFmpeg process is still running
   ps aux | grep ffmpeg
   
   # Check service logs for stop attempts
   sudo journalctl -u camalert-storage.service -f
   
   # Manually kill stuck FFmpeg process (if needed)
   sudo pkill -9 ffmpeg
   ```

3. **Verify FFmpeg Installation**:
   ```bash
   # FFmpeg must be installed for recording to work
   ffmpeg -version
   
   # If not installed:
   sudo apt install ffmpeg -y
   ```

---

## 📞 Support

- **GitHub Issues**: Report bugs and feature requests
- **Documentation**: Check troubleshooting section above
- **Community**: Join discussions for help and tips

---

## 🎉 You're All Set!

Your CamAlert system is now ready with:
- ✅ Pi camera streaming (if configured)
- ✅ Automatic recording storage to Pi's SD card
- ✅ Motion detection with email alerts
- ✅ Secure remote access via DuckDNS
- ✅ Real-time monitoring from anywhere

Your recordings are automatically saved to `/home/pi/Videos/` with filenames like:
- `motion_2025-01-26T14-30-45-123Z_recording.webm`
- `manual_2025-01-26T14-30-45-123Z_recording.webm`

---

## 🔐 Security Notes

1. **Change Default Passwords**:
   - Change Pi user password: `passwd`
   - Update router admin password
   - Use strong Supabase passwords

2. **Network Security**:
   - Only forward necessary ports (8000, 3002)
   - Consider using VPN for additional security
   - Keep Pi OS updated: `sudo apt update && sudo apt upgrade`

3. **Monitoring**:
   - Check Pi service logs regularly
   - Monitor storage space: `df -h`
   - Review uploaded recordings periodically

---

## Camera Compatibility Guide

### Supported Camera Types

- **MJPEG Streams** - Most IP cameras and Pi Camera (recommended)
- **RTSP Streams** - Common for security cameras (partial support)
- **USB Cameras** - Via MJPEG streaming software

### Common Camera Stream URLs

**Raspberry Pi Camera:**
```
http://yourname.duckdns.org:8000/stream.mjpg
```

**Generic IP Cameras:**
```
http://camera-ip:8000/stream.mjpg
http://camera-ip/mjpeg
http://camera-ip/video.cgi
```

**Popular Brands:**
- **Axis**: `http://camera-ip/axis-cgi/mjpg/video.cgi`
- **Hikvision**: `rtsp://camera-ip:554/Streaming/Channels/101`
- **Dahua**: `rtsp://camera-ip:554/cam/realmonitor?channel=1&subtype=0`

---

*Need help? Create an issue on GitHub with your Pi model, router type, and error messages.*
