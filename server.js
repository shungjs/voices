const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================================================
// 🎛️ VOLUME SETTINGS - Easy to modify!
// =============================================================================
const VOLUME_CONFIG = {
  startVolume: 0.10,        // Start at 10% volume
  volumePerMessage: 0.02,   // Each message adds 2% volume  
  maxVolume: 0.90,          // Maximum 90% volume
  minVolume: 0.10           // Minimum 10% volume (fallback)
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

// Helper function to calculate volume based on message count
function calculateVolume(messageCount) {
  const { startVolume, volumePerMessage, maxVolume, minVolume } = streamData.settings;
  const calculatedVolume = startVolume + (messageCount * volumePerMessage);
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

// Get user volume (for checking volume)
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

// 🎯 MAIN ENDPOINT: Get TTS volume for channel point redemptions
app.get('/api/tts/:username', (req, res) => {
  const username = req.params.username.toLowerCase();
  let user = streamData.users.get(username) || { messageCount: 0, ttsCount: 0 };
  const volume = calculateVolume(user.messageCount);
  
  // Record TTS usage
  user.ttsCount += 1;
  streamData.users.set(username, user);
  
  const volumePercent = Math.round(volume * 100);
  
  // Return user-friendly message for StreamElements
  res.send(`🔊 @${username} TTS Volume: ${volumePercent}% (${user.messageCount} messages) - Use volume: ${volume.toFixed(2)}`);
});

// Alternative JSON endpoint for advanced integrations
app.get('/api/tts/:username/json', (req, res) => {
  const username = req.params.username.toLowerCase();
  let user = streamData.users.get(username) || { messageCount: 0, ttsCount: 0 };
  const volume = calculateVolume(user.messageCount);
  
  user.ttsCount += 1;
  streamData.users.set(username, user);
  
  res.json({
    username,
    volume,
    volumePercent: Math.round(volume * 100),
    messageCount: user.messageCount,
    ttsCount: user.ttsCount,
    success: true
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
  
  const leaderboard = users.map((user, i) => 
    `${i + 1}. ${user.username} (${user.messageCount} msgs, ${Math.round(user.volume * 100)}% vol)`
  ).join(' | ');
  
  res.send(`🏆 Top Chatters: ${leaderboard || 'No data yet!'}`);
});

// Get/Update settings
app.get('/api/settings', (req, res) => {
  res.json(streamData.settings);
});

app.put('/api/settings', (req, res) => {
  const { startVolume, volumePerMessage, maxVolume, minVolume } = req.body;
  
  if (startVolume !== undefined) streamData.settings.startVolume = Math.max(0, Math.min(1, startVolume));
  if (maxVolume !== undefined) streamData.settings.maxVolume = Math.max(0, Math.min(1, maxVolume));
  if (minVolume !== undefined) streamData.settings.minVolume = Math.max(0, Math.min(1, minVolume));
  if (volumePerMessage !== undefined) streamData.settings.volumePerMessage = Math.max(0, volumePerMessage);
  
  res.json({ message: 'Settings updated', settings: streamData.settings });
});

// Reset stream data (for new stream)
app.post('/api/reset', (req, res) => {
  streamData.users.clear();
  res.send('🔄 Stream data reset! Ready for new stream.');
});

// Get stream stats
app.get('/api/stats', (req, res) => {
  const users = Array.from(streamData.users.values());
  const totalMessages = users.reduce((sum, user) => sum + user.messageCount, 0);
  const totalTTS = users.reduce((sum, user) => sum + user.ttsCount, 0);
  
  res.send(`📊 Stream Stats: ${streamData.users.size} users | ${totalMessages} messages | ${totalTTS} TTS used | ${Math.floor(process.uptime() / 60)}m uptime`);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 StreamElements TTS API running on port ${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log(`🎯 Ready for Channel Points integration!`);
});

module.exports = app;
