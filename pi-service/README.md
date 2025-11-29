# CamAlert Pi Service

This service runs on your Raspberry Pi to receive and save recordings, as well as provide server-side recording capabilities for network cameras.

## Features

- **File Upload**: Receive recordings uploaded from the web app
- **Server-Side Recording**: Record video directly on the Pi from MJPEG camera streams
- **Storage Management**: Save recordings to SD card with motion/manual organization
- **Recording Status**: Real-time status monitoring of active recordings

## Setup Instructions

### 1. Install Dependencies

```bash
# Copy files to your Pi
scp -r pi-service/ pi@YOUR_PI_IP:~/camalert-pi-service/

# SSH into your Pi
ssh pi@YOUR_PI_IP

# Navigate to service directory
cd ~/camalert-pi-service

# Install Node.js dependencies
npm install

# Install FFmpeg for server-side recording
sudo apt update
sudo apt install ffmpeg -y

# Verify FFmpeg installation
ffmpeg -version
```

### 2. Configure SD Card Mount Point

Edit `server.js` and update the path to match your SD card mount point:

```javascript
// Change this line to match your SD card path
const videosDir = '/media/pi/SD_CARD/Videos';
```

Common SD card mount points:
- `/media/pi/SD_CARD/Videos`
- `/mnt/sdcard/Videos`
- `/home/pi/Videos` (if using Pi's internal storage)

### 3. Start the Service

```bash
# Start the service
npm start

# Or for development with auto-restart
npm run dev
```

The service will run on port 3002 by default.

### 4. Make it Run on Boot (Optional)

Create a systemd service:

```bash
sudo nano /etc/systemd/system/camalert-pi.service
```

Add this content:

```ini
[Unit]
Description=CamAlert Pi Service
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/camalert-pi-service
ExecStart=/usr/bin/node server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable camalert-pi.service
sudo systemctl start camalert-pi.service
```

## Configuration in CamAlert Web App

1. Go to your CamAlert web app
2. Configure your network camera with the Pi's IP address
3. The web app will automatically use the Pi for server-side recording
4. Recording will be saved directly to the Pi's SD card

## API Endpoints

### Health Check
```bash
GET /health
```
Returns service status and configuration.

### File Upload (from web app)
```bash
POST /upload
Content-Type: multipart/form-data

Body:
- file: recording file
- recording_id: unique ID
- recorded_at: timestamp
- motion_detected: true/false
```

### Start Recording (server-side)
```bash
POST /recording/start
Content-Type: application/json

Body:
{
  "recording_id": "unique_id",
  "stream_url": "http://localhost:8000/stream.mjpg",
  "quality": "medium",
  "motion_triggered": false
}
```

### Stop Recording
```bash
POST /recording/stop
Content-Type: application/json

Body:
{
  "recording_id": "unique_id"
}
```

### Get Recording Status
```bash
GET /recording/status/:recording_id
```

### List Active Recordings
```bash
GET /recording/active
```

### List Saved Recordings
```bash
GET /recordings
```

## File Organization

Recordings are organized as:
- **Motion recordings**: `motion_pi_2025-01-26T14-30-45-123Z.mp4`
- **Manual recordings**: `manual_pi_2025-01-26T14-30-45-123Z.mp4`

Server-side recordings use MP4 format with H.264 encoding for better compatibility and smaller file sizes.

## Quality Settings

The service supports three quality presets for server-side recording:

- **High**: 1920x1080, 25 FPS, 2000k bitrate
- **Medium**: 1280x720, 20 FPS, 1000k bitrate
- **Low**: 640x480, 15 FPS, 500k bitrate

## Troubleshooting

### Check if service is running:
```bash
curl http://localhost:3002/health
```

### Test recording endpoints:
```bash
# Start a test recording
curl -X POST http://localhost:3002/recording/start \
  -H "Content-Type: application/json" \
  -d '{"recording_id":"test123","stream_url":"http://localhost:8000/stream.mjpg","quality":"medium"}'

# Check status
curl http://localhost:3002/recording/status/test123

# Stop recording
curl -X POST http://localhost:3002/recording/stop \
  -H "Content-Type: application/json" \
  -d '{"recording_id":"test123"}'
```

### View logs:
```bash
# If running with systemd
sudo journalctl -u camalert-pi.service -f

# If running manually
# Logs appear in terminal
```

### Check saved recordings:
```bash
ls -la /home/ale/Videos/
```

### FFmpeg not found:
```bash
# Reinstall FFmpeg
sudo apt update
sudo apt install ffmpeg -y

# Verify installation
which ffmpeg
ffmpeg -version
```

### Port already in use:
```bash
# Check what's using port 3002
sudo lsof -i :3002

# Change port in server.js or kill the process
```

## Performance Notes

- **Raspberry Pi Zero 2 W**: Recommended to use "low" or "medium" quality
- **Raspberry Pi 3/4**: Can handle "high" quality recordings
- Recording uses FFmpeg with ultrafast preset for minimal CPU usage
- Multiple simultaneous recordings are supported but may impact performance