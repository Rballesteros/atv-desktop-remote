var atv_credentials = false;
var lodash = _ = require('./js/lodash.min');
var pairDevice = "";
var electron = require('electron');
var ipcRenderer = electron.ipcRenderer;
var nativeTheme;
var remote;
var dialog;
var resizeTimer;
// Initialize remote after document is ready
var mb;
var Menu, MenuItem
function initializeRemote() {
    try {
        remote = require('@electron/remote');
        nativeTheme = remote.nativeTheme;
        dialog = remote.dialog;
        Menu = remote.Menu;
        MenuItem = remote.MenuItem;
        mb = remote.getGlobal('MB');
        electron.remote = remote;
        return true;
    } catch (err) {
        console.error('Failed to initialize remote:', err);
        return false;
    }
}


const path = require('path');
// Removed: var device = false; // Dead code - never used
var qPresses = 0;
var currentlyPlaying = false; // Track play/pause state for button icon
var previousKeys = []

const ws_keymap = {
    "ArrowUp": "up",
    "ArrowDown": "down",
    "ArrowLeft": "left",
    "ArrowRight": "right",
    "t": "home",
    "l": "home_hold",
    "Backspace": "menu",
    "Escape": "menu",
    "Space": "play_pause",
    "Enter": "select",
    "Previous": "skip_backward",
    "Next": "skip_forward",
    "[": "skip_backward",
    "]": "skip_forward",
    "g": "top_menu",
    "+": "volume_up",
    "=": "volume_up",
    "-": "volume_down",
    "_": "volume_down"
}

const keymap = {
    'ArrowLeft': 'Left',
    'ArrowRight': 'Right',
    'ArrowUp': 'Up',
    'ArrowDown': 'Down',
    'Enter': 'Select',
    'Space': (latv) => {
        var v = latv.playing;
        latv.playing = !latv.playing;
        if (v) {
            return 'Pause';
        } else {
            return 'Play'
        }
    },
    'Backspace': 'Menu',
    'Escape': 'Menu',
    'Next': 'Next',
    'Previous': 'Previous',
    'n': 'Next',
    'p': 'Previous',
    ']': 'Next',
    '[': 'Previous',
    't': 'Tv',
    'l': 'LongTv'
}

const niceButtons = {
    "TV": "Tv",
    "play/pause": "play_pause",
    'Lower Volume': 'volume_down',
    'Raise Volume': 'volume_up'
}

const keyDesc = {
    'Space': 'Pause/Play',
    'ArrowLeft': 'left arrow',
    'ArrowRight': 'right arrow',
    'ArrowUp': 'up arrow',
    'ArrowDown': 'down arrow',
    'Backspace': 'Menu',
    'Escape': 'Menu',
    't': 'TV Button',
    'l': 'Long-press TV Button'
}
// Store handler references for cleanup
var ipcHandlers = {
    shortcutWin: null,
    scanDevicesResult: null,
    pairCredentials: null,
    gotStartPair: null,
    mainLog: null,
    powerResume: null,
    sendCommand: null,
    kbfocus: null,
    wsserver_started: null,
    inputChange: null
};

function initIPC() {
    // Remove existing listeners before adding new ones
    cleanupIPC();

    ipcHandlers.shortcutWin = (event) => {
        handleDarkMode();
        toggleAltText(true);
    };
    ipcRenderer.on('shortcutWin', ipcHandlers.shortcutWin);

    ipcHandlers.scanDevicesResult = (event, ks) => {
        createDropdown(ks);
    };
    ipcRenderer.on('scanDevicesResult', ipcHandlers.scanDevicesResult);

    ipcHandlers.pairCredentials = (event, arg) => {
        saveRemote(pairDevice, arg);
        localStorage.setItem('atvcreds', JSON.stringify(getCreds(pairDevice)));
        _connectToATV(); // Use debounced version to prevent race conditions
    };
    ipcRenderer.on('pairCredentials', ipcHandlers.pairCredentials);

    ipcHandlers.gotStartPair = () => {
        console.log('gotStartPair');
    };
    ipcRenderer.on('gotStartPair', ipcHandlers.gotStartPair);

    ipcHandlers.mainLog = (event, txt) => {
        console.log('[ main ] %s', txt.substring(0, txt.length - 1));
    };
    ipcRenderer.on('mainLog', ipcHandlers.mainLog);

    ipcHandlers.powerResume = (event, arg) => {
        _connectToATV(); // Use debounced version to prevent race conditions
    };
    ipcRenderer.on('powerResume', ipcHandlers.powerResume);

    ipcHandlers.sendCommand = (event, key) => {
        console.log(`sendCommand from main: ${key}`)
        sendCommand(key);
    };
    ipcRenderer.on('sendCommand', ipcHandlers.sendCommand);

    ipcHandlers.kbfocus = () => {
        sendMessage('kbfocus')
    };
    ipcRenderer.on('kbfocus', ipcHandlers.kbfocus);

    ipcHandlers.wsserver_started = () => {
        ws_server_started();
    };
    ipcRenderer.on('wsserver_started', ipcHandlers.wsserver_started);

    ipcHandlers.inputChange = (event, data) => {
        sendMessage("settext", {text: data});
    };
    ipcRenderer.on('input-change', ipcHandlers.inputChange);
}

