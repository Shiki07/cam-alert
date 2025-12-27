const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3002;

// Security configuration
const API_KEY = process.env.PI_SERVICE_API_KEY || null;
const MAX_CONCURRENT_RECORDINGS = 3;
const ALLOWED_VIDEO_DIRS = ['/home/pi/Videos', '/tmp/recordings'];
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30;

// Rate limiting state (per-IP)
const rateLimitMap = new Map();

// Recording state management
const activeRecordings = new Map(); // Map<recordingId, { process, filename, startTime }>

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting middleware
const rateLimiter = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  
  const clientData = rateLimitMap.get(clientIP) || { count: 0, windowStart: now };
  
  // Reset window if expired
  if (now - clientData.windowStart > RATE_LIMIT_WINDOW_MS) {
    clientData.count = 0;
    clientData.windowStart = now;
  }
  
  clientData.count++;
  rateLimitMap.set(clientIP, clientData);
  
  if (clientData.count > RATE_LIMIT_MAX_REQUESTS) {
    console.warn(`Rate limit exceeded for IP: ${clientIP}`);
    return res.status(429).json({ 
      error: 'Too many requests', 
      retry_after_seconds: Math.ceil((clientData.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000)
    });
  }
  
  next();
};

// Optional API key authentication middleware
const optionalApiKeyAuth = (req, res, next) => {
  // If no API key is configured, skip authentication
  if (!API_KEY) {
    return next();
  }
  
  const providedKey = req.headers['x-pi-api-key'] || req.query.api_key;
  
  if (!providedKey) {
    console.warn(`Unauthorized request attempt from ${req.ip} - no API key provided`);
    return res.status(401).json({ 
      error: 'API key required',
      message: 'Set X-PI-API-KEY header or api_key query parameter'
    });
  }
  
  // Constant-time comparison to prevent timing attacks
  if (!constantTimeCompare(providedKey, API_KEY)) {
    console.warn(`Invalid API key from ${req.ip}`);
    return res.status(403).json({ error: 'Invalid API key' });
  }
  
  next();
};

// Constant-time string comparison (timing-attack safe)
function constantTimeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Input validation utilities
const validateRecordingId = (id) => {
  if (!id || typeof id !== 'string') return false;
  // Allow alphanumeric, hyphens, and underscores only
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id);
};

const validateStreamUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    // Only allow http/https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    // Block localhost/internal IPs to prevent SSRF (except our own local stream)
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // Only allow our own stream endpoint
      return parsed.port === '8000' && parsed.pathname.includes('stream');
    }
    // Block internal IP ranges
    if (hostname.startsWith('10.') || 
        hostname.startsWith('172.') || 
        hostname.startsWith('192.168.') ||
        hostname === '0.0.0.0') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

const validateVideoPath = (videoPath) => {
  if (!videoPath) return '/home/pi/Videos'; // Default safe path
  
  // Normalize and resolve the path
  const normalizedPath = path.normalize(videoPath);
  const resolvedPath = path.resolve(normalizedPath);
  
  // Check for path traversal attempts
  if (normalizedPath.includes('..')) {
    console.warn(`Path traversal attempt blocked: ${videoPath}`);
    return null;
  }
  
  // Check if path is in allowed directories
  const isAllowed = ALLOWED_VIDEO_DIRS.some(allowedDir => 
    resolvedPath === allowedDir || resolvedPath.startsWith(allowedDir + path.sep)
  );
  
  if (!isAllowed) {
    console.warn(`Disallowed video path: ${videoPath}`);
    return null;
  }
  
  return resolvedPath;
};

const validateQuality = (quality) => {
  const allowed = ['low', 'medium', 'high'];
  return allowed.includes(quality) ? quality : 'medium';
};

const validateContentType = (mimetype, filename) => {
  const allowedTypes = [
    'video/webm',
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'application/octet-stream' // Some browsers send this
  ];
  
  const allowedExtensions = ['.webm', '.mp4', '.mpeg', '.mov'];
  const ext = path.extname(filename).toLowerCase();
  
  return allowedTypes.includes(mimetype) && allowedExtensions.includes(ext);
};

