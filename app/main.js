const { app, BrowserWindow, powerMonitor, Tray, Menu, nativeImage, globalShortcut, webContents } = require('electron')
var win;
const { ipcMain } = require('electron')
const path = require('path');
const menubar = require('menubar').menubar;
const util = require('util');
var secondWindow;
process.env['MYPATH'] = path.join(process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + "/.local/share"), "ATV Remote");
const lodash = _ = require('./js/lodash.min');
const server_runner = require('./server_runner')
const fs = require('fs');
server_runner.startServer();


global["server_runner"] = server_runner;

const preloadWindow = true;
const readyEvent = preloadWindow ? "ready" : "after-create-window";

const volumeButtons = ['VolumeUp', 'VolumeDown', 'VolumeMute']

var handleVolumeButtonsGlobal = false;

var mb;
var kbHasFocus;

console._log = console.log;
console.log = function() {
    let txt = util.format(...[].slice.call(arguments)) + '\n'
    process.stdout.write(txt);
    // Guard against destroyed window/webContents during shutdown
    if (!win) return;
    try {
        if (win.isDestroyed()) return;
        const wc = win.webContents;
        if (!wc || wc.isDestroyed()) return;
        wc.send('mainLog', txt);
    } catch (err) {
        // Avoid crashing on late log calls while tearing down.
        console._log('log-forwarding skipped (window destroyed)');
    }
}



const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
    app.quit()
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        console.log('second instance tried to open');
        showWindow();
    })
}
function createHotkeyWindow() {
    // Security Hardening Applied (v1.5.0)
    hotkeyWindow = new BrowserWindow({
        width: 500,
        height: 500,
        webPreferences: {
            nodeIntegration: false,
            enableRemoteModule: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });
    hotkeyWindow.loadFile('hotkey.html');
    hotkeyWindow.setMenu(null);
    hotkeyWindow.on('close', (event) => {
        event.preventDefault();
        hotkeyWindow.hide();
        registerHotkeys();
    });
}

function createInputWindow() {
    // Security Hardening Applied (v1.5.0)
    secondWindow = new BrowserWindow({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            sandbox: false, // Ensure full access for preload script
            preload: path.join(__dirname, 'preload.js')
        },
        show: false,
        width: 520,
        height: 260,
        minWidth: 320,
        minHeight: 200,
        maxWidth: 640,
        maxHeight: 320,
        minimizable: false,
        maximizable: false,
        transparent: false,
        backgroundColor: '#111111'
    });
    secondWindow.loadFile('input.html');
    secondWindow.on('close', (event) => {
        event.preventDefault();
        secondWindow.webContents.send('closeInputWindow');
        showWindowThrottle();
    });
    secondWindow.on("blur", () => {
        if (mb.window.isAlwaysOnTop()) return;
        showWindowThrottle();
    })
    secondWindow.setMenu(null);
    secondWindow.hide();
}

