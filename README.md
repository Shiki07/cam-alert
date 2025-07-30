This project is under construction, please wait until it's finished to use it!!!
# CamAlert - Remote Camera Monitoring System

A comprehensive web-based camera monitoring system built with React, TypeScript, and Supabase. Monitor multiple network cameras, detect motion, receive alerts, and manage recordings from anywhere.

## Features

- 🎥 **Multi-Camera Support** - Connect and monitor multiple IP cameras simultaneously
- 🔍 **Motion Detection** - AI-powered motion detection with customizable sensitivity
- 📧 **Email Alerts** - Receive instant notifications when motion is detected
- 📹 **Recording Management** - Automatic recording with cloud and local storage options
- 🔐 **Secure Authentication** - User authentication and access control
- 📱 **Responsive Design** - Works on desktop, tablet, and mobile devices
- ⏰ **Scheduled Monitoring** - Set specific hours for motion detection
- 🎛️ **Advanced Settings** - Fine-tune detection zones, cooldown periods, and more

## Prerequisites

Before setting up CamAlert, ensure you have:

- **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
- **npm** or **yarn** package manager
- **Supabase Account** - [Sign up here](https://supabase.com/)
- **Resend Account** (for email notifications) - [Sign up here](https://resend.com/)
- **Network Camera(s)** - IP cameras with MJPEG, RTSP, or HLS streaming capabilities

## Quick Start

### 1. Clone the Repository

```bash
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Supabase

#### Create a New Supabase Project
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Fill in your project details
4. Wait for the project to be created

#### Configure Database Tables
The project includes pre-configured database migrations. The main tables are:
- `profiles` - User profile information
- `recordings` - Camera recording metadata

#### Set Up Authentication
1. In your Supabase dashboard, go to Authentication > Settings
2. Configure your site URL: `https://your-domain.com` (or `http://localhost:5173` for development)
3. Enable email authentication
4. Optionally configure additional providers (Google, GitHub, etc.)

### 4. Configure Environment Variables

The project uses Supabase's built-in configuration. Make sure your `supabase/config.toml` file contains your project ID:

```toml
project_id = "your-project-id"
```

### 5. Set Up Email Notifications (Optional)

#### Get Resend API Key
1. Sign up at [Resend](https://resend.com/)
2. Verify your sending domain at [Resend Domains](https://resend.com/domains)
3. Create an API key at [Resend API Keys](https://resend.com/api-keys)
4. Copy your API key

#### Configure the Secret
1. In your Supabase dashboard, go to Settings > Edge Functions
2. Add a new secret named `RESEND_API_KEY`
3. Paste your Resend API key as the value

### 6. Start the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

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