// Apply rate limiting and optional auth to all routes
app.use(rateLimiter);

// Configure storage for uploaded files
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    // Create Videos directory if it doesn't exist
    const videosDir = '/home/pi/Videos'; // SD card mount point
    await fs.ensureDir(videosDir);
    cb(null, videosDir);
  },
  filename: (req, file, cb) => {
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const motionPrefix = req.body.motion_detected === 'true' ? 'motion_' : 'manual_';
    // Sanitize original filename
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 50);
    const filename = `${motionPrefix}${timestamp}_${sanitizedName}`;
    cb(null, filename);
  }
});

// File filter for upload validation
const fileFilter = (req, file, cb) => {
  if (!validateContentType(file.mimetype, file.originalname)) {
    console.warn(`Rejected file upload: invalid type ${file.mimetype} for ${file.originalname}`);
    return cb(new Error('Invalid file type. Only video files allowed.'), false);
  }
  cb(null, true);
};

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: fileFilter
});

// Health check endpoint (no auth required for monitoring)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'running',
    timestamp: new Date().toISOString(),
    videosPath: '/home/pi/Videos',
    auth_required: !!API_KEY,
    active_recordings: activeRecordings.size,
    max_concurrent_recordings: MAX_CONCURRENT_RECORDINGS
  });
});

// File upload endpoint (requires auth if configured)
app.post('/upload', optionalApiKeyAuth, upload.single('file'), async (req, res) => {
  try {
    console.log('Received file upload request');

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { recording_id, recorded_at, motion_detected } = req.body;
    
    // Validate recording_id if provided
    if (recording_id && !validateRecordingId(recording_id)) {
      return res.status(400).json({ error: 'Invalid recording_id format' });
    }

    // Log the upload (without sensitive details)
    const logEntry = {
      timestamp: new Date().toISOString(),
      recording_id: recording_id || 'unknown',
      filename: req.file.filename,
      size: req.file.size,
      recorded_at,
      motion_detected: motion_detected === 'true'
    };

    // Save upload log
    const logPath = '/home/pi/Videos/upload_log.json';
    let logs = [];
    
    try {
      if (await fs.pathExists(logPath)) {
        logs = await fs.readJson(logPath);
        // Keep only last 1000 entries to prevent log file from growing too large
        if (logs.length > 1000) {
          logs = logs.slice(-1000);
        }
      }
    } catch (error) {
      console.warn('Could not read existing log file, creating new one');
    }

    logs.push(logEntry);
    await fs.writeJson(logPath, logs, { spaces: 2 });

    console.log(`File saved successfully: ${req.file.filename}`);

    res.json({
      success: true,
      message: 'File uploaded successfully',
      filename: req.file.filename,
      size: req.file.size
    });

  } catch (error) {
    console.error('Upload error:', error.message);
    res.status(500).json({ 
      error: 'Upload failed',
      details: 'Internal server error' 
    });
  }
});

// Get recordings list (requires auth if configured)
app.get('/recordings', optionalApiKeyAuth, async (req, res) => {
  try {
    const videosDir = '/home/pi/Videos';
    const files = await fs.readdir(videosDir);
    
    const recordings = files
      .filter(file => file.endsWith('.webm') || file.endsWith('.mp4'))
      .map(file => ({
        filename: file,
        isMotionTriggered: file.startsWith('motion_')
      }));

    res.json({ recordings });
  } catch (error) {
    console.error('Error listing recordings:', error.message);
    res.status(500).json({ error: 'Failed to list recordings' });
  }
});

// Start recording endpoint (requires auth if configured)
app.post('/recording/start', optionalApiKeyAuth, async (req, res) => {
  try {
    const { recording_id, stream_url, quality = 'medium', motion_triggered = false, video_path } = req.body;

    // Validate recording_id
    if (!recording_id || !validateRecordingId(recording_id)) {
      return res.status(400).json({ error: 'Invalid or missing recording_id. Must be alphanumeric with hyphens/underscores, max 64 chars.' });
    }

    // Validate stream_url (but we actually use local stream for safety)
    if (!stream_url) {
      return res.status(400).json({ error: 'stream_url is required' });
    }

    // Check concurrent recording limit
    if (activeRecordings.size >= MAX_CONCURRENT_RECORDINGS) {
      console.warn(`Concurrent recording limit reached: ${activeRecordings.size}/${MAX_CONCURRENT_RECORDINGS}`);
      return res.status(429).json({ 
        error: 'Maximum concurrent recordings reached',
        max: MAX_CONCURRENT_RECORDINGS,
        current: activeRecordings.size
      });
    }

    // Check if already recording this ID
    if (activeRecordings.has(recording_id)) {
      return res.status(400).json({ error: 'Recording already in progress with this ID' });
    }

    // Validate and sanitize video path
    const validatedVideoPath = validateVideoPath(video_path);
    if (validatedVideoPath === null) {
      return res.status(400).json({ error: 'Invalid video_path. Path traversal or disallowed directory.' });
    }
    
    await fs.ensureDir(validatedVideoPath);

    // Validate quality
    const validatedQuality = validateQuality(quality);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const prefix = motion_triggered ? 'motion_' : 'manual_';
    const filename = `${prefix}pi_${timestamp}.mp4`;
    const filepath = path.join(validatedVideoPath, filename);

    console.log(`Starting recording: ${recording_id}`);
    console.log(`Output file: ${filepath}`);
    console.log(`Quality: ${validatedQuality}`);

    // FFmpeg parameters based on quality
    const qualityPresets = {
      high: { fps: 25, bitrate: '2000k', scale: '1920:1080' },
      medium: { fps: 20, bitrate: '1000k', scale: '1280:720' },
      low: { fps: 15, bitrate: '500k', scale: '640:480' }
    };

    const preset = qualityPresets[validatedQuality];

    // Use local stream URL to prevent SSRF - always connect to localhost:8000
    const localStreamUrl = 'http://localhost:8000/stream.mjpg';
    console.log(`Using local stream for recording: ${localStreamUrl}`);
    
    // FFmpeg command to capture from MJPEG stream
    const ffmpegArgs = [
      '-f', 'mjpeg',
      '-r', preset.fps.toString(),
      '-i', localStreamUrl,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-b:v', preset.bitrate,
      '-vf', `scale=${preset.scale}`,
      '-f', 'mp4',
      '-movflags', 'frag_keyframe+empty_moov',
      '-t', '300', // Max 5 minute recording to prevent runaway processes
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
      quality: validatedQuality,
      motion_triggered
    });

    // Send response immediately (async FFmpeg startup)
    res.json({
      success: true,
      message: 'Recording started',
      recording_id,
      filename,
      started_at: new Date().toISOString()
    });

    // Handle FFmpeg output (async after response sent)
    ffmpeg.stderr.on('data', (data) => {
      // FFmpeg outputs progress to stderr - only log errors, not progress
      const output = data.toString();
      if (output.includes('error') || output.includes('Error')) {
        console.error(`FFmpeg error: ${output}`);
      }
    });

    ffmpeg.on('error', (error) => {
      console.error(`FFmpeg spawn error for ${recording_id}:`, error.message);
      activeRecordings.delete(recording_id);
    });

    ffmpeg.on('close', (code) => {
      console.log(`FFmpeg process exited with code ${code} for ${recording_id}`);
      activeRecordings.delete(recording_id);
    });

  } catch (error) {
    console.error('Start recording error:', error.message);
    res.status(500).json({ 
      error: 'Failed to start recording',
      details: 'Internal server error' 
    });
  }
});

