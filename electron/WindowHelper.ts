
import { BrowserWindow, screen } from "electron"
import screenshot from "screenshot-desktop"
import sharp from "sharp"
import { AppState } from "main"
import path from "node:path"
import http from "http"
import { WindowStateManager, WindowState } from "./WindowStateManager"

const isDev = process.env.NODE_ENV === "development"

const getStartUrl = () => {
  if (isDev) {
    const vitePort = process.env.VITE_PORT || "5180"
    return `http://localhost:${vitePort}`
  }
  return `file://${path.join(__dirname, "../dist/index.html")}`
}

const startUrl = getStartUrl()

export class WindowHelper {
  private mainWindow: BrowserWindow | null = null
  private isWindowVisible: boolean = false
  private windowPosition: { x: number; y: number } | null = null
  private windowSize: { width: number; height: number } | null = null
  private appState: AppState
  private stateManager: WindowStateManager

  private screenWidth: number = 0
  private screenHeight: number = 0
  private step: number = 0
  private currentX: number = 0
  private currentY: number = 0
  private saveStateDebounceTimer: NodeJS.Timeout | null = null

  constructor(appState: AppState) {
    this.appState = appState
    this.stateManager = new WindowStateManager()
  }

  public setWindowDimensions(width: number, height: number): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return

    const [currentX, currentY] = this.mainWindow.getPosition()
    const currentBounds = this.mainWindow.getBounds()

    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workAreaSize

    const maxAllowedWidth = Math.floor(
      workArea.width * (this.appState.getHasDebugged() ? 0.75 : 0.9)
    )

    const requestedWidth = width + 32
    const requestedHeight = Math.ceil(height)

    const newWidth = Math.min(
      Math.max(requestedWidth, currentBounds.width),
      maxAllowedWidth
    )
    const newHeight = Math.max(requestedHeight, currentBounds.height)

