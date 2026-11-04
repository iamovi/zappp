const http = require('http');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const chokidar = require('chokidar');
const WebSocket = require('ws');
const { exec } = require('child_process');
const { version } = require('../package.json');

// ─── ANSI helpers (no extra dependencies) ─────────────────────────────────────
const A = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  white:  '\x1b[97m',
  gray:   '\x1b[90m',
};
const paint = (codes, str) => `${codes}${str}${A.reset}`;

// ─── Timestamp (24h, compact) ──────────────────────────────────────────────────
function ts() {
  return paint(A.gray, new Date().toLocaleTimeString('en-GB', { hour12: false }));
}

// ─── Relative URL path from an absolute disk path ─────────────────────────────
function relUrl(root, absPath) {
  return '/' + path.relative(root, absPath).replace(/\\/g, '/');
}

// ─── Padded event label (fixed 7-char width for alignment) ────────────────────
function label(color, text) {
  return paint(color, text.padEnd(7));
}

class Server {
  constructor(options = {}) {
    this.root       = options.root       || process.cwd();
    this.port       = options.port       || 3000;
    this.host       = options.host       || '0.0.0.0';
    this.open       = options.open       || false;
    // Optional callback invoked just before process exit (used for update notice)
    this.onShutdown = options.onShutdown || null;
    this.clients    = new Set();
    this.server     = null;
    this.wss        = null;
    this.watcher    = null;
  }

