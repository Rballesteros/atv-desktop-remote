const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
    // IPC Communication
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    send: (channel, data) => ipcRenderer.send(channel, data),
    on: (channel, func) => {
        const subscription = (event, ...args) => func(...args);
        ipcRenderer.on(channel, subscription);
        return () => ipcRenderer.removeListener(channel, subscription);
    },
    once: (channel, func) => {
        ipcRenderer.once(channel, (event, ...args) => func(...args));
    },
    removeListener: (channel, func) => {
        ipcRenderer.removeListener(channel, func);
    },
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    }
});

// Expose Node.js modules that are needed by the renderer
contextBridge.exposeInMainWorld('node', {
    path: require('path'),
    platform: process.platform,
    env: process.env
});
