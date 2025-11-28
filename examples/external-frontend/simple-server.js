#!/usr/bin/env node

/**
 * Simple HTTP Server for Testing External Frontends
 * 
 * This server hosts the example external frontend files
 * so they can be accessed via URL for gateway testing.
 * 
 * Usage:
 *   node simple-server.js
 * 
 * Server runs on: http://localhost:8080
 * 
 * Access frontend: http://localhost:8080/dice-game/index.html
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 8080;
const BASE_DIR = __dirname;

// MIME types for different file extensions
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

// CORS headers to allow embedding in iframe
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'X-Frame-Options': 'ALLOWALL', // Allow iframe embedding
};

const server = http.createServer((req, res) => {
  // Handle OPTIONS request (CORS preflight)
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      ...CORS_HEADERS,
      'Content-Length': 0,
    });
    res.end();
    return;
  }

  // Parse URL
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;

  // Default to index.html if directory
  if (pathname.endsWith('/')) {
    pathname += 'index.html';
  }

  // Resolve file path
  const filePath = path.join(BASE_DIR, pathname);

  // Security: Prevent directory traversal
  if (!filePath.startsWith(BASE_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  // Get file extension for MIME type
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  // Read and serve file
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
      }
      return;
    }

    // Success - serve file
    res.writeHead(200, {
      'Content-Type': contentType,
      ...CORS_HEADERS,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('\n🎮 External Frontend Test Server');
  console.log('================================');
  console.log(`Server running on: http://localhost:${PORT}`);
  console.log('\nAvailable frontends:');
  console.log(`  - Dice Game: http://localhost:${PORT}/dice-game/index.html`);
  console.log('\nTo use with Gateway:');
  console.log(`  export DICE_FRONTEND_URL=http://localhost:${PORT}/dice-game/index.html`);
  console.log('  pnpm --filter @instant-games/gateway-api start:dev');
  console.log('\nThen access via Gateway:');
  console.log('  http://localhost:3000/games/dice');
  console.log('\nPress Ctrl+C to stop the server\n');
});

// Handle errors
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Error: Port ${PORT} is already in use.`);
    console.error(`   Try using a different port: PORT=8081 node simple-server.js\n`);
  } else {
    console.error('\n❌ Server error:', err.message);
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down server...');
  server.close(() => {
    console.log('Server stopped.\n');
    process.exit(0);
  });
});