// Cleanup function to remove IPC listeners
function cleanupIPC() {
    if (ipcHandlers.shortcutWin) {
        ipcRenderer.removeListener('shortcutWin', ipcHandlers.shortcutWin);
    }
    if (ipcHandlers.scanDevicesResult) {
        ipcRenderer.removeListener('scanDevicesResult', ipcHandlers.scanDevicesResult);
    }
    if (ipcHandlers.pairCredentials) {
        ipcRenderer.removeListener('pairCredentials', ipcHandlers.pairCredentials);
    }
    if (ipcHandlers.gotStartPair) {
        ipcRenderer.removeListener('gotStartPair', ipcHandlers.gotStartPair);
    }
    if (ipcHandlers.mainLog) {
        ipcRenderer.removeListener('mainLog', ipcHandlers.mainLog);
    }
    if (ipcHandlers.powerResume) {
        ipcRenderer.removeListener('powerResume', ipcHandlers.powerResume);
    }
    if (ipcHandlers.sendCommand) {
        ipcRenderer.removeListener('sendCommand', ipcHandlers.sendCommand);
    }
    if (ipcHandlers.kbfocus) {
        ipcRenderer.removeListener('kbfocus', ipcHandlers.kbfocus);
    }
    if (ipcHandlers.wsserver_started) {
        ipcRenderer.removeListener('wsserver_started', ipcHandlers.wsserver_started);
    }
    if (ipcHandlers.inputChange) {
        ipcRenderer.removeListener('input-change', ipcHandlers.inputChange);
    }
}

window.addEventListener('blur', e => {
    toggleAltText(true);
})

window.addEventListener('beforeunload', async e => {
    delete e['returnValue'];
    try {
        ipcRenderer.invoke('debug', 'beforeunload called')
        // Clean up WebSocket connection
        ws_cleanup();
        ipcRenderer.invoke('debug', 'WebSocket cleaned up')
    } catch (err) {
        console.log(err);
        //ipcRenderer.invoke('debug', `Error: ${err}`)
    }
});



function toggleAltText(tf) {
    //$("#topTextKBLink .keyTextAlt").width($("#topTextKBLink .keyText").width() + "px");
    if (tf) {
        $(".keyText").show();
        $(".keyTextAlt").hide();
    } else {
        $(".keyText").hide();
        $(".keyTextAlt").show();
    }
}

function resizeWindowToContent() {
    try {
        if (!remote) return;
        const currentWindow = remote.getCurrentWindow();
        if (!currentWindow) return;
        const contentWidth = Math.ceil(document.documentElement.scrollWidth);
        const contentHeight = Math.ceil(document.documentElement.scrollHeight);
        const [currentWidth] = currentWindow.getContentSize();
        currentWindow.setContentSize(Math.max(currentWidth, contentWidth), contentHeight);
    } catch (err) {
        console.log('resizeWindowToContent error', err);
    }
}

function scheduleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeWindowToContent, 120);
}

window.addEventListener('resize', scheduleResize);

function openKeyboardClick(event) {
    event.preventDefault();
    openKeyboard();
}

function openKeyboard() {
    ipcRenderer.invoke('openInputWindow')
    setTimeout(() => { // yes, this is done but it works
        sendMessage("gettext")
    }, 10)
}

window.addEventListener('keyup', e => {
    if (e.key == 'Alt') {
        toggleAltText(true);
    }
});

window.addEventListener('app-command', (e, cmd) => {
    console.log('app-command', e, cmd);
})

window.addEventListener('keydown', e => {
    //console.log(e);
    var key = e.key;
    if (key == ' ') key = 'Space';
    var mods = ["Control", "Shift", "Alt", "Option", "Fn", "Hyper", "OS", "Super", "Meta", "Win"].filter(mod => { return e.getModifierState(mod) })
    if (mods.length > 0 && mods[0] == 'Alt') {
        toggleAltText(false);
    }
    var shifted = false;
    if (mods.length == 1 && mods[0] == "Shift") {
        shifted = true;
        mods = []
    }
    if (mods.length > 0) return;

    if (key == 'q') {
        qPresses++;
        console.log(`qPresses ${qPresses}`)
        if (qPresses == 3) ipcRenderer.invoke('quit');
    } else {
        qPresses = 0;
    }
    if (key == 'h') {
        ipcRenderer.invoke('hideWindow');
    }
    if (key == 'k') {
        openKeyboard();
        return;
    }
    if (!isConnected()) {
        if ($("#pairCode").is(':focus') && key == 'Enter') {
            submitCode();
        }
        return;
    }
    if ($("#cancelPairing").is(":visible")) return;
    // Use 'in' operator for O(1) lookup instead of O(n) forEach
    if (key in ws_keymap) {
        sendCommand(key, shifted);
        e.preventDefault();
    }

})

function createDropdown(ks) {
    $("#loader").hide();
    var txt = "";
    $("#statusText").hide();
    //setStatus("Select a device");
    $("#pairingLoader").html("")
    $("#pairStepNum").html("1");
    $("#pairProtocolName").html("AirPort");
    $("#pairingElements").show();
    var ar = ks.map(el => {
        return {
            id: el,
            text: el
        }
    })
    ar.unshift({
        id: '',
        text: 'Select a device to pair'
    })
    $("#atv_picker").select2({
        data: ar,
        placeholder: 'Select a device to pair',
        dropdownAutoWidth: true,
        minimumResultsForSearch: Infinity
    }).on('change', () => {
        var vl = $("#atv_picker").val();
        if (vl) {
            pairDevice = vl;
            startPairing(vl);
        }
    })
}

function createATVDropdown() {
    $("#statusText").hide();
    var creds = JSON.parse(localStorage.getItem('remote_credentials') || "{}")
    var ks = Object.keys(creds);
    var atvc = localStorage.getItem('atvcreds')
    var selindex = 0;
    ks.forEach((k, i) => {
        var v = creds[k]
        if (JSON.stringify(v) == atvc) selindex = i;
    })

    var ar = ks.map((el, i) => {
        var obj = {
            id: el,
            text: el
        }
        if (i == selindex) {
            obj.selected = true;
        }
        return obj;
    })
    ar.unshift({
        id: 'addnew',
        text: 'Pair another remote'
    })
    var txt = "";
    txt += `<select id="remoteDropdown"></select>`
    $("#atvDropdownContainerTop").html(txt);
    $("#remoteDropdown").select2({
        data: ar,
        placeholder: 'Select a remote',
        dropdownAutoWidth: true,
        minimumResultsForSearch: Infinity
    })



    $("#remoteDropdown").on('change', () => {
        var vl = $("#remoteDropdown").val();
        if (vl) {
            if (vl == 'addnew') {
                startScan();
                return;
            } else {
                pairDevice = vl;
                localStorage.setItem('atvcreds', JSON.stringify(getCreds(vl)));
                _connectToATV(); // Use debounced version to prevent race conditions
            }
        }
    })
}

function showAndFade(text) {
    // Check if element exists before animating (performance optimization)
    var $cmdFade = $("#cmdFade");
    if ($cmdFade.length === 0) {
        console.log('showAndFade: #cmdFade element not found');
        return;
    }
    $cmdFade.html(text);
    $cmdFade.stop(true).fadeOut(0).css({ "visibility": "visible" }).fadeIn(100).delay(400).fadeOut(200, function() {
        $(this).css({ "display": "flex", "visibility": "hidden" });
    });
}

function _updatePlayState() {
    // Update play/pause button icon based on current state
    var icon = (currentlyPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>')
    var label = (currentlyPlaying ? "Pause" : "Play")
    console.log(`Update play state: ${label}`)
    $(`[data-key="play_pause"] .keyText`).html(icon);
}

var updatePlayState = lodash.debounce(_updatePlayState, 300);

async function sendCommand(k, shifted) {
    if (typeof shifted === 'undefined') shifted = false;
    console.log(`sendCommand: ${k}`)
    if (k == 'Pause') k = 'Space';

    // Map keyboard key to command, or if k is already a command (e.g., from button click), use it directly
    var rcmd = ws_keymap[k];
    if (!rcmd && Object.values(ws_keymap).indexOf(k) > -1) {
        // k is not a key in the map, but is a value (command name) - use it directly
        rcmd = k;
    }
    if (!rcmd) {
        console.warn(`Unknown command: ${k}`);
        return;
    }

    var classkey = rcmd;
    if (classkey == 'Play') classkey = 'Pause';
    var el = $(`[data-key="${classkey}"]`)
    if (el.length > 0) {
        el.addClass('invert');
        setTimeout(() => {
            el.removeClass('invert');
        }, 150);
    }
    // Toggle play state for both keyboard (Space) and button clicks (play_pause)
    if (k == 'Space' || k == 'play_pause' || rcmd == 'play_pause') {
        currentlyPlaying = !currentlyPlaying;
        updatePlayState();
    }
    console.log(`Keydown: ${k}, sending command: ${rcmd} (shifted: ${shifted})`)
    previousKeys.push(rcmd);
    if (previousKeys.length > 10) previousKeys.shift()
    var desc = rcmd;
    if (desc == 'volume_down') desc = 'Lower Volume'
    if (desc == 'volume_up') desc = 'Raise Volume'
    if (desc == 'play_pause') desc = "play/pause"
    if (desc == 'Tv') desc = 'TV'
    if (desc == 'LongTv') desc = 'TV long press'
    showAndFade(desc);
    if (shifted) {
        ws_sendCommandAction(rcmd, "Hold")
    } else {
        ws_sendCommand(rcmd)
    }
}

function getWorkingPath() {
    return path.join(process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + "/.local/share"), "ATV Remote");
}

function isConnected() {
    return atv_connected
        //return !!(device && device.connection)
}

async function askQuestion(msg) {
    let options = {
        buttons: ["No", "Yes"],
        message: msg
    }
    var response = await dialog.showMessageBox(options)
    console.log(response)
    return response.response == 1
}


function startPairing(dev) {
    // atv_connected state is managed by ws_remote.js through events
    $("#initText").hide();
    //setStatus("Enter the pairing code");
    $("#results").hide();
    $("#pairButton").on('click', () => {
        submitCode();
        return false;
    });
    $("#pairCodeElements").show();
    //ipcRenderer.invoke('startPair', dev);
    ws_startPair(dev);
}

function submitCode() {
    var code = $("#pairCode").val();
    $("#pairCode").val("");
    //ipcRenderer.invoke('finishPair', code);
    if ($("#pairStepNum").text() == "1") {
        ws_finishPair1(code)
    } else {
        ws_finishPair2(code)
    }
}

// Move long press state objects to module scope to prevent memory leaks
var longPressTimers = {};
var longPressProgress = {};
var isLongPressing = {};

function cleanupLongPressState() {
    // Clear all existing timers and intervals
    Object.keys(longPressTimers).forEach(key => {
        if (longPressTimers[key]) {
            clearTimeout(longPressTimers[key]);
        }
    });
    Object.keys(longPressProgress).forEach(key => {
        if (longPressProgress[key]) {
            clearInterval(longPressProgress[key]);
        }
    });

    // Reset all state objects
    longPressTimers = {};
    longPressProgress = {};
    isLongPressing = {};
}

