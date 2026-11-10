const http     = require('http');
const fs       = require('fs');
const path     = require('path');
const zlib     = require('zlib');   // built-in — no new dependency
const mime     = require('mime-types');
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
  cyan:   '\x1b[92m',  // neon green — matches logo color theme
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

// ─── Status code color ────────────────────────────────────────────────────────
function statusColor(code) {
  if (code >= 500) return A.red;
  if (code >= 400) return A.yellow;
  if (code === 206) return A.cyan;
  return A.green;
}

class Server {
  constructor(options = {}) {
    this.root       = options.root       || process.cwd();
    this.port       = options.port       || 3000;
    this.host       = options.host       || '0.0.0.0';
    this.open       = options.open       || false;
    // SPA: serve entryFile for all 404s (React/Vue/Angular/Svelte)
    this.entryFile  = options.entryFile  || (options.spa ? 'index.html' : null);
    // Debounce: aggregate rapid file saves before triggering reload (default 100ms)
    this.wait       = options.wait       !== undefined ? options.wait : 100;
    // CORS: add Access-Control-Allow-Origin: * to every response
    this.cors       = options.cors       || false;
    // Ignore: comma-separated glob patterns to exclude from watching
    this.ignore     = options.ignore     || null;
    // Quiet: suppress all log output
    this.quiet      = options.quiet      || false;
    // Verbose: log every request with status code + response time
    this.verbose    = options.verbose    || false;
    // Gzip: compress text responses when client supports it
    this.gzip       = options.gzip       !== undefined ? options.gzip : true;
    // Optional callback invoked just before process exit (used for update notice)
    this.onShutdown = options.onShutdown || null;

    this.clients      = new Set();
    this.server       = null;
    this.wss          = null;
    this.watcher      = null;
    this._reloadTimer = null;
    this._cssTimers   = new Map();
  }

  // ─── Quiet-aware logger ───────────────────────────────────────────────────────
  log(...args) {
    if (!this.quiet) console.log(...args);
  }

  // ─── Returns true for content types worth compressing ────────────────────────
  isCompressible(contentType) {
    return /^(text\/|application\/(javascript|json|xml|manifest|wasm)|image\/svg)/.test(contentType);
  }

