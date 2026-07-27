import { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import AutoLaunch from 'auto-launch'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// [开发隔离] 非打包环境（npm run electron:dev / electron:start 等）使用独立数据目录，
// 避免开发调试直接读写正式版（安装版）的用户数据（localStorage / 登录 session）
const isDevEnv = !app.isPackaged;
if (isDevEnv) {
  const devUserData = path.join(app.getPath('appData'), 'desktop-calendar-dev');
  app.setPath('userData', devUserData);
  console.log('[DEV] 使用独立数据目录:', devUserData);
}

app.disableHardwareAcceleration();

let mainWindow
let tooltipWindow
let menuWindow
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

  // 禁用后台节流，确保隐藏时 React 渲染不会被 Chromium 延迟
  tooltipWindow.webContents.setBackgroundThrottling(false);
  tooltipWindow.on('closed', () => { tooltipWindow = null })
}

// --- 通用菜单窗口（年/月选择器、桌面日历菜单、透明度调节共用） ---
const createMenuWindow = () => {
  menuWindow = new BrowserWindow({
    width: 260,
    height: 120,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
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
    menuWindow.loadURL(`${devUrl}/menu.html`)
  } else {
    menuWindow.loadFile(path.join(__dirname, '..', 'dist', 'menu.html'))
  }

  menuWindow.on('closed', () => { menuWindow = null })
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
  createMenuWindow();

  mainWindow.on('move', () => {
    if (tooltipWindow && tooltipWindow.isVisible()) tooltipWindow.hide();
    if (menuWindow && menuWindow.isVisible()) menuWindow.hide();
    
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
    if (menuWindow) menuWindow.close();
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
  tray.setToolTip(isDevEnv ? 'Desktop Calendar (DEV)' : 'Desktop Calendar')
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
    
    const bounds = win.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const workArea = display.workArea;
    const workAreaBottom = workArea.y + workArea.height;

    // 检查当前是否吸附在底部 (阈值 20px)
    const isBottomAligned = Math.abs((bounds.y + bounds.height) - workAreaBottom) < 20;
    
    const newWidth = parseInt(width);
    const newHeight = parseInt(height);

    if (isBottomAligned) {
      // 如果当前是底部吸附，调整 Y 坐标以保持底部吸附
      const newY = workAreaBottom - newHeight;
      win.setBounds({
        x: bounds.x,
        y: newY,
        width: newWidth,
        height: newHeight
      });
    } else {
      // 否则正常调整大小（默认向下/向右延伸）
      win.setSize(newWidth, newHeight);
    }
    
    if (!wasResizable) win.setResizable(false);
  }
});

ipcMain.on('set-resizable', (event, resizable) => {
  if (!mainWindow) return;
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win.setResizable(resizable)
})

let currentTargetRect = null;
let pendingTooltipShow = false; // 等待渲染进程完成首次渲染后再显示窗口
let pendingMenuShow = false;

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
    // 渲染端会对内容高度做 CSS 过渡并逐帧上报，这里即时跟随即可，
    // 窗口和内容始终同高，不会有错位/拉伸感
    const bounds = tooltipWindow.getBounds();
    const w = Math.round(width);
    const h = Math.round(height);
    const sizeChanged = bounds.height !== h || bounds.width !== w;

    if (sizeChanged) {
      // [修复] Windows下如果 resizable: false，setSize 往往无法缩小窗口
      const wasResizable = tooltipWindow.isResizable();
      if (!wasResizable) tooltipWindow.setResizable(true);

      tooltipWindow.setSize(w, h);

      if (!wasResizable) tooltipWindow.setResizable(false);
    }

    // 内容布局可能变了，刷新定位
    updateTooltipPosition(w, h);

    // 渲染已完成：有 pending show 就先显示（不论尺寸变没变）
    if (pendingTooltipShow) {
      pendingTooltipShow = false;
      tooltipWindow.showInactive();
      tooltipWindow.moveTop();
      // 通知渲染进程：窗口已可见，可以播放入场动画了
      tooltipWindow.webContents.send('tooltip-visible');
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

  // 1. 先发数据，让渲染进程开始计算高度。
  // freshShow 标记本次是隐藏→显示的全新弹出，渲染端据此在窗口可见前重置入场动画状态
  const freshShow = !tooltipWindow.isVisible();
  tooltipWindow.webContents.send('update-tooltip-data', { ...data, freshShow });

  // 2. 仅在窗口隐藏时先按旧尺寸预定位（确保 show 时大概在正确位置）。
  // 窗口已可见时不预定位——否则会用旧高度先跳一次，等 resize 回来用新高度再跳一次，
  // 视觉上就是"弹了两下"。已可见时由 resize 回调一次性定位到新位置。
  if (!tooltipWindow.isVisible()) {
    updateTooltipPosition();
    // 延迟显示：等渲染进程完成首次渲染并回传 resize-tooltip-window 后
    // 才调用 showInactive，避免你看到「空窗→实窗」的双闪。
    pendingTooltipShow = true;
  }
});

