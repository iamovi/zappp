const http = require('http');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const chokidar = require('chokidar');
const WebSocket = require('ws');
const { exec } = require('child_process');

class Server {
  constructor(options = {}) {
    this.root = options.root || process.cwd();
    this.port = options.port || 3000;
    this.host = options.host || '0.0.0.0';
    this.open = options.open || false;
    this.clients = new Set();
    this.server = null;
    this.wss = null;
    this.watcher = null;
  }

  start() {
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
      const localUrl = `http://localhost:${this.port}`;
      const networkUrl = this.host === '0.0.0.0' ? 
        `http://${this.getLocalIp()}:${this.port}` : 
        `http://${this.host}:${this.port}`;

      console.log('\n🚀 Zappp Server Started!\n');
      console.log(`  Local:   ${localUrl}`);
      console.log(`  Network: ${networkUrl}`);
      console.log(`  Root:    ${this.root}\n`);
      console.log('Press Ctrl+C to stop\n');

      if (this.open) {
        this.openBrowser(localUrl);
      }
    });

    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Error: Port ${this.port} is already in use.`);
        console.error(`Try a different port with: zappp -p <port>\n`);
        process.exit(1);
      } else {
        console.error('\n❌ Server error:', err.message, '\n');
        process.exit(1);
      }
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n\n👋 Shutting down Zappp server...\n');
      this.stop();
      process.exit(0);
    });
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

    // Security: prevent directory traversal
    if (!absolutePath.startsWith(this.root)) {
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
        
        fs.stat(absolutePath, (err, stats) => {
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
    const ext = path.extname(filePath);
    const contentType = mime.lookup(filePath) || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
      if (err) {
        this.sendError(res, 500, 'Internal Server Error');
        return;
      }

      // Inject live reload script for HTML files
      if (ext === '.html') {
        const htmlStr = data.toString();
        const injectedHtml = this.injectLiveReload(htmlStr);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(injectedHtml);
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      }

      console.log(`📄 ${new Date().toLocaleTimeString()} - ${filePath}`);
    });
  }

  sendError(res, statusCode, message) {
    res.writeHead(statusCode, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${statusCode} ${message}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: #f5f5f5;
            }
            .error {
              text-align: center;
              padding: 2rem;
              background: white;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 { color: #e74c3c; margin: 0 0 0.5rem 0; }
            p { color: #666; margin: 0; }
          </style>
        </head>
        <body>
          <div class="error">
            <h1>${statusCode}</h1>
            <p>${message}</p>
          </div>
        </body>
      </html>
    `);
  }

  sendDirectoryListing(res, dirPath) {
    const absolutePath = path.join(this.root, dirPath);
    
    fs.readdir(absolutePath, { withFileTypes: true }, (err, entries) => {
      if (err) {
        this.sendError(res, 500, 'Internal Server Error');
        return;
      }

      const items = entries.map(entry => {
        const name = entry.name;
        const isDir = entry.isDirectory();
        const href = path.join(dirPath, name);
        return { name, isDir, href };
      }).sort((a, b) => {
        if (a.isDir === b.isDir) return a.name.localeCompare(b.name);
        return a.isDir ? -1 : 1;
      });

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Index of ${dirPath}</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                max-width: 900px;
                margin: 2rem auto;
                padding: 0 1rem;
                background: #f5f5f5;
              }
              h1 {
                color: #333;
                border-bottom: 2px solid #4CAF50;
                padding-bottom: 0.5rem;
              }
              ul {
                list-style: none;
                padding: 0;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              }
              li {
                border-bottom: 1px solid #eee;
              }
              li:last-child {
                border-bottom: none;
              }
              a {
                display: flex;
                align-items: center;
                padding: 1rem;
                text-decoration: none;
                color: #333;
                transition: background 0.2s;
              }
              a:hover {
                background: #f5f5f5;
              }
              .icon {
                margin-right: 0.75rem;
                font-size: 1.25rem;
              }
              .name {
                flex: 1;
              }
              .dir { color: #4CAF50; font-weight: 500; }
            </style>
          </head>
          <body>
            <h1>📁 Index of ${dirPath}</h1>
            <ul>
              ${dirPath !== '/' ? '<li><a href=".."><span class="icon">📁</span><span class="name dir">..</span></a></li>' : ''}
              ${items.map(item => `
                <li>
                  <a href="${item.href}">
                    <span class="icon">${item.isDir ? '📁' : '📄'}</span>
                    <span class="name ${item.isDir ? 'dir' : ''}">${item.name}</span>
                  </a>
                </li>
              `).join('')}
            </ul>
            ${this.getLiveReloadScript()}
          </body>
        </html>
      `;

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    });
  }

  injectLiveReload(html) {
    const script = this.getLiveReloadScript();
    
    // Try to inject before </body>
    if (html.includes('</body>')) {
      return html.replace('</body>', `${script}</body>`);
    }
    
    // Try to inject before </html>
    if (html.includes('</html>')) {
      return html.replace('</html>', `${script}</html>`);
    }
    
    // Otherwise append to end
    return html + script;
  }

  getLiveReloadScript() {
    return `
      <script>
        (function() {
          const ws = new WebSocket('ws://' + location.host);
          ws.onmessage = function(event) {
            if (event.data === 'reload') {
              console.log('🔄 Reloading page...');
              location.reload();
            }
          };
          ws.onclose = function() {
            console.log('❌ Live reload disconnected. Retrying...');
            setTimeout(() => location.reload(), 1000);
          };
          console.log('✅ Live reload connected');
        })();
      </script>
    `;
  }

  startWatcher() {
    this.watcher = chokidar.watch(this.root, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true
    });

    this.watcher
      .on('change', (path) => {
        console.log(`🔄 ${new Date().toLocaleTimeString()} - File changed: ${path}`);
        this.reloadClients();
      })
      .on('add', (path) => {
        console.log(`➕ ${new Date().toLocaleTimeString()} - File added: ${path}`);
        this.reloadClients();
      })
      .on('unlink', (path) => {
        console.log(`➖ ${new Date().toLocaleTimeString()} - File removed: ${path}`);
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
    const command = platform === 'darwin' ? 'open' :
                   platform === 'win32' ? 'start' : 'xdg-open';
    
    exec(`${command} ${url}`, (err) => {
      if (err) {
        console.log(`⚠️  Could not open browser automatically. Please visit: ${url}`);
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
    if (this.watcher) {
      this.watcher.close();
    }
    if (this.wss) {
      this.wss.close();
    }
    if (this.server) {
      this.server.close();
    }
  }
}

module.exports = Server;