function createWindow() {
    const preloadPath = path.join(__dirname, 'preload.js');
    console.log("Preload path:", preloadPath);
    
    // Security Hardening Applied (v1.5.0)
    mb = menubar({
        dir: __dirname, // Ensure menubar looks in the correct directory
        preloadWindow: preloadWindow,
        showDockIcon: false,
        browserWindow: {
            width: 300,
            height: 450,
            minWidth: 280,
            minHeight: 380,
            alwaysOnTop: false,
            transparent: false,
            backgroundColor: '#111111',
            webPreferences: {
                nodeIntegration: false,
                enableRemoteModule: false,
                contextIsolation: true,
                sandbox: false, // Ensure full access for preload script
                preload: preloadPath
            }
        }
    })
    global['MB'] = mb;
    mb.on(readyEvent, () => {
        win = mb.window;
       
        var webContents = win.webContents;
        createInputWindow()
       

        win.on('close', () => {
            // Use original console.log during shutdown to avoid destroyed webContents
            console._log('window closed, quitting')
            app.exit();
        })
        win.on('show', () => {
            win.webContents.send('shortcutWin');
            if (handleVolumeButtonsGlobal) handleVolume();
        })

        win.on('hide', () => {
            if (handleVolumeButtonsGlobal) unhandleVolume();
        })

        win.webContents.on('will-navigate', (e, url) => {
            console.log(`will-navigate`, url);
        })
        ipcMain.on('input-change', (event, data) => {
            console.log('Received input:', data);
            win.webContents.send('input-change', data);
        });
        ipcMain.handle("loadHotkeyWindow", (event) => {
            createHotkeyWindow();
        })
        ipcMain.handle('debug', (event, arg) => {
            console.log(`ipcDebug: ${arg}`)
        })
        ipcMain.handle('quit', event => {
            server_runner.stopServer();
            app.exit()
        });
        ipcMain.handle('alwaysOnTop', (event, arg) => {
            var tf = arg == "true";
            console.log(`setting alwaysOnTop: ${tf}`)
            mb.window.setAlwaysOnTop(tf);
            
        })
        ipcMain.handle('uimode', (event, arg) => {
            secondWindow.webContents.send('uimode', arg);
        });


        ipcMain.handle('hideWindow', (event) => {
            console.log('hiding window');
            mb.hideWindow();
        });
        ipcMain.handle('isProduction', (event) => {
            return (!process.defaultApp);
        });
        ipcMain.handle('isWSRunning', (event, arg) => {
            console.log('isWSRunning');
            if (server_runner.isServerRunning()) win.webContents.send('wsserver_started')
        })
        
        ipcMain.handle('closeInputOpenRemote', (event, arg) => {
            console.log('closeInputOpenRemote');
            showWindow();
        })
        ipcMain.handle('openInputWindow', (event, arg) => {
            console.log('openInputWindow');
            secondWindow.show();
            secondWindow.webContents.send('openInputWindow');
        });
        ipcMain.handle('current-text', (event, arg) => {
            console.log('current-text', arg);
            secondWindow.webContents.send('current-text', arg);
        });
        ipcMain.handle('kbfocus-status', (event, arg) => {
            secondWindow.webContents.send('kbfocus-status', arg);
            kbHasFocus = arg;
        })
        ipcMain.handle('kbfocus', () => {
            win.webContents.send('kbfocus');
        })

        // --- Security Refactoring Handlers ---
        ipcMain.handle('show-message-box', async (event, options) => {
            const { dialog } = require('electron');
            return await dialog.showMessageBox(options);
        });

        ipcMain.handle('open-external', async (event, url) => {
            const { shell } = require('electron');
            return await shell.openExternal(url);
        });

        ipcMain.handle('get-hotkeys', (event) => {
            const hotkeyPath = path.join(process.env['MYPATH'], "hotkey.txt");
            if (fs.existsSync(hotkeyPath)) {
                return fs.readFileSync(hotkeyPath, {encoding: 'utf-8'}).trim();
            }
            return null;
        });

        ipcMain.handle('save-hotkeys', (event, hotkeys) => {
            const hotkeyPath = path.join(process.env['MYPATH'], "hotkey.txt");
            if (!hotkeys || hotkeys.length === 0) {
                if (fs.existsSync(hotkeyPath)) fs.unlinkSync(hotkeyPath);
            } else {
                fs.writeFileSync(hotkeyPath, hotkeys);
            }
            // Re-register immediately
            registerHotkeys();
            return true;
        });

        ipcMain.handle('resize-window', (event, width, height) => {
            const win = BrowserWindow.fromWebContents(event.sender);
            if (win) {
                const [currentWidth] = win.getContentSize();
                win.setContentSize(Math.max(currentWidth, width), height);
            }
        });

        ipcMain.handle('should-use-dark-colors', () => {
            const { nativeTheme } = require('electron');
            return nativeTheme.shouldUseDarkColors;
        });

        ipcMain.handle('hide-dock', () => {
            if (app.dock) app.dock.hide();
        });

        ipcMain.handle('show-window', () => {
            showWindow();
        });

        // Debugging logger from renderer
        ipcMain.on('log', (event, ...args) => {
            console.log('[RENDERER]', ...args);
        });
        
        ipcMain.handle('set-context-menu', (event, template) => {
            // Reconstruct the menu from the template sent by renderer
            // We need to map clicks back to IPC messages
            const buildMenu = (items) => {
                return items.map(item => {
                    if (item.type === 'separator') return { type: 'separator' };
                    
                    const menuItem = {
                        label: item.label,
                        type: item.type,
                        checked: item.checked,
                        role: item.role,
                        enabled: item.enabled
                    };

                    if (item.click) {
                        menuItem.click = () => {
                            event.sender.send('context-menu-click', item.id);
                        };
                    }
                    
                    if (item.submenu) {
                        menuItem.submenu = buildMenu(item.submenu);
                    }
                    
                    return menuItem;
                });
            };

            const menu = Menu.buildFromTemplate(buildMenu(template));
            mb.tray.popUpContextMenu(menu);
        });

        // Store listener references for cleanup
        var powerResumeHandler = event => {
            win.webContents.send('powerResume');
        };
        powerMonitor.addListener('resume', powerResumeHandler);

        var serverStartedHandler = () => {
            win.webContents.send("wsserver_started")
        };

        win.on('ready-to-show', () => {
            console.log('ready to show')
            if (server_runner.isServerRunning()) {
                win.webContents.send("wsserver_started")
            }
        })

        if (server_runner.isServerRunning()) {
            console.log(`server already running`)
            win.webContents.send("wsserver_started")
        } else {
            console.log(`server waiting for event`)
            server_runner.server_events.on("started", serverStartedHandler)
        }

        // Add cleanup when window closes
        win.on('closed', () => {
            // Use original console.log since webContents is destroyed at this point
            console._log('Cleaning up event listeners');
            powerMonitor.removeListener('resume', powerResumeHandler);
            server_runner.server_events.removeListener("started", serverStartedHandler);
        });
    })
}

