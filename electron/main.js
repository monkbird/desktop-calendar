import { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import AutoLaunch from 'auto-launch'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// --- 优化 1: 禁用硬件加速 (必须在 app.whenReady 之前调用) ---
app.disableHardwareAcceleration();

let mainWindow
let tray

const createWindow = () => {
  const isDev = !!process.env.ELECTRON_START_URL
  mainWindow = new BrowserWindow({
    width: 800,  // 默认宽度
    height: 550, // 默认高度
    minWidth: 320, // 最小宽度，防止缩太小导致内容错乱
    minHeight: 300,
    frame: false,       // 无边框
    transparent: true,  // 透明背景
    alwaysOnTop: false,  // 永远置顶
    hasShadow: true,   // 去掉系统阴影（由 CSS 控制更好看）
    resizable: true,    // 允许调整大小
    skipTaskbar: true, // 是否在任务栏显示
    backgroundColor: '#0000001A', // 约 10% 透明度
    icon: path.join(__dirname, '..', 'public', 'icon.png'), // 设置窗口图标
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // --- 优化 2: 内存优化配置 ---
      spellcheck: false, // 禁用拼写检查，省内存
      devTools: false // 生产环境禁用 DevTools (构建后生效)
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
// 【修改点1】添加边缘吸附逻辑
  mainWindow.on('move', () => {
    // 获取当前窗口位置和大小
    const bounds = mainWindow.getBounds()
    const { x, y, width, height } = bounds
    
    // 获取当前窗口所在的屏幕信息（支持多显示器）
    const { workArea } = screen.getDisplayMatching(bounds)
    
    // 吸附阈值（像素）
    const threshold = 20
    
    let newX = x
    let newY = y
    
    // 左边缘吸附
    if (Math.abs(x - workArea.x) < threshold) {
      newX = workArea.x
    } 
    // 右边缘吸附
    else if (Math.abs(workArea.x + workArea.width - (x + width)) < threshold) {
      newX = workArea.x + workArea.width - width
    }
    
    // 上边缘吸附
    if (Math.abs(y - workArea.y) < threshold) {
      newY = workArea.y
    } 
    // 下边缘吸附
    else if (Math.abs(workArea.y + workArea.height - (y + height)) < threshold) {
      newY = workArea.y + workArea.height - height
    }
    
    // 如果位置发生变化，应用吸附
    if (newX !== x || newY !== y) {
      mainWindow.setPosition(newX, newY)
    }
  })
}
// 【新增】创建系统托盘
const createTray = () => {
  // 根据环境选择图标路径
  // 开发环境: public/icon.png
  // 生产环境: dist/icon.png (因为打包时 public 下的文件会被复制到 dist)
  const iconFileName = 'icon.png';
  const iconPath = app.isPackaged
    ? path.join(__dirname, '..', 'dist', iconFileName)
    : path.join(__dirname, '..', 'public', iconFileName);
    
  const icon = nativeImage.createFromPath(iconPath)
  
  tray = new Tray(icon)
  tray.setToolTip('Desktop Calendar')

  // 托盘右键菜单
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: '显示/隐藏', 
      click: () => {
        if (mainWindow.isVisible()) {
          mainWindow.hide()
        } else {
          mainWindow.show()
        }
      } 
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

  // 点击托盘图标切换窗口显示状态
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
    }
  })
}
// 监听前端发来的“调整窗口大小”指令
ipcMain.on('resize-window', (event, { width, height }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    win.setSize(Math.round(width), Math.round(height))
  }
})

// [新增] 监听设置是否可调整大小 (用于锁定模式)
ipcMain.on('set-resizable', (event, resizable) => {
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
  createTray() // 【新增】初始化托盘
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
