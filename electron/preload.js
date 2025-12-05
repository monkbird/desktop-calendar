import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktopCalendar', {
  version: '1.0.0',
  // 允许 React 告诉 Electron 改变窗口大小
  resizeWindow: (size) => ipcRenderer.send('resize-window', size)
})