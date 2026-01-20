#!/usr/bin/env node

const Server = require('../src/index');
const path = require('path');
const https = require('https');
const packageJson = require('../package.json');

const args = process.argv.slice(2);
const options = {};

// Parse command line arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  if (arg === '--version' || arg === '-v') {
    showVersion();
    return;
  } else if (arg === '--port' || arg === '-p') {
    options.port = parseInt(args[++i], 10);
  } else if (arg === '--host' || arg === '-h') {
    options.host = args[++i];
  } else if (arg === '--open' || arg === '-o') {
    options.open = true;
  } else if (arg === '--no-browser') {
    options.open = false;
  } else if (arg === '--help') {
    console.log(`
Zappp - Static file server with live reload

Usage:
  zappp [directory] [options]

Options:
  -p, --port <number>     Port to use (default: 3000)
  --host <host>           Host to use (default: 0.0.0.0)
  -o, --open              Open browser automatically
  --no-browser            Don't open browser
  -v, --version           Show version number
  -h, --help              Show this help message

Examples:
  zappp                   Start server on default port 3000
  zappp -p 8080           Start server on port 8080
  zappp -o                Start server and open browser
  zappp ./public          Serve specific directory
  
  Combine options:
  zappp -p 8080 -o        Custom port and open browser
  zappp --port 8080 --open
  zappp ./dist -p 5000 -o Serve dist folder on port 5000 and open browser
  zappp --host 0.0.0.0 -p 8000 -o
    `);
    process.exit(0);
  } else if (arg.startsWith('-')) {
    console.error(`\n❌ Unknown option: ${arg}`);
    console.log('Run "zappp --help" for usage information.\n');
    process.exit(1);
  } else {
    options.root = path.resolve(process.cwd(), arg);
  }
}

// Function to show version and check for updates
function showVersion() {
  const currentVersion = packageJson.version;
  console.log(`\nZappp v${currentVersion}\n`);
  
  // Check for updates from npm
  checkForUpdates(currentVersion);
}

// Function to check for updates from npm registry
function checkForUpdates(currentVersion) {
  const packageName = packageJson.name;
  
  https.get(`https://registry.npmjs.org/${packageName}/latest`, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const latestVersion = JSON.parse(data).version;
        
        if (latestVersion && latestVersion !== currentVersion) {
          console.log(`🎉 New version available: v${latestVersion}`);
          console.log(`📦 Update using: npm update -g ${packageName}\n`);
        } else {
          console.log(`✅ You're using the latest version!\n`);
        }
      } catch (error) {
        // Silently fail if can't check for updates
        console.log('');
      }
    });
  }).on('error', () => {
    // Silently fail if offline or can't reach npm
    console.log('');
  });
}

// Set defaults
if (!options.root) {
  options.root = process.cwd();
}

if (!options.port) {
  options.port = 3000;
}

if (!options.host) {
  options.host = '0.0.0.0';
}

if (options.open === undefined) {
  options.open = false;
}

// Start server
const server = new Server(options);
server.start();