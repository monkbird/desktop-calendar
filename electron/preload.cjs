const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopCalendar', {
  version: '1.0.0',
  // --- 主窗口控制 ---
  resizeWindow: (size) => ipcRenderer.send('resize-window', size),
  setResizable: (resizable) => ipcRenderer.send('set-resizable', resizable),
  
  // --- Tooltip 通信 ---
  showTooltip: (payload) => ipcRenderer.send('show-tooltip-window', payload),
  hideTooltip: () => ipcRenderer.send('hide-tooltip-window'),
  updateTooltipData: (data) => ipcRenderer.send('update-tooltip-data-only', data),

  // [新增] Tooltip 自适应高度
  resizeTooltip: (size) => ipcRenderer.send('resize-tooltip-window', size),

  onUpdateTooltip: (callback) => {
    const cb = (_event, value) => callback(value)
    ipcRenderer.on('update-tooltip-data', cb)
    return () => ipcRenderer.removeListener('update-tooltip-data', cb)
  },

  dispatchTooltipAction: (action) => ipcRenderer.send('dispatch-tooltip-action', action),

  onTooltipAction: (callback) => {
    const cb = (_event, value) => callback(value)
    ipcRenderer.on('tooltip-action-received', cb)
    return () => ipcRenderer.removeListener('tooltip-action-received', cb)
  }
})