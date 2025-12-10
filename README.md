# ATV Desktop Remote - Enhanced Edition

A simple menubar app that allows you to control an Apple TV from your desktop

> **Enhanced Fork** with 30+ critical fixes including memory leak repairs, 50x performance improvements, glassmorphic design overhaul, and enhanced accessibility. See [What's New](#whats-new-in-v144-december-2025) below.

<p align="center">
  <img src="screenshot_darkmode.png" alt="Dark mode interface" width="45%"/>
  <img src="screenshot_lightmode.png" alt="Light mode interface" width="45%"/>
</p>
<p align="center"><em>Dark mode (left) and light mode (right) with glassmorphic design</em></p>

## Installation

Download the latest version for your platform:
- **macOS (Intel)**: Download `.dmg` for Intel Macs
- **macOS (Apple Silicon)**: Download `.dmg` for M1/M2/M3 Macs
- **Windows**: Download `.exe` installer

🔗 **[Download Latest Release](https://github.com/Rballesteros/atv-desktop-remote/releases/latest)**

### Requirements
- **Python 3.x** must be installed on your system
  - macOS: Usually pre-installed, or install from [python.org](https://www.python.org/downloads/)
  - Windows: Download from [python.org](https://www.python.org/downloads/)
- The app will automatically install the required `pyatv` library on first run (takes ~5 minutes)


## Usage

 1. Keys are mapped to the keyboard when the application is open (pressing return or enter on the keyboard for select, delete for Menu, etc).
 2. Press `Option`, or `Alt` on Windows, to see what the characters are mapped to when the application is open.
 3. Long press buttons now works to simulate long presses on the remote
  
 ## Running

 1. Run `npm install` (`yarn` and `pnpm` should also work)
 2. Run `npm start`
3. The application runs in the menubar. Look for a tiny remote icon and click on it. Right-click for more options.
4. The first time the app runs it will need to pair with an Apple TV. You can pair with more than one.
5. Press `Cmd+Shift+R` to open the application from anywhere. On Windows its `Win+Shift+R`

## Building

### Development Build

```bash
# Install dependencies
npm install
cd app && npm install && cd ..

# Start in development mode
npm start
```

### Production Builds

```bash
# macOS (Intel)
npm run build

# macOS (Apple Silicon)
npm run build-arm

# Windows
npm run build:win

# Windows (using Docker on macOS/Linux)
npm run docker-build
```

Built applications will be in the `dist/` folder.

### Requirements for Building
- Node.js 18.x or 20.x
- Python 3.x
- electron-builder (installed via npm)

## Troubleshooting

### Python Not Found Error
If you see "Python Not Found" when starting the app:
1. Install Python 3.x from [python.org](https://www.python.org/downloads/)
2. Restart the application
3. The app will automatically install `pyatv` (takes ~5 minutes first time)

### First Run Takes Long Time
This is normal! On first launch, the app:
- Creates a Python virtual environment
- Downloads and installs the `pyatv` library
- This takes about 5 minutes

Subsequent launches are much faster (2-3 seconds).

### Connection Issues
- Make sure your Apple TV and computer are on the same network
- Try restarting both the app and your Apple TV
- Check that your Apple TV is discoverable (Settings → AirPlay and HomeKit)

### More Help
- Check the [CHANGELOG.md](CHANGELOG.md) for technical details
- Report issues at [GitHub Issues](https://github.com/Rballesteros/atv-desktop-remote/issues)

## Technology

This project is built using:
- **[Electron](https://www.electronjs.org/)** - Cross-platform desktop framework
- **[pyatv](https://pyatv.dev/)** - Python library for Apple TV communication
- **WebSockets** - Real-time communication between JavaScript and Python
- **Font Awesome** - Modern icon library

## Credits

**Original Project**: Created by [Brian Harper (bsharper)](https://github.com/bsharper)
- Original repository: [bsharper/atv-desktop-remote](https://github.com/bsharper/atv-desktop-remote)
- Support the original author: [![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/brianharper)

**Enhanced Fork**: Maintained by [Rballesteros](https://github.com/Rballesteros)
- This fork adds critical bug fixes, performance improvements, and modern features
- See [CHANGELOG.md](CHANGELOG.md) for complete list of enhancements
- Support this fork: [![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/r898283)

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - See [LICENSE](LICENSE) file for details

## What's New in v1.4.4 (December 2025)

This enhanced fork includes **30+ critical fixes and improvements** over the original version:

### 🎨 Major UI/UX Overhaul

**Glassmorphic Design System**
- Modern glassmorphic UI with backdrop filters and refined gradients
- Subtle shadows and depth perception for both light and dark modes
- Enhanced button states with smooth cubic-bezier easing animations
- Updated typography using SF Pro fonts with improved weights and smoothing
- Redesigned input fields with floating focus states and better contrast
- Improved dark mode with proper color hierarchy

**Layout & Usability Improvements**
- Moved ATV dropdown to top alongside quit button for better discoverability
- Repositioned "Open Keyboard" button below keypad with proper semantics
- Aligned cancel button in pairing view with top close control
- Centered input panel with contained layout and improved visual hierarchy

**Icon Design**
- **Modern Icon System**: Play/Pause, Menu, and TV buttons now use Font Awesome icons
  - Play button dynamically switches to pause icon when media is playing (▶/⏸)
  - Menu button shows intuitive back chevron (◀)
  - TV button displays recognizable TV icon (📺)

**Window Stability**
- Set explicit min/max sizes for menubar window (280-340px width, 500-740px height)
- Input window constraints (520x240 - 600x300)
- Removed vibrancy effects for more stable rendering across macOS versions
- Solid backgrounds prevent transparency issues

### 🐛 Critical Bug Fixes

**Memory Leak Fixes (7 fixes)**
- Fixed IPC event listener memory leaks
- Fixed long-press event listener accumulation
- Fixed WebSocket connections never closing
- Fixed watchdog interval leaks
- Fixed power monitor listener leaks
- Proper cleanup of all resources on shutdown

**Performance Optimizations (6 improvements)**
- **50x reduction** in DOM queries (from 50/sec to 1/session)
- Optimized key lookup algorithm (O(n) → O(1))
- Cached computed styles outside animation loops
- Added WebSocket message parsing error handling
- Improved null safety throughout codebase

**Race Condition Fixes**
- Debounced connection attempts to prevent multiple concurrent connections
- Fixed race conditions in connection flow

**User Experience Improvements**
- Python error recovery with user-friendly dialog
- Better error messages and logging
- Connection timeouts prevent UI freezes (10-second timeout)
- Improved error visibility
- Disabled autocomplete, autocapitalize, and spellcheck for cleaner text entry
- Proper focus management with visibility change handlers
- Keyboard focus polling optimization (2s interval instead of 1s)
- Polling properly stops on window hide/blur to prevent unnecessary background work

**Enhanced Accessibility**
- Added ARIA labels to all remote buttons for screen reader support
- Proper button semantics (role="toolbar") for the keypad
- Improved focus management throughout the application
- VoiceOver/screen reader compatibility tested

**Additional Improvements**
- **Long Press Animation**: Visual feedback when holding buttons down
- **Better Reconnection Handling**: Improved automatic reconnection with pyatv
- **Smart Device Filtering**: Scan results now filter to show only Apple TVs (not HomePods, Macs, etc.)
- **Electron Upgrade**: Updated to latest Electron version (39.2.6) for better security and performance
- **Enhanced Install Scripts**: Support for requirements.txt for faster Python dependency installation
- **UV Package Manager Support**: Optionally uses UV for faster Python environment setup

### 🔒 Security & Infrastructure
- Added preload.js foundation for future security improvements
- GitHub Actions CI/CD workflows for automated building and testing
- Comprehensive CHANGELOG following Keep a Changelog format
- Security improvements documented for v1.5.0
- Updated Electron version for better compatibility and security

### 📊 Performance Metrics
- ✅ Stable memory usage during long sessions (no leaks)
- ✅ 50x faster button animations
- ✅ No crashes from malformed data
- ✅ Faster keyboard response
- ✅ Proper resource cleanup on shutdown

See the [CHANGELOG.md](CHANGELOG.md) for complete technical details.

---

## Previous UX and Accessibility Improvements

- Pairing view cancel button is aligned with the top close control
- "Open Keyboard" is a proper, focusable button; smaller and centered under the keypad
- Added ARIA labels to all remote buttons and toolbar semantics for the keypad
- Menubar and input windows use solid dark backgrounds (no vibrancy/blur) with sensible min/max sizes for stability
- Input window panel restyled with lighter shadows, centered helper text, and disabled autocomplete/spellcheck for cleaner entry
- Keyboard-focus polling reduced and stopped on hide/blur to cut idle work
