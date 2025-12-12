import { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import AutoLaunch from 'auto-launch'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.disableHardwareAcceleration();

let mainWindow
let tooltipWindow
let tray
let isSnapping = false;

const getDevUrl = () => {
  const url = process.env.ELECTRON_START_URL;
  return url ? url.trim() : '';
}

const createTooltipWindow = () => {
  tooltipWindow = new BrowserWindow({
    width: 300, // 初始宽度
    height: 100, // 初始高度可以小一点，反正会自适应
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false, // 禁止用户手动拖拽改变大小
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const devUrl = getDevUrl()
  const isDev = !!devUrl

  if (isDev) {
    tooltipWindow.loadURL(`${devUrl}/tooltip.html`)
  } else {
    tooltipWindow.loadFile(path.join(__dirname, '..', 'dist', 'tooltip.html'))
  }

  tooltipWindow.on('closed', () => { tooltipWindow = null })
}

const createWindow = () => {
  const devUrl = getDevUrl()
  const isDev = !!devUrl

  mainWindow = new BrowserWindow({
    width: 800,
    height: 500,
    minWidth: 200,
    minHeight: 30,
    frame: false,
    transparent: true,
    alwaysOnTop: false,
    hasShadow: true,
    resizable: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    icon: path.join(__dirname, '..', 'public', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      devTools: isDev
    }
  })

  if (isDev) {
    mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
    mainWindow.loadFile(indexPath)
  }

  createTooltipWindow();

  mainWindow.on('move', () => {
    if (tooltipWindow && tooltipWindow.isVisible()) tooltipWindow.hide();
    
    if (isSnapping) return;
    try {
      const bounds = mainWindow.getBounds()
      const { x, y, width, height } = bounds
      const { workArea } = screen.getDisplayMatching(bounds)
      const threshold = 20
      let newX = x, newY = y
      
      if (Math.abs(x - workArea.x) < threshold) newX = workArea.x
      else if (Math.abs(workArea.x + workArea.width - (x + width)) < threshold) newX = workArea.x + workArea.width - width
      if (Math.abs(y - workArea.y) < threshold) newY = workArea.y
      else if (Math.abs(workArea.y + workArea.height - (y + height)) < threshold) newY = workArea.y + workArea.height - height
      
      if (newX !== x || newY !== y) {
        isSnapping = true;
        mainWindow.setPosition(newX, newY);
        setTimeout(() => { isSnapping = false }, 50);
      }
    } catch (e) { isSnapping = false; }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    if (tooltipWindow) tooltipWindow.close(); 
  })
}

const toggleWindow = () => {
  if (!mainWindow) { createWindow(); return; }
  const isVisible = mainWindow.isVisible();
  const isMz = mainWindow.isMinimized();
  if (isVisible && !isMz) {
    mainWindow.hide();
  } else {
    if (isMz) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

const createTray = () => {
  const iconFileName = 'icon.png';
  const iconPath = app.isPackaged
    ? path.join(__dirname, '..', 'dist', iconFileName)
    : path.join(__dirname, '..', 'public', iconFileName);
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon)
  tray.setToolTip('Desktop Calendar')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示/隐藏', click: toggleWindow },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]))
  tray.on('click', toggleWindow)
}

ipcMain.on('resize-window', (event, { width, height }) => {
  if (!mainWindow) return;
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win.setSize(Math.round(width), Math.round(height))
})

ipcMain.on('set-resizable', (event, resizable) => {
  if (!mainWindow) return;
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win.setResizable(resizable)
})

// [新增] 监听子窗口的高度调整请求
ipcMain.on('resize-tooltip-window', (event, { width, height }) => {
  if (tooltipWindow) {
    // 只有当尺寸真的变化较大时才调整，防止抖动（可选）
    const bounds = tooltipWindow.getBounds();
    if (Math.abs(bounds.height - height) > 2 || Math.abs(bounds.width - width) > 2) {
      tooltipWindow.setSize(Math.round(width), Math.round(height));
    }
  }
});

// [新增] 监听仅更新数据的请求，不执行 setPosition
ipcMain.on('update-tooltip-data-only', (event, data) => {
  if (tooltipWindow && !tooltipWindow.isDestroyed()) {
    tooltipWindow.webContents.send('update-tooltip-data', data);
  }
});

ipcMain.on('show-tooltip-window', (event, { x, y, width, height, data }) => {
  if (!tooltipWindow || !mainWindow) return;
  const winBounds = mainWindow.getBounds();
  
  const PADDING = 20; 
  const WINDOW_WIDTH = 300; 

  let contentX = winBounds.x + x; 
  let contentY = winBounds.y + y; 

  const display = screen.getDisplayMatching(winBounds);
  
  if (contentX + WINDOW_WIDTH > display.workArea.x + display.workArea.width) {
    contentX = winBounds.x + (x - width - (WINDOW_WIDTH - PADDING * 2)); 
    if (contentX < display.workArea.x) contentX = display.workArea.x;
  }

  // 重置一下位置
  tooltipWindow.setPosition(Math.round(contentX - PADDING), Math.round(contentY - PADDING));
  
  tooltipWindow.webContents.send('update-tooltip-data', data);
  tooltipWindow.showInactive(); 
});

ipcMain.on('hide-tooltip-window', () => {
  if (tooltipWindow) tooltipWindow.hide();
});

ipcMain.on('dispatch-tooltip-action', (event, action) => {
  if (mainWindow) mainWindow.webContents.send('tooltip-action-received', action);
});

const enableAutoLaunch = async () => {
  try {
    const launcher = new AutoLaunch({ name: 'Desktop Calendar', isHidden: true })
    const enabled = await launcher.isEnabled()
    if (!enabled) await launcher.enable()
  } catch (e) {}
}

app.whenReady().then(async () => {
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  createWindow()
  createTray()
  await enableAutoLaunch()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
  }
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })