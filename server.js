const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================================================
// 🎛️ VOLUME SETTINGS - Easy to modify!
// =============================================================================
const VOLUME_CONFIG = {
  startVolume: 0.10,        // Start at 10% volume
  volumePerTTS: 0.02,       // Each TTS use adds 2% volume  
  maxVolume: 0.90,          // Maximum 90% volume
};
// =============================================================================

// In-memory storage (resets on server restart/new stream)
const streamData = {
  users: new Map(),
  settings: VOLUME_CONFIG
};

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to calculate volume based on TTS usage
function calculateVolume(ttsCount) {
  const { startVolume, volumePerTTS, maxVolume } = streamData.settings;
  const calculatedVolume = startVolume + (ttsCount * volumePerTTS);
  return Math.min(calculatedVolume, maxVolume);
}

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    uptime: process.uptime(),
    totalUsers: streamData.users.size 
  });
});

// Get user volume (main endpoint for TTS)
app.get('/api/user/:username/volume', (req, res) => {
  const username = req.params.username.toLowerCase();
  const user = streamData.users.get(username) || { messageCount: 0, ttsCount: 0 };
  const volume = calculateVolume(user.messageCount);
  const messagesUntilMax = Math.max(0, Math.ceil((streamData.settings.maxVolume - volume) / streamData.settings.volumePerMessage));
  
  res.json({
    username,
    volume,
    messageCount: user.messageCount,
    messagesUntilMax,
    atMaxVolume: volume >= streamData.settings.maxVolume
  });
});

// Track message (increment user message count)
app.post('/api/user/:username/message', (req, res) => {
  const username = req.params.username.toLowerCase();
  
  // Get or create user
  let user = streamData.users.get(username) || { messageCount: 0, ttsCount: 0 };
  user.messageCount += 1;
  streamData.users.set(username, user);
  
  const volume = calculateVolume(user.messageCount);
  const messagesUntilMax = Math.max(0, Math.ceil((streamData.settings.maxVolume - volume) / streamData.settings.volumePerMessage));
  
  res.json({
    username,
    messageCount: user.messageCount,
    volume,
    messagesUntilMax,
    atMaxVolume: volume >= streamData.settings.maxVolume
  });
});

// Record TTS usage and return volume
app.post('/api/user/:username/tts', (req, res) => {
  const username = req.params.username.toLowerCase();
  const { message } = req.body;
  
  let user = streamData.users.get(username) || { messageCount: 0, ttsCount: 0 };
  user.ttsCount += 1;
  user.lastTTSMessage = message || '';
  user.lastTTSTime = new Date().toISOString();
  streamData.users.set(username, user);
  
  const volume = calculateVolume(user.messageCount);
  
  res.json({
    username,
    volume,
    volumePercent: Math.round(volume * 100),
    ttsCount: user.ttsCount,
    messageCount: user.messageCount,
    message: message || '',
    success: true
  });
});

// Get TTS volume only (for channel point redemptions)
app.get('/api/tts/:username', (req, res) => {
  const username = req.params.username.toLowerCase();
  const user = streamData.users.get(username) || { messageCount: 0, ttsCount: 0 };
  const volume = calculateVolume(user.messageCount);
  
  // Also record this as a TTS usage
  user.ttsCount += 1;
  streamData.users.set(username, user);
  
  res.json({
    username,
    volume,
    volumePercent: Math.round(volume * 100),
    messageCount: user.messageCount,
    ttsCount: user.ttsCount
  });
});

// Get leaderboard (top chatters)
app.get('/api/leaderboard', (req, res) => {
  const users = Array.from(streamData.users.entries())
    .map(([username, data]) => ({
      username,
      messageCount: data.messageCount,
      volume: calculateVolume(data.messageCount),
      ttsCount: data.ttsCount
    }))
    .sort((a, b) => b.messageCount - a.messageCount)
    .slice(0, 10);
  
  res.json({ users });
});

// Get/Update settings
app.get('/api/settings', (req, res) => {
  res.json(streamData.settings);
});

app.put('/api/settings', (req, res) => {
  const { startVolume, volumePerTTS, maxVolume } = req.body;
  
  if (startVolume !== undefined) streamData.settings.startVolume = Math.max(0, Math.min(1, startVolume));
  if (maxVolume !== undefined) streamData.settings.maxVolume = Math.max(0, Math.min(1, maxVolume));
  if (volumePerTTS !== undefined) streamData.settings.volumePerTTS = Math.max(0, volumePerTTS);
  
  res.json({ message: 'Settings updated', settings: streamData.settings });
});

// Reset stream data (for new stream)
app.post('/api/reset', (req, res) => {
  streamData.users.clear();
  res.json({ message: 'Stream data reset', totalUsers: 0 });
});

// Get stream stats
app.get('/api/stats', (req, res) => {
  const users = Array.from(streamData.users.values());
  const totalMessages = users.reduce((sum, user) => sum + user.messageCount, 0);
  const totalTTS = users.reduce((sum, user) => sum + user.ttsCount, 0);
  
  res.json({
    totalUsers: streamData.users.size,
    totalMessages,
    totalTTS,
    uptime: Math.floor(process.uptime())
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 StreamElements Session API running on port ${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log(`🎯 Ready for StreamElements integration!`);
});

module.exports = app;
