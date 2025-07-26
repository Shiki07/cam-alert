# CamAlert - Smart Camera Monitoring System

A powerful web-based camera monitoring system with motion detection, email alerts, and automatic recording storage to your Raspberry Pi's SD card.

## 🎯 Features

- **Multi-Camera Support**: Monitor multiple IP cameras simultaneously
- **Motion Detection**: AI-powered motion detection with customizable sensitivity
- **Email Alerts**: Instant notifications with motion snapshots
- **Raspberry Pi Storage**: Automatic recording sync to Pi's SD card
- **Mobile App**: Native iOS/Android app with direct device storage
- **Secure Authentication**: User accounts with secure access
- **Real-time Monitoring**: Live camera feeds with overlay controls
- **Recording Management**: Manual and automatic recording capabilities

---

## 📋 Prerequisites

- **Raspberry Pi** (3B+ or newer recommended) with SD card
- **IP Cameras** (RTSP/HTTP streams supported)
- **Node.js** 18+ and npm
- **Supabase Account** (free tier available)
- **Resend Account** (for email notifications)

---

## 🍓 Raspberry Pi Setup

### Step 1: Prepare Your Raspberry Pi

1. **Install Raspberry Pi OS**:
   ```bash
   # Flash Raspberry Pi OS to SD card using Raspberry Pi Imager
   # Enable SSH and configure WiFi during setup
   ```

2. **Update System**:
   ```bash
   sudo apt update && sudo apt upgrade -y
   sudo apt install nodejs npm git -y
   ```

3. **Create Videos Directory**:
   ```bash
   # Create directory on SD card for recordings
   sudo mkdir -p /media/pi/SD_CARD/Videos
   sudo chown pi:pi /media/pi/SD_CARD/Videos
   
   # Or if using internal storage:
   mkdir -p /home/pi/Videos
   ```

### Step 2: Install CamAlert Pi Service

1. **Clone and Setup**:
   ```bash
   # Transfer pi-service folder to your Pi
   scp -r pi-service/ pi@YOUR_PI_IP:~/camalert-pi-service/
   
   # SSH into Pi
   ssh pi@YOUR_PI_IP
   cd ~/camalert-pi-service
   
   # Install dependencies
   npm install
   ```

2. **Configure Storage Path**:
   ```bash
   # Edit server.js to match your SD card mount point
   nano server.js
   
   # Update this line:
   const videosDir = '/media/pi/SD_CARD/Videos'; // Your actual path
   ```

3. **Start Pi Service**:
   ```bash
   # Test run
   npm start
   
   # Or with auto-restart for development
   npm run dev
   ```

4. **Make Service Auto-Start** (Optional):
   ```bash
   # Create systemd service
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
   
   ```bash
   # Enable and start
   sudo systemctl enable camalert-pi.service
   sudo systemctl start camalert-pi.service
   ```

5. **Test Pi Service**:
   ```bash
   # Check if running
   curl http://localhost:3001/health
   
   # Should return: {"status":"running","timestamp":"...","videosPath":"..."}
   ```

---

## 🚀 Web Application Setup

### Step 1: Clone and Install

```bash
git clone <your-repo-url>
cd camalert
npm install
```

### Step 2: Configure Supabase

1. **Create Supabase Project**:
   - Go to [supabase.com](https://supabase.com)
   - Create new project
   - Copy Project URL and Anon Key

2. **Set Environment Variables**:
   ```bash
   # Create .env.local file
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. **Run Database Migrations**:
   ```bash
   npx supabase login
   npx supabase init
   npx supabase db push
   ```

### Step 3: Configure Email Service