function showWindow() {
    secondWindow.hide();
    try {
        app.show();
    } catch (err) {
        // This happens in Windows, doesn't seem to affect anything though
        console.log('app.show() error (non-critical on Windows):', err.message);
    }
    mb.showWindow();
    setTimeout(() => {
        mb.window.focus();
    }, 200);
}

var showWindowThrottle = lodash.throttle(showWindow, 100);

function hideWindow() {
    mb.hideWindow();
    try {
        app.hide();
    } catch (err) {
        // Not sure if this affects Windows like app.show does
        console.log('app.hide() error (possibly non-critical):', err.message);
    }
}

function getWorkingPath() {
    var rp = process.resourcesPath;
    if (!rp && process.argv.length > 1) rp = path.resolve(process.argv[1]);
    if (!app.isPackaged) {
        rp = path.resolve(`${path.dirname(process.argv[1])}/../atv_py_env`)
    }
    return rp
}

function unhandleVolume() {
    volumeButtons.forEach(btn => {
        console.log(`unregister: ${btn}`)
        globalShortcut.unregister(btn);
    })
}

function handleVolume() {
    volumeButtons.forEach(btn => {
        console.log(`register: ${btn}`)
        globalShortcut.register(btn, () => {
            var keys = {
                "VolumeUp": "volume_up",
                "VolumeDown": "volume_down",
                "VolumeMute": "volume_mute"
            }
            var key = keys[btn]
            console.log(`sending ${key} for ${btn}`)
            win.webContents.send('sendCommand', key);
        })
    })
}
function registerHotkeys() {
    var hotkeyPath = path.join(process.env['MYPATH'], "hotkey.txt")
    try {
        globalShortcut.unregisterAll();
    } catch (err) {
        console.log(`Error unregistering hotkeys: ${err}`)
    } 
    var registered = false;   
    if (fs.existsSync(hotkeyPath)) {
        
        var hotkeys = fs.readFileSync(hotkeyPath, {encoding: 'utf-8'}).trim();
        if (hotkeys.indexOf(",") > -1) {
            hotkeys = hotkeys.split(',').map(el => { return el.trim() });
        } else {
            hotkeys = [hotkeys];
        }
        console.log(`Registering custom hotkeys: ${hotkeys}`)
        var errs = hotkeys.map(hotkey => {
            console.log(`Registering hotkey: ${hotkey}`)
            return globalShortcut.register(hotkey, () => {
                if (mb.window.isVisible()) {
                    hideWindow();
                } else {
                    showWindow();
                }
                win.webContents.send('shortcutWin');
            })
        })
        var ret = errs.every(el => { return el });
        if (!ret) {
            errs.forEach((err, idx) => {
                if (!err) {
                    console.log(`Error registering hotkey: ${hotkeys[idx]}`)
                }
            })
            console.log(`Error registering hotkeys: ${hotkeys}`)
        } else {
            registered =true;
        }
    } 
    if (!registered) {
        globalShortcut.registerAll(['Super+Shift+R', 'Command+Control+R'], () => {
            if (mb.window.isVisible()) {
                hideWindow();
            } else {
                showWindow();
            }
            win.webContents.send('shortcutWin');
        })
    }
}

app.whenReady().then(() => {

    server_runner.testPythonExists().then(r => {
        console.log(`python exists: ${r}`)
    }).catch(err => {
        console.log(`python does not exist: ${err}`)
        // Show user-friendly error message when Python is not found
        const { dialog } = require('electron');
        dialog.showErrorBox(
            'Python Not Found',
            'Python is required to run this application but was not found on your system.\n\n' +
            'Please install Python 3 and restart the application.\n\n' +
            'Download from: https://www.python.org/downloads/'
        );
    })

    createWindow();
    registerHotkeys();
   
    var version = app.getVersion();
    app.setAboutPanelOptions({
        applicationName: "ATV Remote",
        applicationVersion: version,
        version: version,
        credits: "Brian Harper",
        copyright: "Copyright 2025",
        website: "https://github.com/bsharper",
        iconPath: "./images/full.png"
    });
})

app.on("before-quit", () => {
    server_runner.stopServer();
})

app.on('window-all-closed', () => {
    app.quit()
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})