function showKeyMap() {
    $("#initText").hide();
    $(".directionTable").fadeIn();
    $("#atvDropdownContainerTop").show();
    $("#topTextKBLink").addClass('kb-visible');
    scheduleResize();

    // Clean up existing state before re-initializing
    cleanupLongPressState();

    // Initialize play state (assume not playing when first connected)
    currentlyPlaying = false;
    updatePlayState();

    $("[data-key]").off('mousedown mouseup mouseleave');
    
    $("[data-key]").on('mousedown', function(e) {
        var key = $(this).data('key');
        var $button = $(this);

        if (longPressTimers[key]) {
            clearTimeout(longPressTimers[key]);
            clearInterval(longPressProgress[key]);
        }

        var progressValue = 0;
        isLongPressing[key] = true;

        // Cache expensive DOM queries outside the interval (performance optimization)
        var computedStyle = window.getComputedStyle($button[0]);
        var bgColor = computedStyle.backgroundColor;

        if (bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
            var isDarkMode = $('body').hasClass('darkMode');
            bgColor = isDarkMode ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
        }

        $button.addClass('pressing');
        longPressProgress[key] = setInterval(() => {
            if (!isLongPressing[key]) return;

            progressValue += 2;
            var progressPercent = Math.min(progressValue, 100);
            var radiusPercent = 100 - progressPercent;

            // Use cached bgColor instead of querying DOM every 20ms
            $button.css('background', `radial-gradient(circle, transparent ${radiusPercent}%, ${bgColor} ${radiusPercent}%)`);

            var scale = 1 + (progressPercent * 0.001);
            $button.css('transform', `scale(${scale})`);

        }, 20); 

        longPressTimers[key] = setTimeout(() => {
            if (!isLongPressing[key]) return;

            clearInterval(longPressProgress[key]);

            $button.addClass('longpress-triggered');

            // Reuse cached bgColor instead of querying DOM again (performance optimization)
            $button.css('background', bgColor);
            
            console.log(`Long press triggered for: ${key}`);
            sendCommand(key, true); // true indicates long press
            
            isLongPressing[key] = false;
            
            setTimeout(() => {
                $button.removeClass('pressing longpress-triggered');
                $button.css({
                    'background': '',
                    'transform': ''
                });
            }, 200);
            
        }, 1000); // 1 second for long press
    });
    
    $("[data-key]").on('mouseup mouseleave', function(e) {
        var key = $(this).data('key');
        var $button = $(this);
        
        // If we're not in a long press state, this is a regular click
        if (isLongPressing[key]) {
            
            if (longPressTimers[key]) {
                clearTimeout(longPressTimers[key]);
                longPressTimers[key] = null;
            }
            if (longPressProgress[key]) {
                clearInterval(longPressProgress[key]);
                longPressProgress[key] = null;
            }
            
            // Reset state
            isLongPressing[key] = false;
            
            // Reset styles
            $button.removeClass('pressing');
            $button.css({
                'background': '',
                'transform': ''
            });
            
            
            if (e.type === 'mouseup') {
                console.log(`Regular click for: ${key}`);
                sendCommand(key, false); // false = "not shifted" = regular click
            }
        }
    });
    
    var creds = _getCreds();
    if (Object.keys(creds).indexOf("Companion") > -1) {
        $("#topTextHeader").hide();
        $("#topTextKBLink").addClass('kb-visible');
    } else {
        $("#topTextHeader").show();
        $("#topTextKBLink").removeClass('kb-visible');
    }
    scheduleResize();
}

var connecting = false;

// Dead code - handleMessage was never called, device was never initialized
// function handleMessage(msg) {
//     // Add null check to prevent runtime errors if device is not connected
//     if (!device) {
//         console.log('handleMessage: device not connected, ignoring message');
//         return;
//     }
//     device.lastMessages.push(JSON.parse(JSON.stringify(msg)));
//     while (device.lastMessages.length > 100) device.lastMessages.shift();
//     if (msg.type == 4) {
//         try {
//             device.bundleIdentifier = msg.payload.playerPath.client.bundleIdentifier;
//             var els = device.bundleIdentifier.split('.')
//             var nm = els[els.length - 1];
//         } catch (err) {}
//         if (msg && msg.payload && msg.payload.playbackState) {
//             device.playing = msg.payload.playbackState == 1;
//             device.lastMessage = JSON.parse(JSON.stringify(msg))
//             _updatePlayState();
//         }
//         if (msg && msg.payload && msg.payload.playbackQueue && msg.payload.playbackQueue.contentItems && msg.payload.playbackQueue.contentItems.length > 0) {
//             console.log('got playback item');
//             device.playbackItem = JSON.parse(JSON.stringify(msg.payload.playbackQueue.contentItems[0]));
//         }
//     }
// }

async function connectToATV() {
    if (connecting) return;
    connecting = true;
    try {
        setStatus("Connecting to ATV...");
        $("#runningElements").show();
        atv_credentials = JSON.parse(localStorage.getItem('atvcreds'))

        $("#pairingElements").hide();

        await ws_connect(atv_credentials);
        createATVDropdown();
        showKeyMap();
    } finally {
        // Always reset connecting flag, even if connection fails
        connecting = false;
    }
}

