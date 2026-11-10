<img src="https://raw.githubusercontent.com/iamovi/zappp/refs/heads/main/main.png" width="100">

**Zappp** is a fast, modern static file server with live reload, CSS hot-swap, SPA support, and on-the-fly compression.

*Version: 1.2.0*

## Features

- **Zero configuration** — run `zappp` and start serving immediately
- **Live reload** — watches files and reloads your browser on changes
- **CSS hot-swap** — stylesheet changes apply instantly without a full page reload
- **SPA support** — `--spa` flag serves `index.html` for all 404s (React, Vue, Angular, Svelte)
- **Gzip compression** — compresses HTML, CSS, JS, and JSON automatically (on by default)
- **Range requests** — `<video>` and `<audio>` scrubbing works out of the box
- **CORS headers** — one flag to enable `Access-Control-Allow-Origin: *`
- **Config file** — persist options in `.zappprc.json`, no flags needed every time
- **Debounce** — aggregates rapid file saves into a single reload
- **Ignore patterns** — exclude folders or globs from the file watcher
- **Verbose mode** — log every request with status code and response time
- **Quiet mode** — zero output for CI and scripted setups
- **Smart reconnect** — exponential back-off prevents infinite reload loops
- **Modern dark UI** — clean, styled directory browser and error pages
- **Automatic update alerts** — checks for new releases in the background
- **Security built-in** — robust directory traversal prevention

---

## Installation

### Global (recommended)

```bash
npm install -g zappp
```

### Local

```bash
npm install zappp
```

### Without installing

```bash
npx zappp
```

---

## Usage

Navigate to your project directory and run:

```bash
zappp
```

Starts the server at `http://localhost:3000` with live reload and gzip enabled.

---

## Options

| Option | Alias | Description | Default |
|---|---|---|---|
| `--port <n>` | `-p` | Port to listen on | `3000` |
| `--host <h>` | | Host to bind to | `0.0.0.0` |
| `--open` | `-o` | Open browser on start | `false` |
| `--no-browser` | | Do not open browser | |
| `--spa` | | Serve `index.html` for all 404s | `false` |
| `--entry-file <f>` | `-e` | Custom SPA fallback file | |
| `--wait <ms>` | `-w` | Debounce delay before reload | `100` |
| `--cors` | | Enable CORS headers | `false` |
| `--ignore <globs>` | `-i` | Comma-separated patterns to ignore | |
| `--gzip` | | Enable gzip compression | on |
| `--no-gzip` | | Disable gzip compression | |
| `--verbose` | `-V` | Log every request with status + timing | `false` |
| `--quiet` | `-q` | Suppress all log output | `false` |
| `--version` | `-v` | Show version and check for updates | |
| `--help` | `-h` | Show help message | |

---

## Examples

```bash
# Serve current directory on port 3000
zappp

# Custom port, open browser automatically
zappp -p 8080 -o

# SPA mode — for React, Vue, Angular, Svelte
zappp --spa

# SPA on a specific dist folder
zappp ./dist --spa -p 5000

# Enable CORS for fetch/XHR requests
zappp --cors

# Verbose request log with status codes and timing
zappp -V

# Debounce 300ms, ignore scss and sourcemap files
zappp -w 300 -i "scss/**,*.map"

# Bind to localhost only
zappp --host 127.0.0.1

# Quiet mode (no output — good for scripts/CI)
zappp --quiet
```

---

## Config File

Create `.zappprc.json` in your project root to persist options — no need to type flags every time:

```json
{
  "port": 8080,
  "spa": true,
  "cors": true,
  "wait": 200,
  "ignore": "scss/**,*.map",
  "gzip": true
}
```

CLI flags always override the config file.

---

## How It Works

1. **Static File Serving** — serves HTML, CSS, JS, images, fonts, and any asset from your directory.
2. **CSS Hot-Swap** — `.css` changes are sent over WebSocket as a targeted swap signal. The browser updates only the changed stylesheet href — no page reload, no flicker.
3. **Full Live Reload** — non-CSS file changes trigger a debounced full-page reload via WebSocket.
4. **Gzip** — text responses are compressed with Node's built-in `zlib` when the browser sends `Accept-Encoding: gzip`. No extra dependencies.
5. **Range Requests** — supports `Accept-Ranges` / `206 Partial Content` for byte-range serving, enabling `<video>` and `<audio>` seeking.
6. **SPA Fallback** — when `--spa` is set, any 404 that isn't a real file is served the entry file instead, letting the client-side router take over.
7. **File Watching** — uses `chokidar` to track additions, edits, and deletions in real time.
8. **Directory Listing** — clean, dark-mode file browser when a directory has no `index.html`.

---

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

**Hasan Ovi**
Email: [fornet.ovi@gmail.com](mailto:fornet.ovi@gmail.com)
GitHub: [@iamovi](https://github.com/iamovi)