1. **Get Resend API Key**:
   - Sign up at [resend.com](https://resend.com)
   - Create API key
   - Add to Supabase secrets as `RESEND_API_KEY`

### Step 4: Start Development Server

```bash
npm run dev
```

---

## 📱 Mobile App Setup (Optional)

### For iOS/Android Direct Storage

1. **Export to GitHub**:
   - Click "Export to GitHub" in Lovable
   - Clone your repository locally

2. **Setup Mobile Development**:
   ```bash
   npm install
   npm run build
   
   # Add platforms
   npx cap add ios      # For iOS
   npx cap add android  # For Android
   
   # Sync project
   npx cap sync
   ```

3. **Run on Device**:
   ```bash
   npx cap run ios      # Requires macOS + Xcode
   npx cap run android  # Requires Android Studio
   ```

---

## 🎮 How to Use CamAlert

### 1. Account Setup

1. **Access the App**:
   - Open `http://localhost:5173` (development)
   - Or your deployed URL

2. **Create Account**:
   - Click "Sign Up"
   - Enter email and password
   - Verify email (if confirmation enabled)

3. **Login**:
   - Use your credentials to sign in

### 2. Camera Configuration

#### Finding Your Camera Stream URL

**For IP Cameras**:
- Most cameras: `rtsp://username:password@camera_ip:554/stream`
- Some cameras: `http://camera_ip:port/mjpg/video.mjpg`

**For Raspberry Pi Camera**:
```bash
# On your Pi with camera, install UV4L
curl http://www.linux-projects.org/listing/uv4l_repo/lpkey.asc | sudo apt-key add -
echo 'deb http://www.linux-projects.org/listing/uv4l_repo/raspbian/stretch stretch main' | sudo tee /etc/apt/sources.list.d/uv4l.list
sudo apt update
sudo apt install uv4l uv4l-raspicam uv4l-server

# Start streaming
uv4l --driver raspicam --auto-video_nr --object-detection-threshold=50000
# Stream available at: http://PI_IP:8080/stream/video.mjpeg
```

#### Adding Cameras to CamAlert

1. **Camera Setup Section**:
   - In the web app, find "Camera Source" section
   - Enter your camera's stream URL
   - Test connection with "Test Connection" button

2. **Configure Quality**:
   - Select video quality (480p, 720p, 1080p)
   - Higher quality = larger file sizes

### 3. Motion Detection Setup

1. **Enable Motion Detection**:
   - Toggle "Motion Detection" switch
   - Adjust sensitivity (1-100, higher = more sensitive)

2. **Advanced Settings**:
   - **Detection Zones**: Draw specific areas to monitor
   - **Cooldown Period**: Time between motion alerts
   - **Recording Duration**: How long to record after motion

### 4. Email Notifications

1. **Setup Email Alerts**:
   - Toggle "Email Notifications"
   - Enter recipient email address
   - Choose notification types:
     - Motion detection alerts
     - System status alerts

2. **Test Notifications**:
   - Use "Send Test Email" button
   - Check spam folder if not received

### 5. Storage Configuration

#### Option 1: Raspberry Pi Sync (Recommended)

1. **Configure Pi Endpoint**:
   - In Storage Settings, enter: `http://YOUR_PI_IP:3001`
   - Replace `YOUR_PI_IP` with actual Pi IP address

2. **How It Works**:
   - Recordings saved to Supabase cloud storage
   - Automatically synced to Pi's SD card
   - Files organized as: `motion_TIMESTAMP_recording.webm` or `manual_TIMESTAMP_recording.webm`

#### Option 2: Mobile App Direct Storage

1. **Use Mobile App**:
   - Install mobile app on device
   - Recordings saved directly to device storage
   - No cloud dependency

#### Option 3: Manual Download

1. **Download from Web**:
   - View recordings in Recording History
   - Click download button for each recording

### 6. Recording Management

#### Manual Recording

1. **Start Recording**:
   - Click red record button in camera controls
   - Recording starts immediately

2. **Stop Recording**:
   - Click stop button
   - File automatically saved to configured storage

#### Motion-Triggered Recording

1. **Automatic Operation**:
   - When motion detected, recording starts automatically
   - Continues for configured duration
   - Saved with "motion_" prefix

#### Viewing Recordings

1. **Recording History**:
   - Scroll down to see all recordings
   - View thumbnails and details
   - Download or delete recordings

### 7. System Monitoring

#### Camera Status

- **Green**: Camera connected and streaming
- **Yellow**: Connection issues
- **Red**: Camera offline

#### System Health

- Monitor connection status
- Check storage space (Pi setup)
- View motion detection statistics

---

## 🔧 Troubleshooting

### Camera Connection Issues

1. **Check URL Format**:
   ```
   rtsp://username:password@192.168.1.100:554/stream
   http://192.168.1.100:8080/stream/video.mjpeg
   ```

2. **Test Camera Directly**:
   ```bash
   # Test with VLC or ffmpeg
   vlc rtsp://your_camera_url
   ffplay rtsp://your_camera_url
   ```

3. **Network Issues**:
   - Ensure camera and computer on same network
   - Check firewall settings
   - Try different ports

### Pi Service Issues

1. **Check Service Status**:
   ```bash
   # Pi service health
   curl http://PI_IP:3001/health
   
   # View logs
   sudo journalctl -u camalert-pi.service -f
   ```

2. **Storage Problems**:
   ```bash
   # Check SD card space
   df -h /media/pi/SD_CARD/
   
   # List recordings
   ls -la /media/pi/SD_CARD/Videos/
   ```

### Email Issues

1. **Check Supabase Secrets**:
   - Verify RESEND_API_KEY is set
   - Check email address format

2. **Test Email Function**:
   - Use "Send Test Email" button
   - Check Supabase Edge Function logs

### Motion Detection Issues

1. **Sensitivity Too High/Low**:
   - Adjust sensitivity slider
   - Test in different lighting conditions

2. **False Positives**:
   - Use detection zones to exclude areas
   - Increase cooldown period

---

## 📁 File Organization

### Raspberry Pi Storage Structure

```
/media/pi/SD_CARD/Videos/
├── motion_2025-01-26T14-30-45-123Z_recording.webm
├── manual_2025-01-26T14-30-45-123Z_recording.webm
├── upload_log.json
└── ...
```

### Mobile App Storage

- **iOS**: Files app > CamAlert folder
- **Android**: Internal storage > CamAlert folder

---

## 🔐 Security Notes

1. **Change Default Passwords**:
   - Update camera passwords
   - Use strong authentication

2. **Network Security**:
   - Use VPN for remote access
   - Keep software updated

3. **Pi Security**:
   - Change default Pi password
   - Enable firewall if needed

---

## 📞 Support

- **GitHub Issues**: Report bugs and feature requests
- **Documentation**: Check troubleshooting section
- **Community**: Join discussions for help and tips

---

## 🎉 You're All Set!

Your CamAlert system is now ready to monitor your cameras with intelligent motion detection and automatic recording storage to your Raspberry Pi!

---

## Camera Setup Guide

### Supported Camera Types

- **MJPEG Streams** - Most IP cameras support this format
- **RTSP Streams** - Common for security cameras (partial support)
- **HLS Streams** - HTTP Live Streaming (partial support)

### Finding Your Camera Stream URL

#### Common Camera Stream URL Formats:

**MJPEG:**
- `http://camera-ip:port/stream.mjpg`
- `http://camera-ip:port/video.cgi`
- `http://camera-ip:port/mjpeg`

**RTSP:**
- `rtsp://camera-ip:port/stream1`
- `rtsp://camera-ip:port/live`

#### Popular Camera Brands:

**Raspberry Pi Camera:**
```
http://raspberry-pi-ip:8081/stream.mjpg
```

**Generic IP Cameras:**
```
http://camera-ip:8080/video.cgi
http://camera-ip/mjpeg
```

**Axis Cameras:**
```
http://camera-ip/axis-cgi/mjpg/video.cgi
```

**Hikvision:**
```
rtsp://camera-ip:554/Streaming/Channels/101
```

### Setting Up Raspberry Pi Camera

If you're using a Raspberry Pi with a camera module:

1. **Install Motion on Raspberry Pi:**
   ```bash
   sudo apt update
   sudo apt install motion
   ```

2. **Configure Motion:**
   Edit `/etc/motion/motion.conf`:
   ```
   daemon on
   stream_port 8081
   stream_localhost off
   webcontrol_localhost off
   quality 75
   width 640
   height 480
   framerate 15
   ```

3. **Start Motion:**
   ```bash
   sudo systemctl enable motion
   sudo systemctl start motion
   ```

4. **Access Stream:**
   Your stream will be available at: `http://your-pi-ip:8081/stream.mjpg`

## Adding Cameras to CamAlert

1. **Sign in to CamAlert**
2. **Click "Add Camera" or the camera settings icon**
3. **Fill in camera details:**
   - **Name:** Give your camera a descriptive name
   - **URL:** Enter your camera's stream URL
   - **Type:** Select MJPEG, RTSP, or HLS
   - **Username/Password:** If your camera requires authentication

4. **Test Connection:** Click "Test Connection" to verify the stream works
5. **Save:** Click "Connect" to add the camera

### Troubleshooting Camera Connections

**Mixed Content Errors (HTTPS to HTTP):**
- CamAlert includes a built-in proxy to handle HTTP cameras on HTTPS sites
- The proxy automatically activates for HTTP streams when needed

**CORS Errors:**
- Some cameras block cross-origin requests
- Try accessing the camera stream directly in your browser first
- Check camera settings for CORS or cross-origin permissions

**Authentication Issues:**
- Ensure username/password are correct
- Some cameras use digest authentication
- Try accessing the stream URL directly with credentials

## Motion Detection Configuration

### Basic Settings

- **Sensitivity:** How easily motion is detected (1-10 scale)
- **Threshold:** Minimum change required to trigger detection
- **Schedule:** Set specific hours for monitoring

### Advanced Settings

- **Detection Zones:** Define specific areas to monitor
- **Cooldown Period:** Time between motion alerts
- **Minimum Duration:** How long motion must occur to trigger
- **Noise Reduction:** Filter out minor movements

### Email Notifications

1. **Enable Email Notifications** in camera settings
2. **Enter your email address**
3. **Test the notification** using the test button
4. **Configure notification frequency** to avoid spam

## Recording Management

### Storage Options

- **Cloud Storage:** Recordings stored in Supabase (requires configuration)
- **Local Storage:** Browser-based temporary storage

### Recording Settings

- **Quality:** Choose between High, Medium, Low
- **Auto-Recording:** Automatically record when motion is detected
- **Manual Recording:** Start/stop recording manually

## Deployment

### Deploy to Lovable

1. In the Lovable editor, click "Publish" in the top right
2. Your app will be deployed to a Lovable subdomain
3. Configure your custom domain in Project Settings if desired

### Deploy to Other Platforms

Since the code is standard React/Vite, you can deploy to:

- **Vercel:** Connect your GitHub repo to Vercel
- **Netlify:** Deploy directly from GitHub
- **Cloudflare Pages:** Connect your repository
- **Your own server:** Build with `npm run build` and serve the `dist` folder

### Environment Configuration for Production

1. **Update Supabase Settings:**
   - Add your production domain to allowed origins
   - Update site URL in Authentication settings

2. **Configure CORS:**
   - Ensure your camera URLs are accessible from your domain
   - Update any firewall settings

## Security Considerations

### Network Security

- **Firewall Rules:** Only expose necessary camera ports
- **VPN Access:** Consider VPN for accessing local cameras remotely
- **Camera Passwords:** Use strong passwords for camera authentication

### Application Security

- **HTTPS Only:** Always use HTTPS in production
- **Strong Passwords:** Enforce strong user passwords
- **Regular Updates:** Keep dependencies updated

## Troubleshooting

### Common Issues

**"Failed to connect to MJPEG stream"**
- Check camera URL and credentials
- Verify camera is accessible on your network
- Test stream URL directly in browser

**"Mixed Content" errors**
- This is normal for HTTP cameras on HTTPS sites
- The built-in proxy should handle this automatically

**Motion detection not working**
- Adjust sensitivity settings
- Check detection zones
- Verify motion detection is enabled

**Email notifications not working**
- Verify Resend API key is configured
- Check email address is correct
- Look for emails in spam folder
- Verify sender domain is configured in Resend

### Getting Help

1. **Check Browser Console:** Look for error messages
2. **Test Components:** Use the built-in connection tests
3. **Review Settings:** Double-check all configuration options
4. **Community Support:** Join our Discord or GitHub discussions

## API Documentation

### Camera Connection API

The system uses a custom hook `useNetworkCamera` for camera management:

```typescript
const {
  isConnecting,
  connectionError,
  isConnected,
  videoRef,
  connectToCamera,
  disconnect,
  testConnection
} = useNetworkCamera();
```

### Motion Detection API

Motion detection is handled by `useEnhancedMotionDetection`:

```typescript
const {
  isEnabled,
  sensitivity,
  threshold,
  motionDetected,
  toggleMotionDetection,
  updateSettings
} = useEnhancedMotionDetection();
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

- **Documentation:** [Full documentation](https://docs.lovable.dev/)
- **Community:** [Discord Community](https://discord.com/channels/1119885301872070706/1280461670979993613)
- **Issues:** Report bugs on GitHub Issues
- **Email:** Contact support for enterprise inquiries

---

**Built with ❤️ using React, TypeScript, Tailwind CSS, and Supabase**
