import { app, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import AutoLaunch from 'auto-launch'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 360,
    minHeight: 320,
    backgroundColor: '#1a1b1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
  mainWindow.loadFile(indexPath)
}

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
  await enableAutoLaunch()
  createWindow()

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
