var atv_credentials = false;
var lodash = window._;
var _ = lodash;

var pairDevice = "";
// Use the bridge
var electron = window.electron;
var ipcRenderer = electron; // Alias for compatibility with existing code

function log(...args) {
    if (electron && electron.log) {
        electron.log(...args);
    } else {
        console.log(...args);
    }
}

// Path via bridge
const path = window.node ? window.node.path : null;
var device = false;
var qPresses = 0;
var playstate = false;
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
        console.log('input-change received:', data);
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
        if (!device) return;
        device.removeAllListeners('message');
        ipcRenderer.invoke('debug', 'messages unregistered')
        await device.closeConnection()
        ipcRenderer.invoke('debug', 'connection closed')
    } catch (err) {
        console.log(err);
        //ipcRenderer.invoke('debug', `Error: ${err}`)
    }
});



function toggleAltText(tf) {
    if (tf) {
        $(".keyText").show();
        $(".keyTextAlt").hide();
    } else {
        $(".keyText").hide();
        $(".keyTextAlt").show();
    }
}

var resizeTimer = null;

function resizeWindowToContent() {
    try {
        const contentWidth = Math.ceil(document.documentElement.scrollWidth);
        const contentHeight = Math.ceil(document.documentElement.scrollHeight);
        ipcRenderer.invoke('resize-window', contentWidth, contentHeight);
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
    console.log('keydown: key=' + key + ', isConnected=' + isConnected() + ', atv_connected=' + atv_connected);
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
    var creds;
    try {
        creds = JSON.parse(localStorage.getItem('remote_credentials') || "{}");
    } catch (err) {
        log('createATVDropdown: Failed to parse credentials:', err);
        creds = {};
    }
    var ks = Object.keys(creds);
    var atvc = localStorage.getItem('atvcreds');
    var selindex = 0;
    ks.forEach((k, i) => {
        var v = creds[k];
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
    // Add null check to prevent runtime errors if device is not connected
    if (!device) {
        console.log('Update play state: device not connected');
        return;
    }
    // Use Font Awesome icons for play/pause instead of text
    var icon = (device.playing ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>')
    var label = (device.playing ? "Pause" : "Play")
    console.log(`Update play state: ${label}`)
    $(`[data-key="play_pause"] .keyText`).html(icon);
}

var updatePlayState = lodash.debounce(_updatePlayState, 300);

async function sendCommand(k, shifted) {
    if (typeof shifted === 'undefined') shifted = false;
    console.log(`sendCommand: ${k}`)
    if (k == 'Pause') k = 'Space';
    var rcmd = ws_keymap[k];
    if (Object.values(ws_keymap).indexOf(k) > -1) rcmd = k;
    if (typeof(rcmd) === 'function') rcmd = rcmd(device);

    var classkey = rcmd;
    if (classkey == 'Play') classkey = 'Pause';
    var el = $(`[data-key="${classkey}"]`)
    if (el.length > 0) {
        el.addClass('invert');
        setTimeout(() => {
            el.removeClass('invert');
        }, 150);
    }
    if (k == 'Space') {
        var pptxt = rcmd == "Pause" ? "Play" : "Pause";
        el.find('.keyText').html(pptxt);
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
    const env = window.node.env;
    const platform = window.node.platform;
    return path.join(env.APPDATA || (platform == 'darwin' ? env.HOME + '/Library/Application Support' : env.HOME + "/.local/share"), "ATV Remote");
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
    var response = await ipcRenderer.invoke('show-message-box', options)
    console.log(response)
    return response.response == 1
}


function startPairing(dev) {
    atv_connected = false;
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

function handleMessage(msg) {
    // Add null check to prevent runtime errors if device is not connected
    if (!device) {
        console.log('handleMessage: device not connected, ignoring message');
        return;
    }
    device.lastMessages.push(JSON.parse(JSON.stringify(msg)));
    while (device.lastMessages.length > 100) device.lastMessages.shift();
    if (msg.type == 4) {
        try {
            device.bundleIdentifier = msg.payload.playerPath.client.bundleIdentifier;
            var els = device.bundleIdentifier.split('.')
            var nm = els[els.length - 1];
        } catch (err) {}
        if (msg && msg.payload && msg.payload.playbackState) {
            device.playing = msg.payload.playbackState == 1;
            device.lastMessage = JSON.parse(JSON.stringify(msg))
            _updatePlayState();
        }
        if (msg && msg.payload && msg.payload.playbackQueue && msg.payload.playbackQueue.contentItems && msg.payload.playbackQueue.contentItems.length > 0) {
            console.log('got playback item');
            device.playbackItem = JSON.parse(JSON.stringify(msg.payload.playbackQueue.contentItems[0]));
        }
    }
}

async function connectToATV() {
    log('connectToATV called');
    if (connecting) return;
    connecting = true;
    setStatus("Connecting to ATV...");
    $("#runningElements").show();

    try {
        var atvcredsStr = localStorage.getItem('atvcreds');
        if (!atvcredsStr) {
            throw new Error('No credentials found');
        }
        atv_credentials = JSON.parse(atvcredsStr);
    } catch (err) {
        log('Failed to parse credentials:', err);
        connecting = false;
        startScan();
        return;
    }

    $("#pairingElements").hide();

    try {
        await ws_connect(atv_credentials);
        log('ws_connect succeeded, atv_connected =', atv_connected);
    } catch (err) {
        log('Connection failed:', err);
        setStatus("Connection failed. Scanning for devices...");
        connecting = false;
        startScan();
        return;
    }

    try {
        createATVDropdown();
        log('createATVDropdown succeeded');
    } catch (err) {
        log('createATVDropdown failed:', err);
    }

    try {
        showKeyMap();
        log('showKeyMap succeeded');
    } catch (err) {
        log('showKeyMap failed:', err);
    }

    connecting = false;
    log('connectToATV finished, atv_connected =', atv_connected);
}

var _connectToATV = lodash.debounce(connectToATV, 300);

function saveRemote(name, creds) {
    try {
        var ar = JSON.parse(localStorage.getItem('remote_credentials') || "{}");
        if (typeof creds == 'string') {
            creds = JSON.parse(creds);
        }
        ar[name] = creds;
        localStorage.setItem('remote_credentials', JSON.stringify(ar));
    } catch (err) {
        log('saveRemote: Failed to save credentials:', err);
    }
}

function setStatus(txt) {
    $("#statusText").html(txt).show();
}

function startScan() {
    log('startScan called');
    $("#initText").hide();
    log('#initText hidden');
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
    log('startScan finished');
}

function shouldEnableDarkMode() {
    var uimode = localStorage.getItem("uimode") || "systemmode";
    var alwaysUseDarkMode = (uimode == "darkmode");
    var neverUseDarkMode = (uimode == "lightmode");

    if (alwaysUseDarkMode) return true;
    if (neverUseDarkMode) return false;

    try {
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
    try {
        var creds = JSON.parse(localStorage.getItem('remote_credentials') || "{}");
        var ks = Object.keys(creds);
        if (ks.length === 0) {
            return {};
        }
        if (typeof nm == 'undefined' && ks.length > 0) {
            return creds[ks[0]];
        } else {
            if (Object.keys(creds).indexOf(nm) > -1) {
                localStorage.setItem('currentDeviceID', nm);
                return creds[nm];
            }
        }
        return {};
    } catch (err) {
        log('_getCreds: Failed to parse credentials:', err);
        return {};
    }
}

function getCreds(nm) {
    var r = _getCreds(nm);
    // Parse nested JSON strings with depth limit to prevent infinite loops
    var maxDepth = 5;
    var depth = 0;
    while (typeof r == 'string' && depth < maxDepth) {
        try {
            r = JSON.parse(r);
            depth++;
        } catch (err) {
            log('getCreds: Failed to parse credentials:', err);
            return {};
        }
    }
    if (depth >= maxDepth) {
        log('getCreds: Max parse depth reached, possible corrupt data');
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
    ipcRenderer.invoke('quit');
}

function changeHotkeyClick (event) {
    ipcRenderer.invoke('loadHotkeyWindow');
}

function handleContextMenu() {
    var mode = localStorage.getItem('uimode') || 'systemmode';
    var topChecked = JSON.parse(localStorage.getItem('alwaysOnTopChecked') || "false")

    // Define the menu template
    const template = [
        { label: 'Always on-top', type: 'checkbox', checked: topChecked, id: 'alwaysOnTop' },
        { type: 'separator' },
        { role: 'about', label: 'About' }, // 'role' might need main process handling if not standard
        { type: 'separator' },
        { 
            label: 'Appearance', 
            submenu: [
                { type: 'checkbox', id: 'systemmode', label: 'Follow system settings', checked: (mode == "systemmode") },
                { type: 'checkbox', id: 'darkmode', label: 'Dark mode', checked: (mode == "darkmode") },
                { type: 'checkbox', id: 'lightmode', label: 'Light mode', checked: (mode == "lightmode") }
            ] 
        },
        { label: 'Change hotkey', id: 'changeHotkey' },
        { type: 'separator' },
        { label: 'Quit', id: 'quit' }
    ];

    // Listen for clicks
    if (!window.contextMenuListenerAdded) {
        window.contextMenuListenerAdded = true;
        electron.onContextMenuClick((id) => {
            if (id === 'alwaysOnTop') {
                var newState = !JSON.parse(localStorage.getItem('alwaysOnTopChecked') || "false");
                toggleAlwaysOnTop({ checked: newState });
            } else if (id === 'quit') {
                confirmExit();
            } else if (id === 'changeHotkey') {
                changeHotkeyClick();
            } else if (['systemmode', 'darkmode', 'lightmode'].includes(id)) {
                subMenuClick({ id: id });
            }
        });
    }

    // Send the template to main process to show the menu
    // We hook into the tray right-click event in main process, 
    // but here we are redefining the menu every time?
    // The original code re-bound the right-click listener every time handleContextMenu was called.
    // The main process handler 'set-context-menu' pops it up immediately.
    // We should probably just call this when we want to update the menu that appears on right click.
    // Actually, the original code: tray.on('right-click', () => mb.tray.popUpContextMenu(contextMenu))
    // So we just need to send the template to main, and main will set it up.
    
    // However, for the menubar lib, we usually just set the context menu on the tray.
    ipcRenderer.invoke('set-context-menu', template);
}

function toggleAlwaysOnTop(event) {
    localStorage.setItem('alwaysOnTopChecked', String(event.checked));
    ipcRenderer.invoke('alwaysOnTop', String(event.checked));
}

async function helpMessage() {
    await ipcRenderer.invoke('show-message-box', { type: 'info', title: 'Howdy!', message: 'Thanks for using this program!\nAfter pairing with an Apple TV (one time process), you will see the remote layout.\n\nEvery button is mapped to the keyboard, press and hold the "Option" key to see which key does what.\n\n To open this program, press Command+Shift+R (pressing this again will close it). Also right-clicking the icon in the menu will show additional options.' })
}

function themeUpdated() {
    // Re-apply theme when system preference changes
    handleDarkMode();
}

function addThemeListener() {
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeUpdated);
    }
}

function checkEnv() {
    log('checkEnv called');
    // Environment check - Python is verified by the server starting successfully
    // Hide the Python error message since server is running
    $(".pythonError").hide();
}

async function init() {
    log('init called');
    // Hide the initial loading text
    $("#initText").hide();

    // Check if we have saved credentials
    var atvcreds = localStorage.getItem('atvcreds');
    var creds;
    try {
        creds = JSON.parse(localStorage.getItem('remote_credentials') || "{}");
    } catch (err) {
        log('init: Failed to parse credentials:', err);
        creds = {};
    }

    if (atvcreds && Object.keys(creds).length > 0) {
        // We have saved credentials, try to connect
        log('Found saved credentials, connecting...');
        try {
            await connectToATV();
            log('connectToATV completed successfully');
        } catch (err) {
            log('Failed to connect with saved credentials:', err);
            // Connection failed, start scanning
            startScan();
        }
    } else {
        // No saved credentials, start scanning for devices
        log('No saved credentials, starting scan...');
        startScan();
    }
}

$(function() {
    applyPreferredTheme();
    addThemeListener();
    initIPC();
    var wp = getWorkingPath();
    $("#workingPathSpan").html(`<strong>${wp}</strong>`);
    ipcRenderer.invoke('isWSRunning');
})