ipcMain.on('hide-tooltip-window', () => {
  pendingTooltipShow = false;
  if (tooltipWindow) tooltipWindow.hide();
});

ipcMain.on('dispatch-tooltip-action', (event, action) => {
  if (mainWindow) mainWindow.webContents.send('tooltip-action-received', action);
});

// --- 菜单窗口：智能定位 + 自适应尺寸 ---
// 方向在显示时计算一次：
//   横向：主窗中心在工作区右半 → 弹窗贴主窗左侧；左半 → 贴右侧（朝屏幕内侧展开）
//   纵向：主窗中心在工作区上半 → 弹窗视觉顶部与主窗顶部对齐；下半 → 视觉底部与主窗底部对齐
let menuAnchor = null; // { side: 'left'|'right', align: 'top'|'bottom' }

const updateMenuPosition = (targetW, targetH) => {
  if (!menuWindow || !mainWindow || !menuAnchor) return;

  const winBounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(winBounds);
  const workArea = display.workArea;

  const PADDING = 20; // 渲染层 p-5 透明留白
  const GAP = 6;

  const menuBounds = menuWindow.getBounds();
  const menuW = targetW || menuBounds.width || 260;
  const menuH = targetH || menuBounds.height || 120;

  // 横向定位（视觉边贴主窗，留出 GAP）
  let x;
  if (menuAnchor.side === 'left') {
    x = winBounds.x - GAP - menuW + PADDING;
  } else {
    x = winBounds.x + winBounds.width + GAP - PADDING;
  }

  // 纵向定位（顶对齐或底对齐）
  let y;
  if (menuAnchor.align === 'top') {
    y = winBounds.y - PADDING;
  } else {
    y = winBounds.y + winBounds.height - menuH + PADDING;
  }

  // 防溢出：视觉区域夹取到工作区内
  if (x + PADDING < workArea.x) x = workArea.x - PADDING;
  if (x + menuW - PADDING > workArea.x + workArea.width) {
    x = workArea.x + workArea.width - menuW + PADDING;
  }
  if (y + PADDING < workArea.y) y = workArea.y - PADDING;
  if (y + menuH - PADDING > workArea.y + workArea.height) {
    y = workArea.y + workArea.height - menuH + PADDING;
  }

  menuWindow.setPosition(Math.round(x), Math.round(y));
};

ipcMain.on('show-menu-window', (event, { mode, data }) => {
  if (!menuWindow || !mainWindow) return;

  const winBounds = mainWindow.getBounds();
  const { workArea } = screen.getDisplayMatching(winBounds);

  // 计算一次方向，本轮回合内高度变化也沿用
  menuAnchor = {
    side: (winBounds.x + winBounds.width / 2) > (workArea.x + workArea.width / 2) ? 'left' : 'right',
    align: (winBounds.y + winBounds.height / 2) > (workArea.y + workArea.height / 2) ? 'bottom' : 'top'
  };

  // 先发数据让渲染进程开始计算尺寸
  menuWindow.webContents.send('update-menu-data', { mode, data });

  updateMenuPosition();

  // 延迟显示：等 resize-menu-window 回来再 showInactive（同 tooltip 机制）
  if (!menuWindow.isVisible()) {
    pendingMenuShow = true;
  }
});

ipcMain.on('hide-menu-window', () => {
  pendingMenuShow = false;
  if (menuWindow) menuWindow.hide();
});

ipcMain.on('update-menu-data-only', (event, payload) => {
  if (menuWindow && !menuWindow.isDestroyed()) {
    menuWindow.webContents.send('update-menu-data', payload);
  }
});

ipcMain.on('resize-menu-window', (event, { width, height }) => {
  if (menuWindow) {
    const bounds = menuWindow.getBounds();
    const sizeChanged = Math.abs(bounds.height - height) > 2 || Math.abs(bounds.width - width) > 2;

    if (sizeChanged) {
      // Windows 下 resizable: false 时 setSize 无法缩小窗口，需临时开启
      const wasResizable = menuWindow.isResizable();
      if (!wasResizable) menuWindow.setResizable(true);

      menuWindow.setSize(Math.round(width), Math.round(height));

      if (!wasResizable) menuWindow.setResizable(false);
    }

    // 内容布局可能变了，始终刷新定位
    updateMenuPosition(width, height);

    // 渲染已完成：有 pending show 就先显示
    if (pendingMenuShow) {
      pendingMenuShow = false;
      menuWindow.showInactive();
      menuWindow.setAlwaysOnTop(true);
      menuWindow.moveTop();
    } else if (menuWindow.isVisible()) {
      menuWindow.moveTop();
    }
  }
});

ipcMain.on('dispatch-menu-action', (event, action) => {
  if (mainWindow) mainWindow.webContents.send('menu-action-received', action);
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
