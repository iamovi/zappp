**Zappp** is a simple, fast static file server with live reload and more.

<img src="https://ik.imagekit.io/iamovi/zappp_main" width="300">

## Features

- **Zero configuration** — run `zappp` and start serving immediately
- **Live reload** — watches files and reloads your browser on changes
- **Smart reconnect** — reconnects cleanly without infinite reload loops if the server stops
- **Modern dark UI** — clean, styled directory browser and error pages
- **Terminal output** — timestamped, colored, and emoji-free event logs
- **Network accessible** — displays both local and network URLs on startup
- **Automatic update alerts** — checks for new npm releases in the background
- **Security built-in** — robust directory traversal prevention

---

## Installation

### Global Installation (Recommended)

```bash
npm install -g zappp
```

### Local Installation

```bash
npm install zappp
```

### Use without installation 

```bash
npx zappp
```

---

## Usage

### Basic Usage

Navigate to your project directory and run:

```bash
zappp
```

This starts the server on `http://localhost:3000`.

### Command Line Options

```bash
# Start server in current directory (default port 3000)
zappp

# Start with a specific port
zappp -p 8080
zappp --port 8080

# Bind to a specific host
zappp --host 127.0.0.1

# Automatically open in your default browser
zappp -o
zappp --open

# Disable opening browser
zappp --no-browser

# Serve a specific directory
zappp ./public
zappp ../my-website

# Combine options
zappp ./dist -p 5000 -o
zappp --host 127.0.0.1 -p 8080 -o

# Show version and check for updates
zappp -v
zappp --version

# Show help
zappp -h
zappp --help
```

---

## Options Reference

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--port <number>` | `-p` | Port to listen on | `3000` |
| `--host <host>` | | Host to bind to | `0.0.0.0` |
| `--open` | `-o` | Open default browser on startup | `false` |
| `--no-browser` | | Do not open browser | `false` |
| `--version` | `-v` | Show version and check for updates | |
| `--help` | `-h` | Show help message | |

---

## How It Works

1. **Static File Serving**: Serves HTML, CSS, JS, images, fonts, and assets from your selected directory.
2. **WebSocket Live Reload**: Injects a lightweight reload client into served HTML pages.
3. **File Watching**: Uses `chokidar` to track file additions, edits, and deletions in real-time.
4. **Directory Listing**: Displays a clean, dark-mode file browser when a directory does not contain an `index.html`.

---

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

**Hasan Ovi**  
Email: [fornet.ovi@gmail.com](mailto:fornet.ovi@gmail.com)  
GitHub: [@iamovi](https://github.com/iamovi)

## Fun Facts

The name of this project *zappp* is inspired by the *Electro Wizard* character from Clash Royale!