  start() {
    const startTime = Date.now();

    // Create HTTP server
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    // Create WebSocket server for live reload
    this.wss = new WebSocket.Server({ server: this.server });
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      ws.on('close', () => {
        this.clients.delete(ws);
      });
    });

    // Start file watcher
    this.startWatcher();

    // Start listening
    this.server.listen(this.port, this.host, () => {
      const elapsed   = Date.now() - startTime;
      const localUrl  = `http://localhost:${this.port}`;
      const networkUrl = this.host === '0.0.0.0'
        ? `http://${this.getLocalIp()}:${this.port}`
        : `http://${this.host}:${this.port}`;

      const W = 48;
      const line = paint(A.cyan + A.dim, '─'.repeat(W));

      console.log('');
      console.log('  ' + paint(A.bold + A.cyan, 'zappp') + '  ' + paint(A.gray, `v${version}`));
      console.log('  ' + line);
      console.log('');
      console.log('  ' + paint(A.gray, 'local   ') + '  ' + paint(A.bold + A.white, localUrl));
      console.log('  ' + paint(A.gray, 'network ') + '  ' + paint(A.bold + A.white, networkUrl));
      console.log('  ' + paint(A.gray, 'root    ') + '  ' + paint(A.dim,  this.root));
      console.log('');
      console.log('  ' + paint(A.gray + A.dim, `ready in ${elapsed}ms  ·  watching for changes  ·  ctrl+c to stop`));
      console.log('  ' + line);
      console.log('');

      if (this.open) {
        this.openBrowser(localUrl);
      }
    });

    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error('\n  ' + paint(A.red + A.bold, 'error') + '  ' +
          `port ${this.port} is already in use`);
        console.error('  ' + paint(A.gray, '       ') +
          `try a different port:  zappp -p <port>\n`);
      } else {
        console.error('\n  ' + paint(A.red + A.bold, 'error') + '  ' + err.message + '\n');
      }
      process.exit(1);
    });

    // Handle both SIGINT (Ctrl+C) and SIGTERM (Docker/PM2/systemd)
    const shutdown = () => {
      console.log('\n\n  ' + paint(A.gray, 'shutting down  ·  goodbye') + '\n');
      // Run the optional shutdown hook (e.g. background update notice from bin/zappp.js)
      if (this.onShutdown) this.onShutdown();
      this.stop();
      process.exit(0);
    };
    process.on('SIGINT',  shutdown);
    process.on('SIGTERM', shutdown);
  }

  handleRequest(req, res) {
    let filePath = decodeURIComponent(req.url);

    // Remove query string
    const queryIndex = filePath.indexOf('?');
    if (queryIndex !== -1) {
      filePath = filePath.substring(0, queryIndex);
    }

    // Construct absolute path
    let absolutePath = path.join(this.root, filePath);

    // Security: use path.relative() for safe containment check.
    // String startsWith() causes false positives when a sibling directory
    // shares the same prefix (e.g. /srv/app-evil vs /srv/app).
    const rel = path.relative(this.root, absolutePath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      this.sendError(res, 403, 'Forbidden');
      return;
    }

    // Check if path exists
    fs.stat(absolutePath, (err, stats) => {
      if (err) {
        this.sendError(res, 404, 'Not Found');
        return;
      }

      // If directory, look for index.html
      if (stats.isDirectory()) {
        absolutePath = path.join(absolutePath, 'index.html');

        fs.stat(absolutePath, (err) => {
          if (err) {
            this.sendDirectoryListing(res, filePath);
            return;
          }
          this.sendFile(res, absolutePath);
        });
      } else {
        this.sendFile(res, absolutePath);
      }
    });
  }

  sendFile(res, filePath) {
    const ext         = path.extname(filePath);
    const contentType = mime.lookup(filePath) || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
      if (err) {
        this.sendError(res, 500, 'Internal Server Error');
        return;
      }

      // Inject live reload script for HTML files
      if (ext === '.html') {
        const injectedHtml = this.injectLiveReload(data.toString());
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(injectedHtml);
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      }

      // Log: "14:19:03  get      /index.html"
      const urlPath = relUrl(this.root, filePath);
      console.log(`  ${ts()}  ${label(A.dim, 'get')}  ${paint(A.white, urlPath)}`);
    });
  }

  sendError(res, statusCode, message) {
    res.writeHead(statusCode, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>${statusCode} ${message}</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: #0f0f0f;
        color: #ededed;
      }
      .card {
        text-align: center;
        padding: 3rem 4rem;
        border: 1px solid #222;
        border-radius: 12px;
        background: #161616;
      }
      .code {
        font-size: 4rem;
        font-weight: 700;
        color: #ff4d4d;
        letter-spacing: -2px;
        line-height: 1;
        margin-bottom: 0.5rem;
      }
      .msg {
        font-size: 1rem;
        color: #888;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      .sep {
        width: 2rem;
        height: 2px;
        background: #333;
        margin: 1.25rem auto;
        border-radius: 2px;
      }
      .hint {
        font-size: 0.8rem;
        color: #555;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="code">${statusCode}</div>
      <div class="msg">${message}</div>
      <div class="sep"></div>
      <div class="hint">zappp · static file server</div>
    </div>
  </body>
</html>`);
  }

  sendDirectoryListing(res, dirPath) {
    const absolutePath = path.join(this.root, dirPath);

    fs.readdir(absolutePath, { withFileTypes: true }, (err, entries) => {
      if (err) {
        this.sendError(res, 500, 'Internal Server Error');
        return;
      }

      const items = entries.map(entry => {
        const name  = entry.name;
        const isDir = entry.isDirectory();
        // Always use forward slashes for URL hrefs (path.join uses \ on Windows)
        const base = dirPath.replace(/\\/g, '/').replace(/\/$/, '');
        const href = base + '/' + name;
        return { name, isDir, href };
      }).sort((a, b) => {
        if (a.isDir === b.isDir) return a.name.localeCompare(b.name);
        return a.isDir ? -1 : 1;
      });

      const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>/ ${dirPath}</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'SF Mono', Roboto, monospace;
        background: #0f0f0f;
        color: #ccc;
        min-height: 100vh;
        padding: 3rem 2rem;
      }
      .container { max-width: 760px; margin: 0 auto; }
      header {
        display: flex;
        align-items: baseline;
        gap: 1rem;
        margin-bottom: 2rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid #222;
      }
      .brand {
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        color: #555;
      }
      h1 {
        font-size: 0.95rem;
        font-weight: 400;
        color: #888;
      }
      h1 span { color: #ededed; font-weight: 600; }
      .list {
        list-style: none;
        border: 1px solid #1e1e1e;
        border-radius: 8px;
        overflow: hidden;
      }
      .list li { border-bottom: 1px solid #1a1a1a; }
      .list li:last-child { border-bottom: none; }
      .list a {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1.25rem;
        text-decoration: none;
        color: #ccc;
        font-size: 0.875rem;
        transition: background 0.15s, color 0.15s;
      }
      .list a:hover { background: #161616; color: #fff; }
      .icon {
        width: 1.1rem;
        flex-shrink: 0;
        color: #444;
        font-size: 0.75rem;
        font-style: normal;
      }
      .dir-name { color: #7ec8e3; }
      .up a { color: #555; }
      .up a:hover { color: #888; background: #111; }
      footer {
        margin-top: 2rem;
        font-size: 0.75rem;
        color: #333;
        letter-spacing: 0.05em;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <header>
        <span class="brand">zappp</span>
        <h1>index of <span>${dirPath}</span></h1>
      </header>
      <ul class="list">
        ${dirPath !== '/' ? `
        <li class="up">
          <a href="..">
            <i class="icon">&larr;</i>
            <span>..</span>
          </a>
        </li>` : ''}
        ${items.map(item => `
        <li>
          <a href="${item.href}">
            <i class="icon">${item.isDir ? '/' : '&middot;'}</i>
            <span class="${item.isDir ? 'dir-name' : ''}">${item.name}${item.isDir ? '/' : ''}</span>
          </a>
        </li>`).join('')}
      </ul>
      <footer>zappp v${version} &middot; static file server</footer>
    </div>
    ${this.getLiveReloadScript()}
  </body>
</html>`;

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    });
  }

  injectLiveReload(html) {
    const script = this.getLiveReloadScript();

    // Case-insensitive match so </BODY>, </Body> etc. all work
    if (/<\/body>/i.test(html)) {
      return html.replace(/<\/body>/i, `${script}</body>`);
    }
    if (/<\/html>/i.test(html)) {
      return html.replace(/<\/html>/i, `${script}</html>`);
    }

    // No closing tags found — append to end
    return html + script;
  }

  getLiveReloadScript() {
    // Exponential back-off reconnect: prevents infinite page reload when
    // the server stops. Reloads once cleanly when the server comes back.
    return `<script>
(function () {
  var WS_URL    = 'ws://' + location.host;
  var retries   = 0;
  var MAX       = 20;

  function connect() {
    var ws = new WebSocket(WS_URL);

    ws.onopen = function () {
      retries = 0;
    };

    ws.onmessage = function (e) {
      if (e.data === 'reload') location.reload();
    };

    ws.onclose = function () {
      if (retries >= MAX) return;
      var delay = Math.min(1000 * Math.pow(2, retries), 10000);
      retries++;
      setTimeout(connect, delay);
    };
  }

  connect();
}());
</script>`;
  }

  startWatcher() {
    this.watcher = chokidar.watch(this.root, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher
      // Use `filePath` to avoid shadowing the `path` module variable
      .on('change', (filePath) => {
        console.log(`  ${ts()}  ${label(A.yellow, 'changed')}  ${paint(A.white, relUrl(this.root, filePath))}`);
        this.reloadClients();
      })
      .on('add', (filePath) => {
        console.log(`  ${ts()}  ${label(A.green, 'added')}  ${paint(A.white, relUrl(this.root, filePath))}`);
        this.reloadClients();
      })
      .on('unlink', (filePath) => {
        console.log(`  ${ts()}  ${label(A.red, 'removed')}  ${paint(A.white, relUrl(this.root, filePath))}`);
        this.reloadClients();
      });
  }

  reloadClients() {
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send('reload');
      }
    });
  }

  openBrowser(url) {
    const platform = process.platform;
    const command  = platform === 'darwin' ? 'open'
                   : platform === 'win32'  ? 'start'
                   :                         'xdg-open';

    exec(`${command} ${url}`, (err) => {
      if (err) {
        console.log(`  ${paint(A.yellow, 'warn')}    could not open browser  ·  visit ${url}`);
      }
    });
  }

  getLocalIp() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();

    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }

    return this.host;
  }

  stop() {
    if (this.watcher) this.watcher.close();
    if (this.wss)     this.wss.close();
    if (this.server)  this.server.close();
  }
}

module.exports = Server;
