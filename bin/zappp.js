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
  cyan:   '\x1b[92m',  // neon green — matches logo color theme
  white:  '\x1b[97m',
  gray:   '\x1b[90m',
};
const paint = (codes, str) => `${codes}${str}${A.reset}`;

// ─── Config file loader (.zappprc.json in cwd) ────────────────────────────────
// CLI flags always override config file values.
function loadConfig() {
  const configPath = path.join(process.cwd(), '.zappprc.json');
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.error(
      '\n  ' + paint(A.yellow, 'warn') +
      `  could not parse .zappprc.json: ${e.message}\n`
    );
    return {};
  }
}

// ─── Argument parsing ──────────────────────────────────────────────────────────
// Start with config file defaults, then let CLI flags override.
const fileConfig = loadConfig();
const args       = process.argv.slice(2);
const options    = { ...fileConfig };

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

  } else if (arg === '--spa') {
    // SPA mode: serve index.html for all 404s (React, Vue, Angular, Svelte, etc.)
    options.spa = true;

  } else if (arg === '--entry-file' || arg === '-e') {
    // Custom SPA fallback file (implies SPA mode)
    options.entryFile = args[++i];

  } else if (arg === '--wait' || arg === '-w') {
    // Debounce delay in ms before triggering a reload (default: 100)
    const waitValue = parseInt(args[++i], 10);
    if (isNaN(waitValue) || waitValue < 0) {
      console.error(
        '\n  ' + paint(A.red + A.bold, 'error') +
        `  invalid --wait value "${args[i]}"  ·  must be a non-negative number\n`
      );
      process.exit(1);
    }
    options.wait = waitValue;

  } else if (arg === '--cors') {
    // Add Access-Control-Allow-Origin: * to all responses
    options.cors = true;

  } else if (arg === '--ignore' || arg === '-i') {
    // Comma-separated glob patterns to exclude from file watching
    options.ignore = args[++i];

  } else if (arg === '--quiet' || arg === '-q') {
    // Suppress all log output (useful in CI or scripted setups)
    options.quiet = true;

  } else if (arg === '--verbose' || arg === '-V') {
    // Log every request with status code and response time
    options.verbose = true;

  } else if (arg === '--gzip') {
    // Enable gzip compression for text responses (on by default)
    options.gzip = true;

  } else if (arg === '--no-gzip') {
    // Disable gzip compression
    options.gzip = false;

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
  const W  = 56;
  const ln = paint(A.cyan + A.dim, '─'.repeat(W));

  console.log(`
  ${paint(A.bold + A.cyan, 'zappp')}  ${paint(A.gray, `v${packageJson.version}`)}
  ${ln}
  ${paint(A.gray, 'static file server with live reload')}

  ${paint(A.white, 'usage')}
    zappp [directory] [options]

  ${paint(A.white, 'server')}
    ${paint(A.cyan, '-p, --port')} ${paint(A.gray, '<n>')}         port to listen on          ${paint(A.gray, '(default: 3000)')}
    ${paint(A.cyan, '    --host')} ${paint(A.gray, '<h>')}         host to bind to             ${paint(A.gray, '(default: 0.0.0.0)')}
    ${paint(A.cyan, '-o, --open')}              open browser on start
    ${paint(A.cyan, '    --no-browser')}        do not open browser
    ${paint(A.cyan, '    --cors')}              enable CORS ${paint(A.gray, '(Access-Control-Allow-Origin: *)')}

  ${paint(A.white, 'reload')}
    ${paint(A.cyan, '-w, --wait')} ${paint(A.gray, '<ms>')}        debounce before reload      ${paint(A.gray, '(default: 100)')}
    ${paint(A.cyan, '-i, --ignore')} ${paint(A.gray, '<globs>')}   comma-separated watch ignore patterns

  ${paint(A.white, 'spa')}
    ${paint(A.cyan, '    --spa')}               serve index.html for all 404s
    ${paint(A.cyan, '-e, --entry-file')} ${paint(A.gray, '<f>')}  custom SPA fallback file

  ${paint(A.white, 'output')}
    ${paint(A.cyan, '-q, --quiet')}             suppress all log output
    ${paint(A.cyan, '-V, --verbose')}           log every request with status + timing
    ${paint(A.cyan, '    --gzip')}              enable gzip compression  ${paint(A.gray, '(on by default)')}
    ${paint(A.cyan, '    --no-gzip')}           disable gzip compression

  ${paint(A.white, 'info')}
    ${paint(A.cyan, '-v, --version')}           show version + check for updates
    ${paint(A.cyan, '-h, --help')}              show this help message

  ${paint(A.white, 'config')}
    ${paint(A.gray, 'create')} ${paint(A.dim, '.zappprc.json')} ${paint(A.gray, 'in your project root to persist options:')}
    ${paint(A.dim, '{ "port": 8080, "spa": true, "cors": true, "gzip": true }')}

  ${paint(A.white, 'examples')}
    zappp                              serve current directory on port 3000
    zappp ./public -p 8080 -o          serve folder, custom port, open browser
    zappp --spa                        SPA mode for React/Vue/Angular/Svelte
    zappp --cors --gzip                CORS + gzip compression enabled
    zappp -V                           verbose request log with status codes
    zappp -w 300 -i "scss/**,*.map"    debounce 300ms, ignore scss folder
    zappp --host 127.0.0.1             bind to localhost only
  ${ln}
`);
}

// ─── Boot server (skip if --version was requested) ───────────────────────────
if (!args.includes('--version') && !args.includes('-v')) {
  // Apply defaults
  if (!options.root)              options.root = process.cwd();
  if (!options.port)              options.port = 3000;
  if (!options.host)              options.host = '0.0.0.0';
  if (options.open === undefined) options.open = false;
  if (options.gzip === undefined) options.gzip = true;  // gzip on by default

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
