import { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import AutoLaunch from 'auto-launch'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// --- 优化 1: 禁用硬件加速 ---
app.disableHardwareAcceleration();

let mainWindow
let tray
// [新增] 防止 move 事件死循环的锁
let isSnapping = false;

const createWindow = () => {
  const isDev = !!process.env.ELECTRON_START_URL
  mainWindow = new BrowserWindow({
    width: 800,
    height: 500,
    minWidth: 200,
    minHeight: 200,
    frame: false,
    transparent: false,
    alwaysOnTop: false,
    hasShadow: true,
    resizable: true,
    skipTaskbar: true, // 不在任务栏显示
    backgroundColor: '#00000000', // 修正：完全透明，避免 ghosting，React 侧控制背景
    icon: path.join(__dirname, '..', 'public', 'icon.png'),
    webPreferences: {
      // [修改] 引用 .cjs 文件
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      devTools: isDev
    }
  })

  const devUrl = process.env.ELECTRON_START_URL
  if (devUrl) {
    mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
    mainWindow.loadFile(indexPath)
  }

  // 【修改点1】优化边缘吸附逻辑，防止死循环
  mainWindow.on('move', () => {
    // 如果正在吸附中，直接返回，防止递归触发
    if (isSnapping) return;

    try {
      const bounds = mainWindow.getBounds()
      const { x, y, width, height } = bounds
      
      const { workArea } = screen.getDisplayMatching(bounds)
      const threshold = 20
      
      let newX = x
      let newY = y
      
      // 吸附计算
      if (Math.abs(x - workArea.x) < threshold) newX = workArea.x
      else if (Math.abs(workArea.x + workArea.width - (x + width)) < threshold) newX = workArea.x + workArea.width - width
      
      if (Math.abs(y - workArea.y) < threshold) newY = workArea.y
      else if (Math.abs(workArea.y + workArea.height - (y + height)) < threshold) newY = workArea.y + workArea.height - height
      
      // 只有位置确实改变了才设置
      if (newX !== x || newY !== y) {
        isSnapping = true; // 上锁
        mainWindow.setPosition(newX, newY);
        // 短暂延迟后解锁，确保事件处理完成
        setTimeout(() => { isSnapping = false }, 50);
      }
    } catch (e) {
      isSnapping = false; // 出错也要解锁
    }
  })

  // [新增] 窗口关闭时清理引用，防止报错
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// 【修改点2】强化的窗口切换函数
const toggleWindow = () => {
  if (!mainWindow) {
    createWindow();
    return;
  }

  const isVisible = mainWindow.isVisible();
  const isMz = mainWindow.isMinimized();

  // 如果窗口可见 且 没有最小化，则隐藏
  if (isVisible && !isMz) {
    mainWindow.hide();
  } else {
    // 否则（不可见 或 已最小化），执行展示流程
    if (isMz) mainWindow.restore(); // 关键：如果最小化了（Win+D），必须 restore
    mainWindow.show();
    mainWindow.focus(); // 关键：强制获取焦点，防止被压在下面
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

  const contextMenu = Menu.buildFromTemplate([
    { 
      label: '显示/隐藏', 
      click: toggleWindow // 复用逻辑
    },
    { type: 'separator' },
    { 
      label: '退出', 
      click: () => {
        app.quit()
      } 
    }
  ])

  tray.setContextMenu(contextMenu)

  // 【修改点3】使用新的切换逻辑
  tray.on('click', toggleWindow)
}

ipcMain.on('resize-window', (event, { width, height }) => {
  // 增加有效性检查
  if (!mainWindow) return;
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    win.setSize(Math.round(width), Math.round(height))
  }
})

ipcMain.on('set-resizable', (event, resizable) => {
  if (!mainWindow) return;
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    win.setResizable(resizable)
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
  createTray()
  await enableAutoLaunch()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!mainWindow.isVisible()) mainWindow.show() // 确保单例唤醒时显示
    mainWindow.focus()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})