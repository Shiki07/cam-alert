#!/usr/bin/env python3
"""
Raspberry Pi Camera Stream Server
Optimized for Pi Zero 2 W with robust error handling and diagnostics
"""

import io
import time
import threading
import logging
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn

try:
    import cv2
    import numpy as np
    from picamera2 import Picamera2
    from libcamera import controls
except ImportError as e:
    print(f"❌ Missing required dependency: {e}")
    print("Install with: sudo apt install python3-picamera2 python3-opencv python3-numpy")
    sys.exit(1)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class StreamingHandler(BaseHTTPRequestHandler):
    """HTTP handler for streaming MJPEG video"""
    
    def __init__(self, *args, picam2=None, **kwargs):
        self.picam2 = picam2
        super().__init__(*args, **kwargs)

    def log_message(self, format, *args):
        """Override to reduce HTTP request logging noise"""
        return

    def do_GET(self):
        """Handle HTTP GET requests"""
        if self.path == '/':
            self.send_response(301)
            self.send_header('Location', '/stream.mjpg')
            self.end_headers()
            
        elif self.path == '/stream.mjpg':
            self._serve_mjpeg_stream()
            
        elif self.path == '/health':
            self._serve_health_check()
            
        else:
            self.send_error(404)
            self.end_headers()

    def _serve_mjpeg_stream(self):
        """Serve the MJPEG video stream"""
        self.send_response(200)
        self.send_header('Age', '0')
        self.send_header('Cache-Control', 'no-cache, private')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=FRAME')
        self.end_headers()
        
        try:
            frame_count = 0
            while True:
                # Capture frame from camera
                frame = self.picam2.capture_array()
                
                # Convert color space if needed (picamera2 usually gives RGB)
                if len(frame.shape) == 3 and frame.shape[2] == 3:
                    # Convert RGB to BGR for OpenCV
                    frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
                
                # Encode frame as JPEG with quality optimization
                encode_param = [cv2.IMWRITE_JPEG_QUALITY, 75]
                success, buffer = cv2.imencode('.jpg', frame, encode_param)
                
                if not success:
                    logger.warning("Failed to encode frame")
                    continue
                
                # Send frame
                self.wfile.write(b'--FRAME\r\n')
                self.send_header('Content-Type', 'image/jpeg')
                self.send_header('Content-Length', str(len(buffer)))
                self.end_headers()
                self.wfile.write(buffer.tobytes())
                self.wfile.write(b'\r\n')
                
                frame_count += 1
                if frame_count % 300 == 0:  # Log every ~10 seconds at 30fps
                    logger.debug(f"Streamed {frame_count} frames")
                
                # Control frame rate (~30 FPS)
                time.sleep(0.033)
                
        except Exception as e:
            logger.info(f'Client {self.client_address} disconnected: {str(e)}')

    def _serve_health_check(self):
        """Serve a simple health check endpoint"""
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        
        health_data = {
            "status": "ok",
            "camera": "connected" if self.picam2 else "disconnected",
            "timestamp": time.time()
        }
        
        import json
        self.wfile.write(json.dumps(health_data).encode())

class ThreadingServer(ThreadingMixIn, HTTPServer):
    """Multi-threaded HTTP server"""
    allow_reuse_address = True
    daemon_threads = True

def create_camera_handler(picam2):
    """Factory function to create handler with camera instance"""
    def handler(*args, **kwargs):
        return StreamingHandler(*args, picam2=picam2, **kwargs)
    return handler

def check_system_requirements():
    """Check if system meets requirements"""
    logger.info("🔍 Checking system requirements...")
    
    # Check if we're on a Raspberry Pi
    try:
        with open('/proc/device-tree/model', 'r') as f:
            model = f.read().strip()
            logger.info(f"📱 Device: {model}")
    except FileNotFoundError:
        logger.warning("⚠️  Not running on a Raspberry Pi")
    
    # Check camera support in firmware
    import subprocess
    try:
        result = subprocess.run(['vcgencmd', 'get_camera'], 
                              capture_output=True, text=True, timeout=5)
        logger.info(f"🎥 Camera firmware: {result.stdout.strip()}")
        
        if 'detected=0' in result.stdout:
            logger.warning("⚠️  No camera detected by firmware")
            return False
            
    except (subprocess.TimeoutExpired, FileNotFoundError):
        logger.warning("⚠️  Could not check camera firmware status")
    
    return True

