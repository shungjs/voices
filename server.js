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

// 🎯 MAIN ENDPOINT: Get TTS volume for channel point redemptions
app.get('/api/tts/:username', (req, res) => {
  const username = req.params.username.toLowerCase();
  let user = streamData.users.get(username) || { ttsCount: 0 };
  
  // Calculate CURRENT volume (before this TTS)
  const currentVolume = calculateVolume(user.ttsCount);
  
  // Increase TTS count for NEXT time
  user.ttsCount += 1;
  streamData.users.set(username, user);
  
  const volumePercent = Math.round(currentVolume * 100);
  
  // Return user-friendly message for StreamElements
  res.send(`🔊 @${username} TTS Volume: ${volumePercent}% (${user.ttsCount - 1} previous TTS uses)`);
});

// Alternative JSON endpoint for bot integration
app.get('/api/tts/:username/json', (req, res) => {
  const username = req.params.username.toLowerCase();
  let user = streamData.users.get(username) || { ttsCount: 0 };
  
  // Calculate CURRENT volume (before this TTS)
  const currentVolume = calculateVolume(user.ttsCount);
  
  // Increase TTS count for NEXT time  
  user.ttsCount += 1;
  streamData.users.set(username, user);
  
  res.json({
    username,
    volume: currentVolume,
    volumePercent: Math.round(currentVolume * 100),
    ttsCount: user.ttsCount,
    success: true
  });
});

// Get leaderboard (top TTS users)
app.get('/api/leaderboard', (req, res) => {
  const users = Array.from(streamData.users.entries())
    .map(([username, data]) => ({
      username,
      ttsCount: data.ttsCount,
      volume: calculateVolume(data.ttsCount)
    }))
    .sort((a, b) => b.ttsCount - a.ttsCount)
    .slice(0, 10);
  
  const leaderboard = users.map((user, i) => 
    `${i + 1}. ${user.username} (${user.ttsCount} TTS, ${Math.round(user.volume * 100)}% vol)`
  ).join(' | ');
  
  res.send(`🏆 Top TTS Users: ${leaderboard || 'No TTS usage yet!'}`);
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
  res.send('🔄 Stream data reset! Ready for new stream.');
});

// Get stream stats
app.get('/api/stats', (req, res) => {
  const users = Array.from(streamData.users.values());
  const totalTTS = users.reduce((sum, user) => sum + user.ttsCount, 0);
  
  res.send(`📊 Stream Stats: ${streamData.users.size} users | ${totalTTS} total TTS used | ${Math.floor(process.uptime() / 60)}m uptime`);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 StreamElements TTS API running on port ${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
  console.log(`🎯 Ready for Channel Points integration!`);
});

module.exports = app;
