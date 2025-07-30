# CamAlert Pi Service

This service runs on your Raspberry Pi to receive and save recordings to the SD card.

## Setup Instructions

### 1. Install on Raspberry Pi

```bash
# Copy files to your Pi
scp -r pi-service/ pi@YOUR_PI_IP:~/camalert-pi-service/

# SSH into your Pi
ssh pi@YOUR_PI_IP

# Navigate to service directory
cd ~/camalert-pi-service

# Install dependencies
npm install
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
2. In the Storage Settings, add your Pi's IP address
3. Format: `http://192.168.1.100:3001` (replace with your Pi's actual IP)

## File Organization

Videos will be saved as:
- **Motion recordings**: `motion_2025-01-26T14-30-45-123Z_recording.webm`
- **Manual recordings**: `manual_2025-01-26T14-30-45-123Z_recording.webm`

## Troubleshooting

### Check if service is running:
```bash
curl http://localhost:3001/health
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
ls -la /media/pi/SD_CARD/Videos/
```