def initialize_camera():
    """Initialize camera with comprehensive error handling"""
    try:
        logger.info("🚀 Initializing Raspberry Pi Camera...")
        
        # Check available cameras first
        cameras = Picamera2.global_camera_info()
        logger.info(f"📷 Found {len(cameras)} camera(s)")
        
        if len(cameras) == 0:
            raise RuntimeError(
                "No cameras detected. Troubleshooting steps:\n"
                "1. Check camera ribbon cable connection\n"
                "2. Enable camera: sudo raspi-config → Interface Options → Camera\n"
                "3. Add to /boot/firmware/config.txt:\n"
                "   dtparam=i2c_arm=on\n"
                "   camera_auto_detect=0\n"
                "   dtoverlay=ov5647,cam0\n"
                "4. Reboot the Pi\n"
                "5. Test with: rpicam-hello --timeout 5000"
            )
        
        # Log camera details
        for i, camera in enumerate(cameras):
            logger.info(f"📷 Camera {i}: {camera}")
        
        # Create Picamera2 instance for first camera
        picam2 = Picamera2(camera_num=0)
        
        # Configure for optimal streaming on Pi Zero 2 W
        config = picam2.create_video_configuration(
            main={"size": (640, 480), "format": "RGB888"},
            lores={"size": (320, 240), "format": "YUV420"},
            buffer_count=2  # Reduce memory usage
        )
        
        logger.info(f"⚙️  Camera config: {config}")
        picam2.configure(config)
        
        # Set camera controls for better image quality
        controls_dict = {
            "AwbEnable": True,
            "AeEnable": True,
            "FrameRate": 30.0,
            "Brightness": 0.0,
            "Contrast": 1.0
        }
        
        picam2.set_controls(controls_dict)
        logger.info(f"🎛️  Applied controls: {controls_dict}")
        
        # Start camera
        picam2.start()
        logger.info("✅ Camera started successfully")
        
        # Allow camera to stabilize
        time.sleep(2)
        
        # Test capture
        test_frame = picam2.capture_array()
        logger.info(f"📸 Test capture: {test_frame.shape} {test_frame.dtype}")
        
        return picam2
        
    except Exception as e:
        logger.error(f"❌ Camera initialization failed: {str(e)}")
        logger.error("💡 Common solutions:")
        logger.error("   - Check physical camera connection")
        logger.error("   - Run: sudo raspi-config → Interface Options → Camera → Enable")
        logger.error("   - Verify /boot/firmware/config.txt camera settings")
        logger.error("   - Reboot after configuration changes")
        logger.error("   - Test with: rpicam-hello --timeout 5000")
        raise

def create_systemd_service():
    """Generate systemd service file content"""
    service_content = """[Unit]
Description=Raspberry Pi Camera Stream Service
After=network.target
Wants=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/pi-service
ExecStart=/usr/bin/python3 /home/pi/pi-service/libcamera_stream.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
"""
    
    logger.info("📝 Systemd service file content:")
    logger.info("Save to: /etc/systemd/system/camera-stream.service")
    logger.info("Enable with: sudo systemctl enable camera-stream.service")
    logger.info("Start with: sudo systemctl start camera-stream.service")
    print("\n" + "="*50)
    print(service_content)
    print("="*50)

def main():
    """Main function to start the camera stream server"""
    logger.info("🎬 Starting Raspberry Pi Camera Stream Server")
    
    # Check system requirements
    if not check_system_requirements():
        logger.warning("⚠️  System requirements check failed, continuing anyway...")
    
    try:
        # Initialize camera
        picam2 = initialize_camera()
        
        # Create and start HTTP server
        server_address = ('0.0.0.0', 8000)  # Listen on all interfaces
        handler_class = create_camera_handler(picam2)
        httpd = ThreadingServer(server_address, handler_class)
        
        logger.info("🌐 Camera stream server started")
        logger.info(f"📺 Stream URL: http://YOUR_PI_IP:8000/stream.mjpg")
        logger.info(f"❤️  Health check: http://YOUR_PI_IP:8000/health")
        logger.info("🛑 Press Ctrl+C to stop")
        
        # Option to create systemd service
        import os
        if os.geteuid() != 0:  # Not running as root
            logger.info("💡 Run with --service flag to see systemd service setup")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            logger.info("🛑 Stopping camera stream server...")
        finally:
            logger.info("🧹 Cleaning up...")
            picam2.stop()
            httpd.shutdown()
            logger.info("✅ Camera stream server stopped cleanly")
            
    except Exception as e:
        logger.error(f"❌ Failed to start camera stream: {str(e)}")
        return 1
    
    return 0

if __name__ == '__main__':
    # Handle command line arguments
    if len(sys.argv) > 1 and sys.argv[1] == '--service':
        create_systemd_service()
        sys.exit(0)
    
    sys.exit(main())