  start() {
    const startTime = Date.now();

    // Create HTTP server
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    // Create WebSocket server for live reload / CSS hot-swap
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
      const elapsed    = Date.now() - startTime;
      const localUrl   = `http://localhost:${this.port}`;
      const networkUrl = this.host === '0.0.0.0'
        ? `http://${this.getLocalIp()}:${this.port}`
        : `http://${this.host}:${this.port}`;

      const W    = 48;
      const line = paint(A.cyan + A.dim, '─'.repeat(W));

      this.log('');
      this.log('  ' + paint(A.bold + A.cyan, 'zappp') + '  ' + paint(A.gray, `v${version}`));
      this.log('  ' + line);
      this.log('');
      this.log('  ' + paint(A.gray, 'local   ') + '  ' + paint(A.bold + A.white, localUrl));
      this.log('  ' + paint(A.gray, 'network ') + '  ' + paint(A.bold + A.white, networkUrl));
      this.log('  ' + paint(A.gray, 'root    ') + '  ' + paint(A.dim,  this.root));
      if (this.entryFile)
        this.log('  ' + paint(A.gray, 'spa     ') + '  ' + paint(A.dim, this.entryFile));
      if (this.cors)
        this.log('  ' + paint(A.gray, 'cors    ') + '  ' + paint(A.cyan, 'enabled'));
      if (this.gzip)
        this.log('  ' + paint(A.gray, 'gzip    ') + '  ' + paint(A.cyan, 'enabled'));
      this.log('');
      this.log('  ' + paint(A.gray + A.dim, `ready in ${elapsed}ms  ·  watching for changes  ·  ctrl+c to stop`));
      this.log('  ' + line);
      this.log('');

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
    // ── CORS: set headers on every response; handle preflight immediately ────────
    if (this.cors) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
    }

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
      this.sendError(req, res, 403, 'Forbidden');
      return;
    }

    // Check if path exists
    fs.stat(absolutePath, (err, stats) => {
      if (err) {
        // ── SPA fallback: serve entryFile instead of 404 ──────────────────────
        if (this.entryFile) {
          const fallback = path.join(this.root, this.entryFile);
          fs.stat(fallback, (ferr) => {
            if (ferr) {
              this.sendError(req, res, 404, 'Not Found');
            } else {
              this.sendFile(req, res, fallback);
            }
          });
        } else {
          this.sendError(req, res, 404, 'Not Found');
        }
        return;
      }

      // If directory, look for index.html
      if (stats.isDirectory()) {
        absolutePath = path.join(absolutePath, 'index.html');

        fs.stat(absolutePath, (err) => {
          if (err) {
            this.sendDirectoryListing(req, res, filePath);
            return;
          }
          this.sendFile(req, res, absolutePath);
        });
      } else {
        this.sendFile(req, res, absolutePath);
      }
    });
  }

  sendFile(req, res, filePath) {
    const t0          = Date.now();
    const ext         = path.extname(filePath).toLowerCase();
    const contentType = mime.lookup(filePath) || 'application/octet-stream';
    const urlPath     = relUrl(this.root, filePath);

    // ── Range request: byte-range serving for video/audio seeking ────────────────
    if (req.headers['range'] && ext !== '.html') {
      this.sendRange(req, res, filePath, contentType, urlPath, t0);
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        this.sendError(req, res, 500, 'Internal Server Error');
        return;
      }

      // Inject live reload + CSS hot-swap client script for HTML files
      if (ext === '.html') {
        data = Buffer.from(this.injectLiveReload(data.toString()));
      }

      const headers = {
        'Content-Type':  contentType,
        'Accept-Ranges': 'bytes',
      };

      // ── Gzip: compress compressible text types when client supports it ─────────
      const acceptsGzip    = /gzip/.test(req.headers['accept-encoding'] || '');
      const shouldCompress = this.gzip && acceptsGzip && this.isCompressible(contentType);

      if (shouldCompress) {
        zlib.gzip(data, (zerr, compressed) => {
          if (zerr) {
            // Compression failed — fall back to uncompressed
            res.writeHead(200, headers);
            res.end(data);
          } else {
            res.writeHead(200, {
              ...headers,
              'Content-Encoding': 'gzip',
              'Vary':             'Accept-Encoding',
            });
            res.end(compressed);
          }
          this.logRequest(req, 200, Date.now() - t0, urlPath, shouldCompress && !zerr ? 'gzip' : null);
        });
      } else {
        res.writeHead(200, headers);
        res.end(data);
        this.logRequest(req, 200, Date.now() - t0, urlPath, null);
      }
    });
  }

  // ─── Byte-range response for video/audio seeking (206 Partial Content) ────────
  sendRange(req, res, filePath, contentType, urlPath, t0) {
    fs.stat(filePath, (err, stat) => {
      if (err) {
        this.sendError(req, res, 500, 'Internal Server Error');
        return;
      }

      const fileSize   = stat.size;
      const rawRange   = req.headers['range'];
      const [unit, range] = rawRange.split('=');

      // Reject non-byte ranges
      if (unit !== 'bytes' || !range) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
        res.end();
        return;
      }

      const [startStr, endStr] = range.split('-');
      const start = parseInt(startStr, 10);
      const end   = endStr ? Math.min(parseInt(endStr, 10), fileSize - 1) : fileSize - 1;

      // Validate range bounds
      if (isNaN(start) || isNaN(end) || start > end || start < 0 || end >= fileSize) {
        res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
        res.end();
        return;
      }

      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Type':   contentType,
        'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges':  'bytes',
        'Content-Length': chunkSize,
      });

      // Stream only the requested byte range — memory-efficient for large video files
      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
      stream.on('end',   () => { this.logRequest(req, 206, Date.now() - t0, urlPath, 'range'); });
      stream.on('error', () => { /* client disconnected mid-stream — safe to ignore */ });
    });
  }

  // ─── Unified request logger ───────────────────────────────────────────────────
  logRequest(req, statusCode, ms, urlPath, hint) {
    if (this.quiet) return;

    if (this.verbose) {
      const sc   = paint(statusColor(statusCode), String(statusCode));
      const time = paint(A.gray, `${ms}ms`);
      const tag  = hint ? '  ' + paint(A.gray + A.dim, hint) : '';
      this.log(`  ${ts()}  ${label(A.dim, 'get')}  ${paint(A.white, urlPath.padEnd(36))}  ${sc}  ${time}${tag}`);
    } else {
      this.log(`  ${ts()}  ${label(A.dim, 'get')}  ${paint(A.white, urlPath)}`);
    }
  }

  sendError(req, res, statusCode, message) {
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

    if (req) {
      const urlPath = decodeURIComponent(req.url || '/').split('?')[0];
      this.logRequest(req, statusCode, 0, urlPath, null);
    }
  }

  sendDirectoryListing(req, res, dirPath) {
    const t0           = Date.now();
    const absolutePath = path.join(this.root, dirPath);

    fs.readdir(absolutePath, { withFileTypes: true }, (err, entries) => {
      if (err) {
        this.sendError(req, res, 500, 'Internal Server Error');
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

      const headers = { 'Content-Type': 'text/html' };
      const acceptsGzip = /gzip/.test(req.headers['accept-encoding'] || '');

      if (this.gzip && acceptsGzip) {
        zlib.gzip(Buffer.from(html), (zerr, compressed) => {
          if (zerr) {
            res.writeHead(200, headers);
            res.end(html);
          } else {
            res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding' });
            res.end(compressed);
          }
          this.logRequest(req, 200, Date.now() - t0, dirPath || '/', null);
        });
      } else {
        res.writeHead(200, headers);
        res.end(html);
        this.logRequest(req, 200, Date.now() - t0, dirPath || '/', null);
      }
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
    // All messages are JSON: { type: 'reload' } or { type: 'css', href: '/path/file.css' }
    // CSS changes hot-swap the stylesheet href — no full page reload needed.
    // Exponential back-off reconnect: prevents infinite page reload when
    // the server stops. Reloads once cleanly when the server comes back.
    return `<script>
(function () {
  var WS_URL  = 'ws://' + location.host;
  var retries = 0;
  var MAX     = 20;

  function connect() {
    var ws = new WebSocket(WS_URL);

    ws.onopen = function () { retries = 0; };

    ws.onmessage = function (e) {
      var msg;
      try { msg = JSON.parse(e.data); } catch (_) { return; }

      if (msg.type === 'reload') {
        location.reload();

      } else if (msg.type === 'css') {
        // Hot-swap: update only the changed stylesheet, no page reload
        var links = document.querySelectorAll('link[rel="stylesheet"]');
        var refreshed = false;
        links.forEach(function (link) {
          var href = (link.getAttribute('href') || '').split('?')[0];
          if (href === msg.href || href.endsWith(msg.href)) {
            link.href = href + '?t=' + Date.now();
            refreshed = true;
          }
        });
        // Fallback: refresh all stylesheets if no specific href matched
        if (!refreshed) {
          links.forEach(function (link) {
            var href = (link.getAttribute('href') || '').split('?')[0];
            link.href = href + '?t=' + Date.now();
          });
        }
      }
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
    // Build ignored list — always exclude dotfiles, plus any user-supplied patterns
    const ignored = [/(^|[/\\])\../];
    if (this.ignore) {
      const patterns = Array.isArray(this.ignore)
        ? this.ignore
        : this.ignore.split(',').map(p => p.trim()).filter(Boolean);
      ignored.push(...patterns);
    }

    this.watcher = chokidar.watch(this.root, {
      ignored,
      persistent:    true,
      ignoreInitial: true,
    });

    this.watcher
      // Use `filePath` to avoid shadowing the `path` module variable
      .on('change', (filePath) => {
        const url = relUrl(this.root, filePath);
        this.log(`  ${ts()}  ${label(A.yellow, 'changed')}  ${paint(A.white, url)}`);
        // CSS files: hot-swap without a page reload. Everything else: full reload.
        if (path.extname(filePath).toLowerCase() === '.css') {
          this.hotSwapCss(url);
        } else {
          this.scheduleReload();
        }
      })
      .on('add', (filePath) => {
        this.log(`  ${ts()}  ${label(A.green, 'added')}  ${paint(A.white, relUrl(this.root, filePath))}`);
        this.scheduleReload();
      })
      .on('unlink', (filePath) => {
        this.log(`  ${ts()}  ${label(A.red, 'removed')}  ${paint(A.white, relUrl(this.root, filePath))}`);
        this.scheduleReload();
      });
  }

  // ─── Debounced full-page reload ───────────────────────────────────────────────
  // Aggregates rapid file saves (e.g. formatters touching many files at once)
  // into a single reload signal after `this.wait` milliseconds of silence.
  scheduleReload() {
    clearTimeout(this._reloadTimer);
    this._reloadTimer = setTimeout(() => {
      this.reloadClients();
    }, this.wait);
  }

  // ─── Broadcast full-page reload to all connected clients ─────────────────────
  reloadClients() {
    const msg = JSON.stringify({ type: 'reload' });
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  }

  // ─── Broadcast CSS hot-swap to all connected clients (debounced per href) ─────
  hotSwapCss(href) {
    clearTimeout(this._cssTimers.get(href));
    this._cssTimers.set(href, setTimeout(() => {
      this._cssTimers.delete(href);
      const msg = JSON.stringify({ type: 'css', href });
      this.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      });
    }, this.wait));
  }

  openBrowser(url) {
    const platform = process.platform;
    const command  = platform === 'darwin' ? 'open'
                   : platform === 'win32'  ? 'start'
                   :                         'xdg-open';

    exec(`${command} ${url}`, (err) => {
      if (err) {
        this.log(`  ${paint(A.yellow, 'warn')}    could not open browser  ·  visit ${url}`);
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
