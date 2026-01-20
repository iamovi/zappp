# Zappp ⚡

A simple, fast static file server with live reload functionality - a complete VS Code Live Server clone.

<img src="https://ik.imagekit.io/iamovi/zappp_main" width="300">

## Features

- 🚀 Zero configuration - just run `zappp`
- 🔄 Live reload on file changes
- 📁 Directory listing
- 🌐 Network accessible
- 🎨 Beautiful error pages
- 📦 Lightweight and fast
- 🔒 Security: prevents directory traversal attacks

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

## Usage

### Basic Usage

Navigate to your project folder and run:

```bash
zappp
```

This will start the server on `http://localhost:3000`

### Command Line Options

```bash
# Start server in current directory (default port 3000)
zappp

# Start with specific port
zappp -p 8080

zappp --port 8080

# Start with specific host
zappp -h 127.0.0.1

zappp --host 127.0.0.1

# Open browser automatically
zappp -o

zappp --open

# Don't open browser (default behavior)
zappp --no-browser

# Serve a specific directory
zappp path/to/folder

zappp ./public

zappp ../my-website

# Show help
zappp --help

# Combine options
zappp -p 8080 -o

zappp -port 8080 -open

zappp ./dist -p 5000 -o Serve dist folder on port 5000 and open browser

zappp -h 0.0.0.0 -p 8000 -o

# Version check & update
zappp -v or zappp --version

npm update -g zappp
```

### Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--port <number>` | `-p` | Port to use | 3000 |
| `--host <host>` | `-h` | Host to use | 0.0.0.0 |
| `--open` | `-o` | Open browser automatically | false |
| `--no-browser` | | Don't open browser | |
| `--help` | | Show help message | |

## How It Works

1. **Static File Serving**: Serves all static files (HTML, CSS, JS, images, etc.) from the current directory
2. **Live Reload**: Watches for file changes and automatically reloads the browser
3. **WebSocket Connection**: Uses WebSocket to communicate between server and browser
4. **Directory Listing**: Shows a beautiful directory listing when no index.html is found

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

Ovi ren

fornet.ovi@gmail.com

## Fun Facts

The name of this project *zappp* is actually inspired from *Electro Wizard* Character in Clash Royale!

<img src="https://ik.imagekit.io/iamovi/zappp" width="300">