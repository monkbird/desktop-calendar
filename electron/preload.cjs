const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopCalendar', {
  version: '1.0.0',
  // --- 主窗口控制 ---
  resizeWindow: (size) => ipcRenderer.send('resize-window', size),
  // 窗口尺寸动画（主进程逐帧驱动，比渲染进程逐帧 IPC 平滑）
  animateWindowBounds: (size) => ipcRenderer.send('animate-window-bounds', size),
  setResizable: (resizable) => ipcRenderer.send('set-resizable', resizable),
  
  // --- Tooltip 通信 ---
  showTooltip: (payload) => ipcRenderer.send('show-tooltip-window', payload),
  hideTooltip: () => ipcRenderer.send('hide-tooltip-window'),
  updateTooltipData: (data) => ipcRenderer.send('update-tooltip-data-only', data),

  // [新增] Tooltip 自适应高度
  resizeTooltip: (size) => ipcRenderer.send('resize-tooltip-window', size),

  // 窗口可见后主进程发回的信号，用于同步入场动画
  onTooltipVisible: (callback) => {
    const cb = () => callback();
    ipcRenderer.on('tooltip-visible', cb);
    return () => ipcRenderer.removeListener('tooltip-visible', cb);
  },

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
  },

  // --- 菜单窗口通信 ---
  showMenu: (payload) => ipcRenderer.send('show-menu-window', payload),
  hideMenu: () => ipcRenderer.send('hide-menu-window'),
  updateMenuData: (payload) => ipcRenderer.send('update-menu-data-only', payload),
  resizeMenu: (size) => ipcRenderer.send('resize-menu-window', size),

  onUpdateMenu: (callback) => {
    const cb = (_event, value) => callback(value)
    ipcRenderer.on('update-menu-data', cb)
    return () => ipcRenderer.removeListener('update-menu-data', cb)
  },

  dispatchMenuAction: (action) => ipcRenderer.send('dispatch-menu-action', action),

  onMenuAction: (callback) => {
    const cb = (_event, value) => callback(value)
    ipcRenderer.on('menu-action-received', cb)
    return () => ipcRenderer.removeListener('menu-action-received', cb)
  },

  // 主窗口拖动结束（Windows 'moved' 事件）
  onWindowMoved: (callback) => {
    const cb = () => callback()
    ipcRenderer.on('window-moved', cb)
    return () => ipcRenderer.removeListener('window-moved', cb)
  },

  // 光标是否在窗口内 / 窗口是否吸附底部
  isCursorInside: () => ipcRenderer.invoke('is-cursor-inside-window'),
  isBottomSnapped: () => ipcRenderer.invoke('is-bottom-snapped')
})