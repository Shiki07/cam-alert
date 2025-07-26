const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configure storage for uploaded files
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    // Create Videos directory if it doesn't exist
    const videosDir = '/media/pi/SD_CARD/Videos'; // Adjust path to your SD card mount point
    await fs.ensureDir(videosDir);
    cb(null, videosDir);
  },
  filename: (req, file, cb) => {
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const motionPrefix = req.body.motion_detected === 'true' ? 'motion_' : 'manual_';
    const filename = `${motionPrefix}${timestamp}_${file.originalname}`;
    cb(null, filename);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'running',
    timestamp: new Date().toISOString(),
    videosPath: '/media/pi/SD_CARD/Videos'
  });
});

// File upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    console.log('Received file upload request');
    console.log('File:', req.file);
    console.log('Body:', req.body);

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { recording_id, recorded_at, motion_detected } = req.body;

    // Log the upload
    const logEntry = {
      timestamp: new Date().toISOString(),
      recording_id,
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      recorded_at,
      motion_detected: motion_detected === 'true',
      saved_path: req.file.path
    };

    // Save upload log
    const logPath = '/media/pi/SD_CARD/Videos/upload_log.json';
    let logs = [];
    
    try {
      if (await fs.pathExists(logPath)) {
        logs = await fs.readJson(logPath);
      }
    } catch (error) {
      console.warn('Could not read existing log file, creating new one');
    }

    logs.push(logEntry);
    await fs.writeJson(logPath, logs, { spaces: 2 });

    console.log(`File saved successfully: ${req.file.path}`);

    res.json({
      success: true,
      message: 'File uploaded successfully',
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Upload failed',
      details: error.message 
    });
  }
});

// Get recordings list
app.get('/recordings', async (req, res) => {
  try {
    const videosDir = '/media/pi/SD_CARD/Videos';
    const files = await fs.readdir(videosDir);
    
    const recordings = files
      .filter(file => file.endsWith('.webm') || file.endsWith('.mp4'))
      .map(file => ({
        filename: file,
        path: path.join(videosDir, file),
        isMotionTriggered: file.startsWith('motion_')
      }));

    res.json({ recordings });
  } catch (error) {
    console.error('Error listing recordings:', error);
    res.status(500).json({ error: 'Failed to list recordings' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎥 CamAlert Pi Service running on port ${PORT}`);
  console.log(`📁 Videos will be saved to: /media/pi/SD_CARD/Videos`);
  console.log(`🌐 Access at: http://YOUR_PI_IP:${PORT}`);
  console.log('\n📋 Available endpoints:');
  console.log(`   GET  /health - Health check`);
  console.log(`   POST /upload - Upload recordings`);
  console.log(`   GET  /recordings - List saved recordings`);
});