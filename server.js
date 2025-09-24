const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory storage (resets on server restart/new stream)
const streamData = {
  users: new Map(),
  settings: {
    baseVolume: 0.5,
    maxVolume: 1.0,
    minVolume: 0.1,
    volumeIncrement: 0.05,
    messagesPerIncrement: 10
  }
};

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to calculate volume based on message count
function calculateVolume(messageCount) {
  const { baseVolume, maxVolume, minVolume, volumeIncrement, messagesPerIncrement } = streamData.settings;
  const increments = Math.floor(messageCount / messagesPerIncrement);
  const calculatedVolume = baseVolume + (increments * volumeIncrement);
  return Math.min(Math.max(calculatedVolume, minVolume), maxVolume);
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
  
  res.json({
    username,
    volume,
    messageCount: user.messageCount,
    messagesUntilNext: streamData.settings.messagesPerIncrement - (user.messageCount % streamData.settings.messagesPerIncrement)
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
  const messagesUntilNext = streamData.settings.messagesPerIncrement - (user.messageCount % streamData.settings.messagesPerIncrement);
  
  res.json({
    username,
    messageCount: user.messageCount,
    volume,
    messagesUntilNext,
    volumeLevelUp: messagesUntilNext === streamData.settings.messagesPerIncrement
  });
});

// Record TTS usage
app.post('/api/user/:username/tts', (req, res) => {
  const username = req.params.username.toLowerCase();
  
  let user = streamData.users.get(username) || { messageCount: 0, ttsCount: 0 };
  user.ttsCount += 1;
  streamData.users.set(username, user);
  
  const volume = calculateVolume(user.messageCount);
  
  res.json({
    username,
    volume,
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
  const { baseVolume, maxVolume, minVolume, volumeIncrement, messagesPerIncrement } = req.body;
  
  if (baseVolume !== undefined) streamData.settings.baseVolume = Math.max(0, Math.min(1, baseVolume));
  if (maxVolume !== undefined) streamData.settings.maxVolume = Math.max(0, Math.min(1, maxVolume));
  if (minVolume !== undefined) streamData.settings.minVolume = Math.max(0, Math.min(1, minVolume));
  if (volumeIncrement !== undefined) streamData.settings.volumeIncrement = Math.max(0, volumeIncrement);
  if (messagesPerIncrement !== undefined) streamData.settings.messagesPerIncrement = Math.max(1, messagesPerIncrement);
  
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