    if (newWidth !== currentBounds.width || newHeight !== currentBounds.height) {
    const maxX = workArea.width - newWidth
    const newX = Math.min(Math.max(currentX, 0), maxX)

    this.mainWindow.setBounds({
      x: newX,
      y: currentY,
      width: newWidth,
      height: newHeight
    })

    this.windowPosition = { x: newX, y: currentY }
    this.windowSize = { width: newWidth, height: newHeight }
    this.currentX = newX
      this.debouncedSaveState()
    }
  }

  public ensureWindowSize(minWidth: number, minHeight: number): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return

    const bounds = this.mainWindow.getBounds()
    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workAreaSize

    const maxAllowedWidth = Math.floor(workArea.width * 0.9)
    const maxAllowedHeight = Math.floor(workArea.height * 0.9)

    const requiredWidth = minWidth + 32
    const requiredHeight = minHeight + 32

    let newWidth = Math.max(bounds.width, requiredWidth)
    let newHeight = Math.max(bounds.height, requiredHeight)

    newWidth = Math.min(newWidth, maxAllowedWidth)
    newHeight = Math.min(newHeight, maxAllowedHeight)

    if (newWidth > bounds.width || newHeight > bounds.height) {
      const currentX = bounds.x
      const currentY = bounds.y
      
      const maxX = workArea.width - newWidth
      const maxY = workArea.height - newHeight
      
      const adjustedX = Math.max(0, Math.min(currentX, maxX))
      const adjustedY = Math.max(0, Math.min(currentY, maxY))

      this.mainWindow.setBounds({
        x: adjustedX,
        y: adjustedY,
        width: newWidth,
        height: newHeight
      })

      this.windowPosition = { x: adjustedX, y: adjustedY }
      this.windowSize = { width: newWidth, height: newHeight }
      this.currentX = adjustedX
      this.currentY = adjustedY
      this.debouncedSaveState()
    }
  }

  public createWindow(): void {
    if (this.mainWindow !== null) return

    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workAreaSize
    this.screenWidth = workArea.width
    this.screenHeight = workArea.height

    // Для режима «плавающего оверлея» как в Cluely всегда используем безрамочное прозрачное окно
    const useFrame = false
    
    const savedState = this.stateManager.load()
    const defaultWidth = 600
    const defaultHeight = 700
    
    let windowWidth = savedState?.width || defaultWidth
    let windowHeight = savedState?.height || defaultHeight
    let windowX = savedState?.x
    let windowY = savedState?.y
    
    if (savedState && (windowX === undefined || windowY === undefined)) {
      windowX = Math.floor(workArea.width / 2 - windowWidth / 2)
      windowY = Math.floor(workArea.height / 2 - windowHeight / 2)
    } else if (!savedState) {
      windowX = Math.floor(workArea.width / 2 - windowWidth / 2)
      windowY = Math.floor(workArea.height / 2 - windowHeight / 2)
    }
    
    if (windowX !== undefined && windowY !== undefined) {
      const maxX = workArea.width - windowWidth
      const maxY = workArea.height - windowHeight
      windowX = Math.max(0, Math.min(windowX, maxX))
      windowY = Math.max(0, Math.min(windowY, maxY))
    }
    
    const windowSettings: Electron.BrowserWindowConstructorOptions = {
      width: windowWidth,
      height: windowHeight,
      minWidth: 400,
      minHeight: 300,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
        devTools: isDev
      },
      show: false,
      alwaysOnTop: true,
      frame: useFrame,
      transparent: !useFrame,
      fullscreenable: false,
      hasShadow: !useFrame,
      backgroundColor: "#00000000",
      focusable: true,
      resizable: true,
      movable: true,
      x: windowX ?? Math.floor(workArea.width / 2 - windowWidth / 2),
      y: windowY ?? Math.floor(workArea.height / 2 - windowHeight / 2)
    }

    this.mainWindow = new BrowserWindow(windowSettings)
    if (process.env.AUTO_OPEN_DEVTOOLS === "true") {
      console.log("[WindowHelper] Opening DevTools (AUTO_OPEN_DEVTOOLS is set)")
      this.mainWindow.webContents.openDevTools()
    } else {
      console.log("[WindowHelper] DevTools available but not auto-opening (set AUTO_OPEN_DEVTOOLS=true to enable)")
    }
    this.mainWindow.setContentProtection(false)

    if (process.platform === "darwin") {
      this.mainWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true
      })
      this.mainWindow.setHiddenInMissionControl(true)
      this.mainWindow.setAlwaysOnTop(true, "floating")
    }
    if (process.platform === "linux") {
      if (this.mainWindow.setHasShadow) {
        this.mainWindow.setHasShadow(false)
      }
      this.mainWindow.setFocusable(true)
    } 
    this.mainWindow.setSkipTaskbar(true)
    this.mainWindow.setAlwaysOnTop(true)

    const checkVitePort = (port: number): Promise<boolean> => {
      return new Promise((resolve) => {
        const req = http.get(`http://localhost:${port}`, { timeout: 2000 }, (res) => {
          if (res.statusCode !== 200) {
            res.resume()
            resolve(false)
            return
          }

          const contentType = res.headers['content-type'] || ''
          if (!contentType.includes('text/html') && !contentType.includes('text/html;')) {
            res.resume()
            resolve(false)
            return
          }

          let data = ''
          let resolved = false
          
          res.on('data', (chunk) => {
            if (resolved) return
            data += chunk.toString()
            
            if (data.length > 200) {
              const hasHtml = data.includes('<!DOCTYPE html') || 
                             data.includes('<html') ||
                             data.includes('<head') ||
                             data.includes('vite') ||
                             data.includes('Vite')
              
              if (hasHtml) {
                resolved = true
                req.destroy()
                resolve(true)
                return
              }
            }
          })
          
          res.on('end', () => {
            if (resolved) return
            const hasHtml = data.includes('<!DOCTYPE html') || 
                          data.includes('<html') ||
                          data.includes('<head')
            resolve(hasHtml && data.length > 100)
          })
        })
        
        req.on('error', () => resolve(false))
        req.on('timeout', () => {
          req.destroy()
          resolve(false)
        })
      })
    }

    const findVitePort = async (): Promise<number> => {
      const ports = [5181, 5180, 5182, 5173]
      console.log(`🔍 Checking ports for Vite server: ${ports.join(', ')}`)
      for (const port of ports) {
        console.log(`  Checking port ${port}...`)
        const isVite = await checkVitePort(port)
        if (isVite) {
          console.log(`✅ Found Vite server on port ${port}`)
          return port
        } else {
          console.log(`  ❌ Port ${port} is not serving Vite`)
        }
      }
      console.warn(`⚠️ Vite server not found on any port, defaulting to 5181`)
      return 5181
    }

    const loadViteUrl = async () => {
      if (!this.mainWindow) return
      
      this.mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`[Renderer ${level}]: ${message}`)
      })
      
      this.mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error(`❌ Failed to load ${validatedURL}: ${errorCode} - ${errorDescription}`)
    })

      this.mainWindow.webContents.on('did-frame-finish-load', (event, isMainFrame) => {
        if (isMainFrame) {
          console.log(`✅ Frame finished loading`)
        }
      })
      
      try {
        const port = await findVitePort()
        const url = `http://localhost:${port}`
        console.log(`🌐 Loading URL: ${url}`)
        
        await this.mainWindow.loadURL(url)
        console.log(`✅ Successfully loaded URL: ${url}`)
        
        setTimeout(() => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.executeJavaScript(`
              console.log('Window content check:', {
                body: document.body ? 'exists' : 'missing',
                bodyChildren: document.body ? document.body.children.length : 0,
                title: document.title,
                readyState: document.readyState
              })
            `).catch(console.error)
          }
        }, 1000)
      } catch (err) {
        console.error("❌ Error loading URL:", err)
      }
    }

    loadViteUrl()

    this.mainWindow.once('ready-to-show', () => {
      if (this.mainWindow) {
        const savedState = this.stateManager.load()
        if (!savedState) {
        this.centerWindow()
        }
        this.mainWindow.show()
        this.mainWindow.focus()
        this.mainWindow.setAlwaysOnTop(true)
        this.isWindowVisible = true
        console.log("Window is now visible")
        this.debouncedDetectTheme()
      }
    })
    
    this.mainWindow.on('focus', () => {
      console.log("[WindowHelper] Window received focus")
      setTimeout(() => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send("window-focused")
        }
      }, 100)
    })

    setTimeout(() => {
      if (this.mainWindow && !this.isWindowVisible) {
        console.log("Fallback: showing window after timeout")
        const savedState = this.stateManager.load()
        if (!savedState) {
          this.centerWindow()
        }
        this.mainWindow.show()
        this.mainWindow.focus()
        this.isWindowVisible = true
      }
    }, 2000)

    const bounds = this.mainWindow.getBounds()
    this.windowPosition = { x: bounds.x, y: bounds.y }
    this.windowSize = { width: bounds.width, height: bounds.height }
    this.currentX = bounds.x
    this.currentY = bounds.y

    this.setupWindowListeners()
    this.isWindowVisible = true
  }

  private setupWindowListeners(): void {
    if (!this.mainWindow) return

    this.mainWindow.on("move", () => {
      if (this.mainWindow) {
        const bounds = this.mainWindow.getBounds()
        this.windowPosition = { x: bounds.x, y: bounds.y }
        this.currentX = bounds.x
        this.currentY = bounds.y
        this.debouncedDetectTheme()
        this.debouncedSaveState()
      }
    })

    this.mainWindow.on("resize", () => {
      if (this.mainWindow) {
        const bounds = this.mainWindow.getBounds()
        this.windowPosition = { x: bounds.x, y: bounds.y }
        this.windowSize = { width: bounds.width, height: bounds.height }
        this.currentX = bounds.x
        this.currentY = bounds.y
        this.debouncedDetectTheme()
        this.debouncedSaveState()
      }
    })

    this.mainWindow.on("closed", () => {
      this.saveWindowState()
      this.mainWindow = null
      this.isWindowVisible = false
      this.windowPosition = null
      this.windowSize = null
    })
  }

  private debouncedSaveState(): void {
    if (this.saveStateDebounceTimer) {
      clearTimeout(this.saveStateDebounceTimer)
    }
    this.saveStateDebounceTimer = setTimeout(() => {
      this.saveWindowState()
    }, 500)
  }

  private saveWindowState(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    const bounds = this.mainWindow.getBounds()
    this.stateManager.save({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x ?? 0,
      y: bounds.y ?? 0
    })
  }

  private themeDetectionTimer: NodeJS.Timeout | null = null
  private themeDetecting: boolean = false
  private debouncedDetectTheme(): void {
    if (this.themeDetectionTimer) clearTimeout(this.themeDetectionTimer)
    this.themeDetectionTimer = setTimeout(() => this.detectAndBroadcastTheme().catch(() => {}), 600)
  }

  private async detectAndBroadcastTheme(): Promise<void> {
    if (!this.mainWindow || this.mainWindow.isDestroyed() || this.themeDetecting) return
    this.themeDetecting = true
    try {
      const bounds = this.mainWindow.getBounds()
      const img = (await screenshot({ format: 'png' })) as Buffer
      const meta = await sharp(img).metadata()
      const imgWidth = meta.width || this.screenWidth
      const imgHeight = meta.height || this.screenHeight

      const strip = 24
      const rects = [
        { left: bounds.x, top: Math.max(bounds.y - strip, 0), width: bounds.width, height: Math.min(strip, bounds.y) },
        { left: bounds.x, top: Math.min(bounds.y + bounds.height, imgHeight - strip), width: bounds.width, height: Math.min(strip, imgHeight - (bounds.y + bounds.height)) },
        { left: Math.max(bounds.x - strip, 0), top: bounds.y, width: Math.min(strip, bounds.x), height: bounds.height },
        { left: Math.min(bounds.x + bounds.width, imgWidth - strip), top: bounds.y, width: Math.min(strip, imgWidth - (bounds.x + bounds.width)), height: bounds.height }
      ].filter(r => r.width > 8 && r.height > 8)

      const luminances: number[] = []
      for (const r of rects) {
        try {
          const stats = await sharp(img).extract(r).resize(24, 24).stats()
          const rr = stats.channels[0]?.mean || 0
          const gg = stats.channels[1]?.mean || 0
          const bb = stats.channels[2]?.mean || 0
          luminances.push((0.2126 * rr + 0.7152 * gg + 0.0722 * bb) / 255)
        } catch {}
      }
      if (luminances.length > 0) {
        const avg = luminances.reduce((a, b) => a + b, 0) / luminances.length
        const theme: 'light' | 'dark' = avg > 0.6 ? 'light' : 'dark'
        this.mainWindow.webContents.send('theme-change', theme)
      }
    } catch {}
    finally {
      this.themeDetecting = false
    }
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  public isVisible(): boolean {
    return this.isWindowVisible
  }

  public hideMainWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      console.warn("Main window does not exist or is destroyed.")
      return
    }

    const bounds = this.mainWindow.getBounds()
    this.windowPosition = { x: bounds.x, y: bounds.y }
    this.windowSize = { width: bounds.width, height: bounds.height }
    this.mainWindow.hide()
    this.isWindowVisible = false
  }

  public showMainWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      console.warn("Main window does not exist or is destroyed.")
      return
    }

    if (this.windowPosition && this.windowSize) {
      this.mainWindow.setBounds({
        x: this.windowPosition.x,
        y: this.windowPosition.y,
        width: this.windowSize.width,
        height: this.windowSize.height
      })
    }

    this.mainWindow.showInactive()

    this.isWindowVisible = true
  }

  public toggleMainWindow(): void {
    if (this.isWindowVisible) {
      this.hideMainWindow()
    } else {
      this.showMainWindow()
    }
  }

  private centerWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return
    }

    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workAreaSize
    
    const windowBounds = this.mainWindow.getBounds()
    const windowWidth = windowBounds.width || 400
    const windowHeight = windowBounds.height || 600
    
    const centerX = Math.floor((workArea.width - windowWidth) / 2)
    const centerY = Math.floor((workArea.height - windowHeight) / 2)
    
    this.mainWindow.setBounds({
      x: centerX,
      y: centerY,
      width: windowWidth,
      height: windowHeight
    })
    
    this.windowPosition = { x: centerX, y: centerY }
    this.windowSize = { width: windowWidth, height: windowHeight }
    this.currentX = centerX
    this.currentY = centerY
  }

  public centerAndShowWindow(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      console.warn("Main window does not exist or is destroyed.")
      return
    }

    this.centerWindow()
    this.mainWindow.show()
    this.mainWindow.focus()
    this.mainWindow.setAlwaysOnTop(true)
    this.isWindowVisible = true
    
    console.log(`Window centered and shown`)
  }

  public moveWindowRight(): void {
    if (!this.mainWindow) return

    const windowWidth = this.windowSize?.width || 0
    const halfWidth = windowWidth / 2

    this.currentX = Number(this.currentX) || 0
    this.currentY = Number(this.currentY) || 0

    this.currentX = Math.min(
      this.screenWidth - halfWidth,
      this.currentX + this.step
    )
    this.mainWindow.setPosition(
      Math.round(this.currentX),
      Math.round(this.currentY)
    )
  }

  public moveWindowLeft(): void {
    if (!this.mainWindow) return

    const windowWidth = this.windowSize?.width || 0
    const halfWidth = windowWidth / 2

    this.currentX = Number(this.currentX) || 0
    this.currentY = Number(this.currentY) || 0

    this.currentX = Math.max(-halfWidth, this.currentX - this.step)
    this.mainWindow.setPosition(
      Math.round(this.currentX),
      Math.round(this.currentY)
    )
  }

  public moveWindowDown(): void {
    if (!this.mainWindow) return

    const windowHeight = this.windowSize?.height || 0
    const halfHeight = windowHeight / 2

    this.currentX = Number(this.currentX) || 0
    this.currentY = Number(this.currentY) || 0

    this.currentY = Math.min(
      this.screenHeight - halfHeight,
      this.currentY + this.step
    )
    this.mainWindow.setPosition(
      Math.round(this.currentX),
      Math.round(this.currentY)
    )
  }

  public moveWindowUp(): void {
    if (!this.mainWindow) return

    const windowHeight = this.windowSize?.height || 0
    const halfHeight = windowHeight / 2

    this.currentX = Number(this.currentX) || 0
    this.currentY = Number(this.currentY) || 0

    this.currentY = Math.max(-halfHeight, this.currentY - this.step)
    this.mainWindow.setPosition(
      Math.round(this.currentX),
      Math.round(this.currentY)
    )
  }
}
