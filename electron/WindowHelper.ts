
import { BrowserWindow, screen } from "electron"
import screenshot from "screenshot-desktop"
import sharp from "sharp"
import { AppState } from "main"
import path from "node:path"
import http from "http"

const isDev = process.env.NODE_ENV === "development"

// Try multiple ports in dev mode (Vite may use different port if 5180 is busy)
const getStartUrl = () => {
  if (isDev) {
    // Check if VITE_PORT is set, otherwise try common ports
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

  // Initialize with explicit number type and 0 value
  private screenWidth: number = 0
  private screenHeight: number = 0
  private step: number = 0
  private currentX: number = 0
  private currentY: number = 0

  constructor(appState: AppState) {
    this.appState = appState
  }

  public setWindowDimensions(width: number, height: number): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return

    // Get current window position
    const [currentX, currentY] = this.mainWindow.getPosition()

    // Get screen dimensions
    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workAreaSize

    // Use 75% width if debugging has occurred, otherwise use 60%
    const maxAllowedWidth = Math.floor(
      workArea.width * (this.appState.getHasDebugged() ? 0.75 : 0.5)
    )

    // Ensure width doesn't exceed max allowed width and height is reasonable
    const newWidth = Math.min(width + 32, maxAllowedWidth)
    const newHeight = Math.ceil(height)

    // Center the window horizontally if it would go off screen
    const maxX = workArea.width - newWidth
    const newX = Math.min(Math.max(currentX, 0), maxX)

    // Update window bounds
    this.mainWindow.setBounds({
      x: newX,
      y: currentY,
      width: newWidth,
      height: newHeight
    })

    // Update internal state
    this.windowPosition = { x: newX, y: currentY }
    this.windowSize = { width: newWidth, height: newHeight }
    this.currentX = newX
  }

  public createWindow(): void {
    if (this.mainWindow !== null) return

    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workAreaSize
    this.screenWidth = workArea.width
    this.screenHeight = workArea.height

    
    // In dev mode, allow frame for debugging if DEBUG_WINDOW env var is set
    const useFrame = process.env.DEBUG_WINDOW === "true"
    
    const windowSettings: Electron.BrowserWindowConstructorOptions = {
      width: 600, // Increased from 400 to 600 for better visibility
      height: 700, // Increased from 600 to 700
      minWidth: 400, // Increased from 300
      minHeight: 300, // Increased from 200
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
        devTools: isDev // Allow DevTools in dev mode, but don't open automatically
      },
      show: false, // Start hidden, then show after setup
      alwaysOnTop: true,
      frame: useFrame, // Only show frame if DEBUG_WINDOW=true
      transparent: !useFrame, // Transparent unless debugging
      fullscreenable: false,
      hasShadow: !useFrame,
      backgroundColor: "#00000000", // Always transparent background
      focusable: true,
      resizable: true,
      movable: true,
      x: Math.floor(workArea.width / 2 - 300), // Center horizontally (half of 600px width)
      y: Math.floor(workArea.height / 2 - 350) // Center vertically (half of 700px height)
    }

    this.mainWindow = new BrowserWindow(windowSettings)
    // Only open DevTools if explicitly requested via env var
    // Note: DEBUG_WINDOW=true enables frame and transparency, but doesn't auto-open DevTools
    // Use AUTO_OPEN_DEVTOOLS=true to automatically open DevTools
    if (process.env.AUTO_OPEN_DEVTOOLS === "true") {
      console.log("[WindowHelper] Opening DevTools (AUTO_OPEN_DEVTOOLS is set)")
      this.mainWindow.webContents.openDevTools()
    } else {
      console.log("[WindowHelper] DevTools available but not auto-opening (set AUTO_OPEN_DEVTOOLS=true to enable)")
    }
    this.mainWindow.setContentProtection(true)

    if (process.platform === "darwin") {
      this.mainWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true
      })
      this.mainWindow.setHiddenInMissionControl(true)
      this.mainWindow.setAlwaysOnTop(true, "floating")
    }
    if (process.platform === "linux") {
      // Linux-specific optimizations for better compatibility
      if (this.mainWindow.setHasShadow) {
        this.mainWindow.setHasShadow(false)
      }
      // Keep window focusable on Linux for proper interaction
      this.mainWindow.setFocusable(true)
    } 
    this.mainWindow.setSkipTaskbar(true)
    this.mainWindow.setAlwaysOnTop(true)

    // Check if a port is serving Vite by making HTTP request and checking response
    const checkVitePort = (port: number): Promise<boolean> => {
      return new Promise((resolve) => {
        const req = http.get(`http://localhost:${port}`, { timeout: 2000 }, (res) => {
          // Check status code first - must be 200
          if (res.statusCode !== 200) {
            res.resume() // Consume response to free up memory
            resolve(false)
            return
          }

          // Check content-type - must be HTML
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
            
            // Check if response contains HTML structure (Vite serves HTML)
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
            // Final check - must have HTML content
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

    // Find available Vite port by checking ports in order (5181 first since 5180 is often busy)
    const findVitePort = async (): Promise<number> => {
      // Check 5181 first (Vite often uses this when 5180 is busy), then 5180, then others
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
      // Default to 5181 if none found (most likely port when 5180 is busy)
      console.warn(`⚠️ Vite server not found on any port, defaulting to 5181`)
      return 5181
    }

    // Load URL after finding correct port
    const loadViteUrl = async () => {
      if (!this.mainWindow) return
      
      // Add console message handlers to debug renderer errors
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
        
        // Wait a bit and check if content loaded
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

        // Show window after loading URL and center it
        this.mainWindow.once('ready-to-show', () => {
          if (this.mainWindow) {
            // Center the window first
            this.centerWindow()
            this.mainWindow.show()
            this.mainWindow.focus()
            this.mainWindow.setAlwaysOnTop(true)
            this.isWindowVisible = true
            console.log("Window is now visible and centered")
            // Initial theme detection
            this.debouncedDetectTheme()
          }
        })
        
        // Listen for window focus to potentially refresh token
        this.mainWindow.on('focus', () => {
          console.log("[WindowHelper] Window received focus")
          // Small delay to ensure React is ready, then notify about focus
          setTimeout(() => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send("window-focused")
            }
          }, 100)
        })

    // Fallback: show window after 2 seconds even if ready-to-show didn't fire
    setTimeout(() => {
      if (this.mainWindow && !this.isWindowVisible) {
        console.log("Fallback: showing window after timeout")
        this.centerWindow()
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
      }
    })

    this.mainWindow.on("resize", () => {
      if (this.mainWindow) {
        const bounds = this.mainWindow.getBounds()
        this.windowSize = { width: bounds.width, height: bounds.height }
        this.debouncedDetectTheme()
      }
    })

    this.mainWindow.on("closed", () => {
      this.mainWindow = null
      this.isWindowVisible = false
      this.windowPosition = null
      this.windowSize = null
    })
  }

  // --- Theme detection based on background brightness ---
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
        // top strip above window
        { left: bounds.x, top: Math.max(bounds.y - strip, 0), width: bounds.width, height: Math.min(strip, bounds.y) },
        // bottom strip below window
        { left: bounds.x, top: Math.min(bounds.y + bounds.height, imgHeight - strip), width: bounds.width, height: Math.min(strip, imgHeight - (bounds.y + bounds.height)) },
        // left strip
        { left: Math.max(bounds.x - strip, 0), top: bounds.y, width: Math.min(strip, bounds.x), height: bounds.height },
        // right strip
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
    
    // Get current window size or use defaults
    const windowBounds = this.mainWindow.getBounds()
    const windowWidth = windowBounds.width || 400
    const windowHeight = windowBounds.height || 600
    
    // Calculate center position
    const centerX = Math.floor((workArea.width - windowWidth) / 2)
    const centerY = Math.floor((workArea.height - windowHeight) / 2)
    
    // Set window position
    this.mainWindow.setBounds({
      x: centerX,
      y: centerY,
      width: windowWidth,
      height: windowHeight
    })
    
    // Update internal state
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

  // New methods for window movement
  public moveWindowRight(): void {
    if (!this.mainWindow) return

    const windowWidth = this.windowSize?.width || 0
    const halfWidth = windowWidth / 2

    // Ensure currentX and currentY are numbers
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

    // Ensure currentX and currentY are numbers
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

    // Ensure currentX and currentY are numbers
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

    // Ensure currentX and currentY are numbers
    this.currentX = Number(this.currentX) || 0
    this.currentY = Number(this.currentY) || 0

    this.currentY = Math.max(-halfHeight, this.currentY - this.step)
    this.mainWindow.setPosition(
      Math.round(this.currentX),
      Math.round(this.currentY)
    )
  }
}
