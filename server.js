// Express Server for Desktop Adventure Idle
// Serves static frontend files and mounts database API routes.

const express = require('express');
const path = require('path');
const { initDB } = require('./db');
const apiRoutes = require('./api');

// Initialize Database
initDB();

const app = express();
const PORT = process.env.PORT || 3000;

// Body parsing middleware
app.use(express.json({ limit: '10mb' })); // Support larger game state payloads if needed

// Mount authentication and save endpoints
app.use('/api', apiRoutes);

// Serve static frontend assets
// Serve CSS, JS, Assets directly from the root and subdirectory
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use(express.static(__dirname));

// Fallback to index.html for undefined routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`===================================================`);
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
    console.log(`===================================================`);
});
