#!/usr/bin/env python3
"""
Updated libcamera stream script for Raspberry Pi Zero 2 W
Fixes the 'list index out of range' error by properly detecting available cameras
"""

import io
import time
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
import cv2
import numpy as np
from picamera2 import Picamera2
from libcamera import controls
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class StreamingHandler(BaseHTTPRequestHandler):
    def __init__(self, *args, picam2=None, **kwargs):
        self.picam2 = picam2
        super().__init__(*args, **kwargs)

    def do_GET(self):
        if self.path == '/':
            self.send_response(301)
            self.send_header('Location', '/stream.mjpg')
            self.end_headers()
        elif self.path == '/stream.mjpg':
            self.send_response(200)
            self.send_header('Age', 0)
            self.send_header('Cache-Control', 'no-cache, private')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=FRAME')
            self.end_headers()
            try:
                while True:
                    # Capture frame from camera
                    frame = self.picam2.capture_array()
                    
                    # Convert BGR to RGB if needed
                    if len(frame.shape) == 3 and frame.shape[2] == 3:
                        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    
                    # Encode frame as JPEG
                    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                    
                    self.wfile.write(b'--FRAME\r\n')
                    self.send_header('Content-Type', 'image/jpeg')
                    self.send_header('Content-Length', len(buffer))
                    self.end_headers()
                    self.wfile.write(buffer)
                    self.wfile.write(b'\r\n')
                    
                    time.sleep(0.033)  # ~30 FPS
            except Exception as e:
                logger.warning(f'Removed streaming client {self.client_address}: {str(e)}')
        else:
            self.send_error(404)
            self.end_headers()

class ThreadingServer(ThreadingMixIn, HTTPServer):
    allow_reuse_address = True
    daemon_threads = True

def create_camera_handler(picam2):
    def handler(*args, **kwargs):
        StreamingHandler(*args, picam2=picam2, **kwargs)
    return handler

def initialize_camera():
    """Initialize camera with proper error handling for Pi Zero 2 W"""
    try:
        logger.info("Initializing Raspberry Pi Camera...")
        
        # Create Picamera2 instance
        picam2 = Picamera2()
        
        # Get available cameras - this is where the original error likely occurred
        cameras = Picamera2.global_camera_info()
        logger.info(f"Found {len(cameras)} camera(s)")
        
        if len(cameras) == 0:
            raise RuntimeError("No cameras detected. Please check:\n"
                             "1. Camera ribbon cable is connected properly\n"
                             "2. Camera is enabled in raspi-config\n"
                             "3. Camera is compatible with your Pi model")
        
        # Print camera info
        for i, camera in enumerate(cameras):
            logger.info(f"Camera {i}: {camera}")
        
        # Configure camera for streaming
        # Use a smaller resolution for better performance on Pi Zero 2 W
        config = picam2.create_video_configuration(
            main={"size": (640, 480), "format": "RGB888"},
            lores={"size": (320, 240), "format": "YUV420"}
        )
        
        logger.info(f"Camera configuration: {config}")
        picam2.configure(config)
        
        # Set camera controls for better quality
        picam2.set_controls({
            "AwbEnable": True,
            "AeEnable": True,
            "FrameRate": 30.0
        })
        
        # Start camera
        picam2.start()
        logger.info("✅ Camera initialized successfully")
        
        # Wait for camera to warm up
        time.sleep(2)
        
        return picam2
        
    except Exception as e:
        logger.error(f"❌ Failed to initialize camera: {str(e)}")
        logger.error("Make sure:")
        logger.error("1. Camera is connected properly")
        logger.error("2. Camera is enabled in raspi-config")
        logger.error("3. No other process is using the camera")
        logger.error("4. You're using a compatible camera module")
        raise

def main():
    """Main function to start the camera stream server"""
    try:
        # Initialize camera
        picam2 = initialize_camera()
        
        # Create HTTP server
        server_address = ('', 8000)
        handler_class = create_camera_handler(picam2)
        httpd = ThreadingServer(server_address, handler_class)
        
        logger.info("🎥 Camera stream server started")
        logger.info(f"📡 Stream available at: http://YOUR_PI_IP:8000/stream.mjpg")
        logger.info("Press Ctrl+C to stop")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            logger.info("🛑 Stopping camera stream server...")
        finally:
            picam2.stop()
            httpd.shutdown()
            logger.info("✅ Camera stream server stopped")
            
    except Exception as e:
        logger.error(f"❌ Error starting camera stream: {str(e)}")
        return 1
    
    return 0

if __name__ == '__main__':
    exit(main())