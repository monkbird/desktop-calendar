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
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    // [核心修复] Windows下如果 resizable: false，setSize 往往无法缩小窗口
    // 解决方案：先临时允许调整大小，设置完后再恢复原状
    const wasResizable = win.isResizable();
    if (!wasResizable) win.setResizable(true);
    
    win.setSize(parseInt(width), parseInt(height));
    
    if (!wasResizable) win.setResizable(false);
  }
});

ipcMain.on('set-resizable', (event, resizable) => {
  if (!mainWindow) return;
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win.setResizable(resizable)
})

let currentTargetRect = null;

// 抽离定位逻辑，方便在 show 和 resize 时复用
const updateTooltipPosition = (targetW, targetH) => {
  if (!tooltipWindow || !mainWindow || !currentTargetRect) return;

  const { x, y, width, height } = currentTargetRect;
  const winBounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(winBounds);
  const workArea = display.workArea;

  const PADDING = 20;
  const GAP_X = 6;
  
  const cellRight = winBounds.x + x;
  const cellTop = winBounds.y + y;
  const cellLeft = cellRight - width;
  const cellBottom = cellTop + height;

  const tooltipBounds = tooltipWindow.getBounds();
  // 优先使用传入的目标尺寸（resize 事件中是最新的），否则回退到当前窗口尺寸
  const tooltipW = targetW || tooltipBounds.width || 300;
  const tooltipH = targetH || tooltipBounds.height || 200;

  // --- 横向定位 ---
  let winX = cellRight + GAP_X - PADDING;
  const visualRight = winX + tooltipW - PADDING;
  if (visualRight > workArea.x + workArea.width) {
    winX = cellLeft - GAP_X - tooltipW + PADDING;
  }
  if (winX + PADDING < workArea.x) {
    winX = workArea.x - PADDING;
  }

  // --- 纵向定位 ---
  let winY = cellTop - PADDING;
  const visualBottom = winY + tooltipH - PADDING;
  
  // 检查是否底部溢出
  if (visualBottom > workArea.y + workArea.height) {
    // 底部溢出，改为底对底
    // 计算公式：窗口Y = 目标底边 - 窗口高度 + PADDING
    // 这样 视觉底边(窗口Y + 窗口高度 - PADDING) = 目标底边
    winY = cellBottom - tooltipH + PADDING;
  }
  
  // 顶部溢出兜底
  if (winY + PADDING < workArea.y) {
    winY = workArea.y - PADDING;
  }

  tooltipWindow.setPosition(Math.round(winX), Math.round(winY));
};

ipcMain.on('resize-tooltip-window', (event, { width, height }) => {
  if (tooltipWindow) {
    const bounds = tooltipWindow.getBounds();
    // 只有当尺寸真的变化较大时才调整
    if (Math.abs(bounds.height - height) > 2 || Math.abs(bounds.width - width) > 2) {
      // [修复] Windows下如果 resizable: false，setSize 往往无法缩小窗口
      // 必须先临时开启 resizable
      const wasResizable = tooltipWindow.isResizable();
      if (!wasResizable) tooltipWindow.setResizable(true);

      tooltipWindow.setSize(Math.round(width), Math.round(height));

      if (!wasResizable) tooltipWindow.setResizable(false);

      // [核心修复] 将最新的 height 传给定位函数，防止 getBounds() 返回旧值导致定位计算错误
      updateTooltipPosition(width, height);
    }
  }
});

ipcMain.on('update-tooltip-data-only', (event, data) => {
  if (tooltipWindow && !tooltipWindow.isDestroyed()) {
    tooltipWindow.webContents.send('update-tooltip-data', data);
  }
});

ipcMain.on('show-tooltip-window', (event, { x, y, width, height, data }) => {
  if (!tooltipWindow || !mainWindow) return;

  // 保存当前的格子目标，供 resize 时复用
  currentTargetRect = { x, y, width, height };

  // 1. 先发数据，让渲染进程开始计算高度
  tooltipWindow.webContents.send('update-tooltip-data', data);
  
  // 2. 先执行一次定位（基于当前/旧的高度），确保窗口大概在正确位置出现
  // 即使高度不对，也不会跳太远。等 resize 回调回来后会修正。
  updateTooltipPosition();
  
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
