try {
    console.log("Preload script starting...");
    const { contextBridge, ipcRenderer } = require('electron');
    const path = require('path');

    // Map to store original listener -> wrapped listener
    // We use a Map of Maps: channel -> Map(originalFunc -> wrappedFunc)
    const listenerMap = new Map();

    function getWrapped(channel, func) {
        if (!listenerMap.has(channel)) {
            listenerMap.set(channel, new Map());
        }
        const channelMap = listenerMap.get(channel);
        if (!channelMap.has(func)) {
            // Pass null as 'event' to maintain compatibility with (event, arg) signature
            const wrapped = (event, ...args) => func(null, ...args);
            channelMap.set(func, wrapped);
        }
        return channelMap.get(func);
    }

    function removeWrapped(channel, func) {
        if (listenerMap.has(channel)) {
            const channelMap = listenerMap.get(channel);
            if (channelMap.has(func)) {
                const wrapped = channelMap.get(func);
                channelMap.delete(func);
                return wrapped;
            }
        }
        return func; // Fallback if not found (shouldn't happen if logic is tight)
    }

    contextBridge.exposeInMainWorld('electron', {
        invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
        send: (channel, data) => ipcRenderer.send(channel, data),
        on: (channel, func) => {
            const wrapped = getWrapped(channel, func);
            ipcRenderer.on(channel, wrapped);
            return () => {
                ipcRenderer.removeListener(channel, wrapped);
                removeWrapped(channel, func);
            };
        },
        once: (channel, func) => {
            // For 'once', we don't need to store it in the map for manual removal 
            // because it auto-removes. But if the user calls removeListener before it fires?
            // Let's wrap it simply.
            const wrapped = (event, ...args) => func(null, ...args);
            ipcRenderer.once(channel, wrapped);
        },
        removeListener: (channel, func) => {
            const wrapped = removeWrapped(channel, func);
            ipcRenderer.removeListener(channel, wrapped);
        },
        removeAllListeners: (channel) => {
            ipcRenderer.removeAllListeners(channel);
            if (listenerMap.has(channel)) {
                listenerMap.delete(channel);
            }
        },
            shell: {
                openExternal: (url) => ipcRenderer.invoke('open-external', url)
            },
            log: (...args) => ipcRenderer.send('log', ...args),
            onContextMenuClick: (callback) => {            const subscription = (event, id) => callback(id);
            ipcRenderer.on('context-menu-click', subscription);
            return () => ipcRenderer.removeListener('context-menu-click', subscription);
        }
    });

    contextBridge.exposeInMainWorld('node', {
        path: {
            join: (...args) => path.join(...args),
            resolve: (...args) => path.resolve(...args),
            dirname: (...args) => path.dirname(...args),
            basename: (...args) => path.basename(...args),
            sep: path.sep
        },
        platform: process.platform,
        env: {
            APPDATA: process.env.APPDATA,
            HOME: process.env.HOME
        }
    });
    console.log("Preload script executed successfully.");
} catch (error) {
    console.error("CRITICAL: Preload script failed to execute!", error);
}

