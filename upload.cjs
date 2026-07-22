#!/usr/bin/env node

/**
 * upload.js
 * Upload automático para Screeps (local server)
 *
 * Uso:
 *   npm run upload -- --branch main --email user@example.com --password pass
 *   npm run upload:local
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

function loadConfig() {
  const configPath = path.join(process.cwd(), '.screepsrc.json');
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  return {};
}

function parseArgs() {
  const args = process.argv.slice(2);
  const config = loadConfig();
  const result = {
    host: config.host || '127.0.0.1',
    port: config.port || 21025,
    branch: config.branch || 'main',
    email: config.email || '',
    password: config.password || '',
    dryRun: false
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--host') result.host = args[++i];
    if (args[i] === '--port') result.port = parseInt(args[++i], 10);
    if (args[i] === '--branch') result.branch = args[++i];
    if (args[i] === '--email') result.email = args[++i];
    if (args[i] === '--password') result.password = args[++i];
    if (args[i] === '--dry-run') result.dryRun = true;
  }

  return result;
}

function upload(config) {
  const distPath = path.join(process.cwd(), 'dist', 'main.js');

  if (!fs.existsSync(distPath)) {
    console.error('✗ dist/main.js not found. Run "npm run build" first.');
    process.exit(1);
  }

  const code = fs.readFileSync(distPath, 'utf8');

  if (config.dryRun) {
    console.log('DRY RUN: Would upload', code.length, 'bytes to', config.host + ':' + config.port);
    console.log('Branch:', config.branch);
    return;
  }

  const payload = JSON.stringify({
    branch: config.branch,
    modules: {
      main: code
    }
  });

  const options = {
    hostname: config.host,
    port: config.port,
    path: '/api/user/code',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  if (config.email && config.password) {
    const auth = Buffer.from(config.email + ':' + config.password).toString('base64');
    options.headers.Authorization = 'Basic ' + auth;
  }

  const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      if (res.statusCode === 200 || res.statusCode === 201) {
        console.log('✓ Upload successful!');
        console.log('Response:', data);
      } else {
        console.error('✗ Upload failed. Status:', res.statusCode);
        console.error('Response:', data);
        process.exit(1);
      }
    });
  });

  req.on('error', (err) => {
    console.error('✗ Upload error:', err.message);
    process.exit(1);
  });

  req.write(payload);
  req.end();
}

const config = parseArgs();
console.log('Uploading to', config.host + ':' + config.port, '...');
upload(config);
