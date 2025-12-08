import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktopCalendar', {
  version: '1.0.0',
  // 允许 React 告诉 Electron 改变窗口大小
  resizeWindow: (size) => ipcRenderer.send('resize-window', size),
  // [新增] 允许 React 告诉 Electron 是否可调整大小
  setResizable: (resizable) => ipcRenderer.send('set-resizable', resizable)
})