var _connectToATV = lodash.debounce(connectToATV, 300);

function saveRemote(name, creds) {
    var ar = JSON.parse(localStorage.getItem('remote_credentials') || "{}")
    if (typeof creds == 'string') creds = JSON.parse(creds);
    ar[name] = creds;
    localStorage.setItem('remote_credentials', JSON.stringify(ar));
}

function setStatus(txt) {
    $("#statusText").html(txt).show();
}

function startScan() {
    $("#initText").hide();
    $("#loader").fadeIn();
    $("#topTextKBLink").removeClass('kb-visible');
    $("#atvDropdownContainerTop").hide();
    $("#addNewElements").show();
    $("#runningElements").hide();
    //mb.showWindow();
    $("#atvDropdownContainerTop").html("");
    setStatus("Please wait, scanning...")
    $("#pairingLoader").html(getLoader());
    //ipcRenderer.invoke('scanDevices');
    ws_startScan();
    scheduleResize();
}

function shouldEnableDarkMode() {
    var uimode = localStorage.getItem("uimode") || "systemmode";
    var alwaysUseDarkMode = (uimode == "darkmode");
    var neverUseDarkMode = (uimode == "lightmode");

    if (alwaysUseDarkMode) return true;
    if (neverUseDarkMode) return false;

    try {
        if (nativeTheme) {
            return nativeTheme.shouldUseDarkColors;
        }
        if (window.matchMedia) {
            return window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
    } catch (err) {
        console.log('Error checking system theme:', err);
    }
    return false;
}

function applyPreferredTheme() {
    var darkModeEnabled = shouldEnableDarkMode();
    if (darkModeEnabled) {
        $("body").addClass("darkMode");
        $("#s2style-sheet").attr('href', 'css/select2-inverted.css')
    } else {
        $("body").removeClass("darkMode");
        $("#s2style-sheet").attr('href', 'css/select2.min.css')
    }
    return darkModeEnabled;
}

function handleDarkMode() {
    try {
        var darkModeEnabled = applyPreferredTheme();
        ipcRenderer.invoke('uimode', darkModeEnabled ? 'darkmode' : 'lightmode');
    } catch (err) {
        console.log('Error setting dark mode:', err);
    }
}

function _getCreds(nm) {
    var creds = JSON.parse(localStorage.getItem('remote_credentials') || "{}")
    var ks = Object.keys(creds);
    if (ks.length === 0) {
        return {};
    }
    if (typeof nm == 'undefined' && ks.length > 0) {
        return creds[ks[0]]
    } else {
        if (Object.keys(creds).indexOf(nm) > -1) {
            localStorage.setItem('currentDeviceID', nm)
            return creds[nm];
        }
    }
}

function getCreds(nm) {
    var r = _getCreds(nm);
    var maxIterations = 10;
    var iterations = 0;
    while (typeof r == 'string' && iterations < maxIterations) {
        try {
            r = JSON.parse(r);
            iterations++;
        } catch (e) {
            console.error('Error parsing credentials:', e);
            return {};
        }
    }
    if (iterations >= maxIterations) {
        console.error('Credentials string parsing depth exceeded');
        return {};
    }
    return r;
}

function setAlwaysOnTop(tf) {
    console.log(`setAlwaysOnTop(${tf})`)
    ipcRenderer.invoke('alwaysOnTop', String(tf));
}

function alwaysOnTopToggle() {
    var cd = $("#alwaysOnTopCheck").prop('checked')
    localStorage.setItem('alwaysOnTopChecked', cd);
    setAlwaysOnTop(cd);
}

var lastMenuEvent;

function subMenuClick(event) {
    var mode = event.id;
    localStorage.setItem('uimode', mode);
    lastMenuEvent = event;
    event.menu.items.forEach(el => {
        el.checked = el.id == mode;
    })
    setTimeout(() => {
        handleDarkMode();
    }, 1);

    console.log(event);
}

async function confirmExit() {
    remote.app.quit();
}

function changeHotkeyClick (event) {
    ipcRenderer.invoke('loadHotkeyWindow');
}

function handleContextMenu() {
    let tray = mb.tray
    var mode = localStorage.getItem('uimode') || 'systemmode';

    const subMenu = Menu.buildFromTemplate([
        { type: 'checkbox', id: 'systemmode', click: subMenuClick, label: 'Follow system settings', checked: (mode == "systemmode") },
        { type: 'checkbox', id: 'darkmode', click: subMenuClick, label: 'Dark mode', checked: (mode == "darkmode") },
        { type: 'checkbox', id: 'lightmode', click: subMenuClick, label: 'Light mode', checked: (mode == "lightmode") }
    ])

    var topChecked = JSON.parse(localStorage.getItem('alwaysOnTopChecked') || "false")
    const contextMenu = Menu.buildFromTemplate([
        { type: 'checkbox', label: 'Always on-top', click: toggleAlwaysOnTop, checked: topChecked },
        { type: 'separator' },
        { role: 'about', label: 'About' },
        { type: 'separator' },
        { label: 'Appearance', submenu: subMenu, click: subMenuClick },
        { label: 'Change hotkey', click: changeHotkeyClick },
        { type: 'separator' },
        { label: 'Quit', click: confirmExit }
    ]);
    tray.removeAllListeners('right-click');
    tray.on('right-click', () => {
        mb.tray.popUpContextMenu(contextMenu);
    })
}

function toggleAlwaysOnTop(event) {
    localStorage.setItem('alwaysOnTopChecked', String(event.checked));
    ipcRenderer.invoke('alwaysOnTop', String(event.checked));
}

async function helpMessage() {
    await dialog.showMessageBox({ type: 'info', title: 'Howdy!', message: 'Thanks for using this program!\nAfter pairing with an Apple TV (one time process), you will see the remote layout.\n\nEvery button is mapped to the keyboard, press and hold the "Option" key to see which key does what.\n\n To open this program, press Command+Shift+R (pressing this again will close it). Also right-clicking the icon in the menu will show additional options.' })
}

function timeoutAsync(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Modify the init function to handle remote initialization
async function init() {
    if (!initializeRemote()) {
        console.log('Remote not ready, retrying in 100ms...');
        await timeoutAsync(100);
        return await init();
    }
    addThemeListener();
    handleDarkMode();
    handleContextMenu();
    $("#exitLink").on('click', () => {
        $("#exitLink").blur();
        setTimeout(() => {
                confirmExit();
            }, 1)
            //electron.remote.app.quit();
    })
    $("#cancelPairing").on('click', () => {
        console.log('cancelling');
        window.location.reload();
    })

    var checked = JSON.parse(localStorage.getItem('alwaysOnTopChecked') || "false")
    if (checked) setAlwaysOnTop(checked);

    var creds;
    try {
        creds = JSON.parse(localStorage.getItem('atvcreds') || "false")
    } catch {
        creds = getCreds();
        if (creds) localStorage.setItem('atvcreds', JSON.stringify(creds));
    }
    if (localStorage.getItem('firstRun') != 'false') {
        localStorage.setItem('firstRun', 'false');
        await helpMessage();
        mb.showWindow();
    }

    if (creds && creds.credentials && creds.identifier) {
        atv_credentials = creds;
        _connectToATV(); // Use debounced version to prevent race conditions
    } else {
        startScan();
    }
}

function hideAppMenus() {
    try {
        remote.app.dock.hide();
    } catch (err) {}
}

async function checkEnv() {
    var isProd = await ipcRenderer.invoke('isProduction')

    if (isProd) return hideAppMenus();

    // dev environment
    //remote.getCurrentWindow().webContents.toggleDevTools({ mode: 'detach' });

}

function themeUpdated() {
    console.log('theme style updated');
    handleDarkMode();
}
var tryThemeAddCount = 0;

function addThemeListener() {
    try {
        if (nativeTheme) {
            // Only remove the specific 'updated' listener to avoid affecting other listeners
            nativeTheme.removeListener('updated', themeUpdated);
            nativeTheme.on('updated', themeUpdated);
        }
    } catch (err) {
        console.log('nativeTheme not ready yet');
        setTimeout(() => {
            tryThemeAddCount++;
            if (tryThemeAddCount < 10) addThemeListener();
        }, 1000);
    }
}

$(function() {    
    applyPreferredTheme();
    initIPC();
    var wp = getWorkingPath();
    $("#workingPathSpan").html(`<strong>${wp}</strong>`);
    ipcRenderer.invoke('isWSRunning');
})
