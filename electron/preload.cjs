const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopCalendar', {
  version: '1.0.0',
  resizeWindow: (size) => ipcRenderer.send('resize-window', size),
  setResizable: (resizable) => ipcRenderer.send('set-resizable', resizable)
})