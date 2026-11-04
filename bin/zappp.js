#!/usr/bin/env node

const Server      = require('../src/index');
const path        = require('path');
const fs          = require('fs');
const https       = require('https');
const packageJson = require('../package.json');

// ─── ANSI helpers ──────────────────────────────────────────────────────────────
const A = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  white:  '\x1b[97m',
  gray:   '\x1b[90m',
};
const paint = (codes, str) => `${codes}${str}${A.reset}`;

// ─── Argument parsing ──────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === '--version' || arg === '-v') {
    showVersion();
    // Do not start the server; let the async update-check finish then exit naturally.

  } else if (arg === '--port' || arg === '-p') {
    // Validate port — parseInt('abc') returns NaN which causes a cryptic crash
    const portValue = parseInt(args[++i], 10);
    if (isNaN(portValue) || portValue < 1 || portValue > 65535) {
      console.error(
        '\n  ' + paint(A.red + A.bold, 'error') +
        `  invalid port "${args[i]}"  ·  must be a number between 1 and 65535\n`
      );
      process.exit(1);
    }
    options.port = portValue;

  } else if (arg === '--host') {
    // -h is reserved for --help (standard CLI convention); --host is long-form only
    options.host = args[++i];

  } else if (arg === '--open' || arg === '-o') {
    options.open = true;

  } else if (arg === '--no-browser') {
    options.open = false;

  } else if (arg === '--help' || arg === '-h') {
    printHelp();
    process.exit(0);

  } else if (arg.startsWith('-')) {
    console.error(
      '\n  ' + paint(A.red + A.bold, 'error') +
      `  unknown option: ${arg}\n` +
      '  ' + paint(A.gray, 'run  zappp --help  for usage information') + '\n'
    );
    process.exit(1);

  } else {
    options.root = path.resolve(process.cwd(), arg);
  }
}

// ─── Version + update check ───────────────────────────────────────────────────
let updateNotice = null;

function checkLatestVersionSilently(current) {
  const name = packageJson.name;
  const req = https.get(`https://registry.npmjs.org/${name}/latest`, { timeout: 4000 }, (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      try {
        const latest = JSON.parse(data).version;
        if (latest && latest !== current) {
          updateNotice = { current, latest, name };
        }
      } catch (_) {}
    });
  });
  req.on('error', () => {});
  req.on('timeout', () => { req.destroy(); });
}

function showVersion() {
  const current = packageJson.version;
  console.log('\n  ' + paint(A.bold + A.cyan, 'zappp') + '  ' + paint(A.gray, `v${current}`) + '\n');
  checkForUpdates(current);
}

function checkForUpdates(current) {
  const name = packageJson.name;

  https.get(`https://registry.npmjs.org/${name}/latest`, (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      try {
        const latest = JSON.parse(data).version;
        if (latest && latest !== current) {
          console.log(
            '  ' + paint(A.yellow, 'update available') +
            `  v${current}  ->  v${latest}\n` +
            '  ' + paint(A.gray, `run:  npm update -g ${name}`) + '\n'
          );
        } else {
          console.log('  ' + paint(A.gray, 'already on the latest version') + '\n');
        }
      } catch (_) {
        console.log('');
      }
    });
  }).on('error', () => { console.log(''); });
}

// ─── Help text ────────────────────────────────────────────────────────────────
function printHelp() {
  const W  = 48;
  const ln = paint(A.cyan + A.dim, '─'.repeat(W));

  console.log(`
  ${paint(A.bold + A.cyan, 'zappp')}  ${paint(A.gray, `v${packageJson.version}`)}
  ${ln}
  ${paint(A.gray, 'static file server with live reload')}

  ${paint(A.white, 'usage')}
    zappp [directory] [options]

  ${paint(A.white, 'options')}
    ${paint(A.cyan, '-p, --port')} ${paint(A.gray, '<n>')}    port to listen on       ${paint(A.gray, '(default: 3000)')}
    ${paint(A.cyan, '    --host')} ${paint(A.gray, '<h>')}    host to bind to          ${paint(A.gray, '(default: 0.0.0.0)')}
    ${paint(A.cyan, '-o, --open')}         open browser on start
    ${paint(A.cyan, '    --no-browser')}   do not open browser
    ${paint(A.cyan, '-v, --version')}      show version + check for updates
    ${paint(A.cyan, '-h, --help')}         show this help message

  ${paint(A.white, 'examples')}
    zappp                       serve current directory on port 3000
    zappp ./public              serve a specific directory
    zappp -p 8080 -o            custom port and open browser
    zappp ./dist -p 5000 -o     serve dist folder on port 5000
    zappp --host 127.0.0.1      bind to localhost only
  ${ln}
`);
}

// ─── Boot server (skip if --version was requested) ───────────────────────────
if (!args.includes('--version') && !args.includes('-v')) {
  // Apply defaults
  if (!options.root)                   options.root = process.cwd();
  if (!options.port)                   options.port = 3000;
  if (!options.host)                   options.host = '0.0.0.0';
  if (options.open === undefined)      options.open = false;

  // Validate root directory exists before starting
  if (!fs.existsSync(options.root) || !fs.statSync(options.root).isDirectory()) {
    console.error(
      '\n  ' + paint(A.red + A.bold, 'error') +
      `  directory not found: ${options.root}\n`
    );
    process.exit(1);
  }

  // Start non-blocking background check for updates
  checkLatestVersionSilently(packageJson.version);

  options.onShutdown = () => {
    if (updateNotice) {
      console.log(
        '  ' + paint(A.yellow, 'update available') +
        `  v${updateNotice.current}  ->  v${updateNotice.latest}\n` +
        '  ' + paint(A.gray, `run:  npm update -g ${updateNotice.name}`) + '\n'
      );
    }
  };

  const server = new Server(options);
  server.start();
}