// Stop recording endpoint (requires auth if configured)
app.post('/recording/stop', optionalApiKeyAuth, async (req, res) => {
  try {
    const { recording_id } = req.body;

    if (!recording_id || !validateRecordingId(recording_id)) {
      return res.status(400).json({ error: 'Invalid or missing recording_id' });
    }

    const recording = activeRecordings.get(recording_id);

    if (!recording) {
      return res.status(404).json({ error: 'Recording not found or already stopped' });
    }

    console.log(`Stopping recording: ${recording_id}`);

    // Step 1: Send SIGINT for graceful FFmpeg shutdown
    console.log('Sending SIGINT to FFmpeg process...');
    recording.process.kill('SIGINT');
    
    // Step 2: Wait for FFmpeg to exit gracefully (max 2 seconds)
    const exitPromise = new Promise((resolve) => {
      recording.process.on('exit', () => {
        console.log('FFmpeg exited gracefully');
        resolve(true);
      });
      setTimeout(() => {
        console.log('FFmpeg graceful exit timeout, forcing stop');
        resolve(false);
      }, 2000);
    });
    
    const exitedGracefully = await exitPromise;
    
    // Step 3: If still running, force kill with SIGKILL
    if (!exitedGracefully && !recording.process.killed) {
      console.log('Forcing SIGKILL immediately');
      recording.process.kill('SIGKILL');
    }

    // Step 4: Brief wait for file system to flush
    await new Promise(resolve => setTimeout(resolve, 200));

    // Check if file exists and get stats
    let fileSize = 0;
    let duration = 0;
    try {
      const stats = await fs.stat(recording.filepath);
      fileSize = stats.size;
      duration = Math.round((Date.now() - recording.startTime) / 1000);
      console.log(`Recording file stats: ${fileSize} bytes, ${duration} seconds`);
    } catch (error) {
      console.warn('Could not get file stats');
    }

    activeRecordings.delete(recording_id);

    res.json({
      success: true,
      message: 'Recording stopped',
      recording_id,
      filename: recording.filename,
      file_size: fileSize,
      duration_seconds: duration,
      stopped_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Stop recording error:', error.message);
    res.status(500).json({ 
      error: 'Failed to stop recording',
      details: 'Internal server error' 
    });
  }
});

// Get recording status endpoint (requires auth if configured)
app.get('/recording/status/:recording_id', optionalApiKeyAuth, (req, res) => {
  const { recording_id } = req.params;
  
  if (!validateRecordingId(recording_id)) {
    return res.status(400).json({ error: 'Invalid recording_id format' });
  }
  
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

// List active recordings (requires auth if configured)
app.get('/recording/active', optionalApiKeyAuth, (req, res) => {
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

// Error handler middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Cleanup stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of rateLimitMap.entries()) {
    if (now - data.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎥 CamAlert Pi Service running on port ${PORT}`);
  console.log(`📁 Videos will be saved to: /home/pi/Videos`);
  console.log(`🌐 Access at: http://YOUR_PI_IP:${PORT}`);
  console.log(`🔐 API key auth: ${API_KEY ? 'ENABLED (set PI_SERVICE_API_KEY)' : 'DISABLED (optional)'}`);
  console.log(`⚡ Rate limit: ${RATE_LIMIT_MAX_REQUESTS} requests per minute`);
  console.log(`📹 Max concurrent recordings: ${MAX_CONCURRENT_RECORDINGS}`);
  console.log('\n📋 Available endpoints:');
  console.log(`   GET  /health - Health check (no auth)`);
  console.log(`   POST /upload - Upload recordings`);
  console.log(`   GET  /recordings - List saved recordings`);
  console.log(`   POST /recording/start - Start Pi recording`);
  console.log(`   POST /recording/stop - Stop Pi recording`);
  console.log(`   GET  /recording/status/:id - Get recording status`);
  console.log(`   GET  /recording/active - List active recordings`);
  console.log('\n⚙️  Requirements:');
  console.log(`   - FFmpeg must be installed: sudo apt install ffmpeg`);
  console.log('\n🔒 Security features:');
  console.log(`   - Optional API key authentication (set PI_SERVICE_API_KEY env var)`);
  console.log(`   - Rate limiting (${RATE_LIMIT_MAX_REQUESTS}/min per IP)`);
  console.log(`   - Input validation for all parameters`);
  console.log(`   - Path traversal protection`);
  console.log(`   - SSRF protection (local stream only)`);
  console.log(`   - Concurrent recording limits`);
  console.log(`   - File type validation on uploads`);
});
