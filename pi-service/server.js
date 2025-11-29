const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3002;

// Recording state management
const activeRecordings = new Map(); // Map<recordingId, { process, filename, startTime }>

// Middleware
app.use(cors());
app.use(express.json());

// Configure storage for uploaded files
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    // Create Videos directory if it doesn't exist
    const videosDir = '/home/ale/Videos'; // SD card mount point
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
    videosPath: '/home/ale/Videos'
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
    const logPath = '/home/ale/Videos/upload_log.json';
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
    const videosDir = '/home/ale/Videos';
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

// Start recording endpoint
app.post('/recording/start', async (req, res) => {
  try {
    const { recording_id, stream_url, quality = 'medium', motion_triggered = false } = req.body;

    if (!recording_id || !stream_url) {
      return res.status(400).json({ error: 'recording_id and stream_url are required' });
    }

    // Check if already recording
    if (activeRecordings.has(recording_id)) {
      return res.status(400).json({ error: 'Recording already in progress' });
    }

    const videosDir = '/home/ale/Videos';
    await fs.ensureDir(videosDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const prefix = motion_triggered ? 'motion_' : 'manual_';
    const filename = `${prefix}pi_${timestamp}.mp4`;
    const filepath = path.join(videosDir, filename);

    console.log(`Starting recording: ${recording_id}`);
    console.log(`Stream URL: ${stream_url}`);
    console.log(`Output file: ${filepath}`);
    console.log(`Quality: ${quality}`);

    // FFmpeg parameters based on quality
    const qualityPresets = {
      high: { fps: 25, bitrate: '2000k', scale: '1920:1080' },
      medium: { fps: 20, bitrate: '1000k', scale: '1280:720' },
      low: { fps: 15, bitrate: '500k', scale: '640:480' }
    };

    const preset = qualityPresets[quality] || qualityPresets.medium;

    // FFmpeg command to capture from MJPEG stream
    const ffmpegArgs = [
      '-f', 'mjpeg',
      '-r', preset.fps.toString(),
      '-i', stream_url,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-b:v', preset.bitrate,
      '-vf', `scale=${preset.scale}`,
      '-f', 'mp4',
      '-movflags', 'frag_keyframe+empty_moov',
      '-y',
      filepath
    ];

    console.log('FFmpeg command:', 'ffmpeg', ffmpegArgs.join(' '));

    const ffmpeg = spawn('ffmpeg', ffmpegArgs);

    // Store recording info
    activeRecordings.set(recording_id, {
      process: ffmpeg,
      filename,
      filepath,
      startTime: Date.now(),
      quality,
      motion_triggered
    });

    // Handle FFmpeg output
    ffmpeg.stdout.on('data', (data) => {
      console.log(`FFmpeg stdout: ${data}`);
    });

    ffmpeg.stderr.on('data', (data) => {
      // FFmpeg outputs progress to stderr
      console.log(`FFmpeg: ${data}`);
    });

    ffmpeg.on('error', (error) => {
      console.error(`FFmpeg error for ${recording_id}:`, error);
      activeRecordings.delete(recording_id);
    });

    ffmpeg.on('close', (code) => {
      console.log(`FFmpeg process exited with code ${code} for ${recording_id}`);
      if (code !== 0 && code !== null) {
        console.error(`Recording ${recording_id} ended with error code ${code}`);
      }
      activeRecordings.delete(recording_id);
    });

    res.json({
      success: true,
      message: 'Recording started',
      recording_id,
      filename,
      started_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Start recording error:', error);
    res.status(500).json({ 
      error: 'Failed to start recording',
      details: error.message 
    });
  }
});

// Stop recording endpoint
app.post('/recording/stop', async (req, res) => {
  try {
    const { recording_id } = req.body;

    if (!recording_id) {
      return res.status(400).json({ error: 'recording_id is required' });
    }

    const recording = activeRecordings.get(recording_id);

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found or already stopped' });
    }

    console.log(`Stopping recording: ${recording_id}`);

    // Gracefully stop FFmpeg by sending 'q' command
    recording.process.stdin.write('q');
    recording.process.stdin.end();

    // Wait a bit for FFmpeg to finish writing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if file exists and get stats
    let fileSize = 0;
    let duration = 0;
    try {
      const stats = await fs.stat(recording.filepath);
      fileSize = stats.size;
      duration = Math.round((Date.now() - recording.startTime) / 1000);
    } catch (error) {
      console.warn('Could not get file stats:', error);
    }

    activeRecordings.delete(recording_id);

    res.json({
      success: true,
      message: 'Recording stopped',
      recording_id,
      filename: recording.filename,
      filepath: recording.filepath,
      file_size: fileSize,
      duration_seconds: duration,
      stopped_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Stop recording error:', error);
    res.status(500).json({ 
      error: 'Failed to stop recording',
      details: error.message 
    });
  }
});

// Get recording status endpoint
app.get('/recording/status/:recording_id', (req, res) => {
  const { recording_id } = req.params;
  const recording = activeRecordings.get(recording_id);

  if (!recording) {
    return res.json({
      recording_id,
      is_recording: false,
      message: 'No active recording found'
    });
  }

  const duration = Math.round((Date.now() - recording.startTime) / 1000);

  res.json({
    recording_id,
    is_recording: true,
    filename: recording.filename,
    duration_seconds: duration,
    quality: recording.quality,
    motion_triggered: recording.motion_triggered,
    started_at: new Date(recording.startTime).toISOString()
  });
});

// List active recordings
app.get('/recording/active', (req, res) => {
  const active = Array.from(activeRecordings.entries()).map(([id, rec]) => ({
    recording_id: id,
    filename: rec.filename,
    duration_seconds: Math.round((Date.now() - rec.startTime) / 1000),
    quality: rec.quality,
    motion_triggered: rec.motion_triggered,
    started_at: new Date(rec.startTime).toISOString()
  }));

  res.json({ active_recordings: active, count: active.length });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎥 CamAlert Pi Service running on port ${PORT}`);
  console.log(`📁 Videos will be saved to: /home/ale/Videos`);
  console.log(`🌐 Access at: http://YOUR_PI_IP:${PORT}`);
  console.log('\n📋 Available endpoints:');
  console.log(`   GET  /health - Health check`);
  console.log(`   POST /upload - Upload recordings`);
  console.log(`   GET  /recordings - List saved recordings`);
  console.log(`   POST /recording/start - Start Pi recording`);
  console.log(`   POST /recording/stop - Stop Pi recording`);
  console.log(`   GET  /recording/status/:id - Get recording status`);
  console.log(`   GET  /recording/active - List active recordings`);
  console.log('\n⚙️  Requirements:');
  console.log(`   - FFmpeg must be installed: sudo apt install ffmpeg`);
});