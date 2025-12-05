import { app, BrowserWindow, ipcMain, screen } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import AutoLaunch from 'auto-launch'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 800,  // 默认宽度
    height: 550, // 默认高度
    minWidth: 320, // 最小宽度，防止缩太小导致内容错乱
    minHeight: 300,
    frame: false,       // 无边框
    transparent: true,  // 透明背景
    alwaysOnTop: true,  // 永远置顶
    hasShadow: false,   // 去掉系统阴影（由 CSS 控制更好看）
    resizable: true,    // 允许调整大小
    skipTaskbar: false, // 是否在任务栏显示
    backgroundColor: '#00000000', // 关键：背景完全透明
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
  mainWindow.loadFile(indexPath)
}

// 监听前端发来的“调整窗口大小”指令
ipcMain.on('resize-window', (event, { width, height }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    win.setSize(Math.round(width), Math.round(height))
  }
})

const enableAutoLaunch = async () => {
  try {
    const launcher = new AutoLaunch({
      name: 'Desktop Calendar',
      isHidden: true
    })
    const enabled = await launcher.isEnabled()
    if (!enabled) await launcher.enable()
  } catch (e) {
    // ignore
  }
}

app.whenReady().then(async () => {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
    return
  }
  createWindow()
  await enableAutoLaunch()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})