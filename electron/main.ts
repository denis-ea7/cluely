import { app, BrowserWindow, Tray, Menu, nativeImage, session, desktopCapturer, screen, dialog } from "electron"
import { ProxyAgent, setGlobalDispatcher } from "undici"
import dotenv from "dotenv"
import path from "path"
import { initializeIpcHandlers } from "./ipcHandlers"
import { WindowHelper } from "./WindowHelper"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { ShortcutsHelper } from "./shortcuts"
import { ProcessingHelper } from "./ProcessingHelper"
import { TokenManager } from "./TokenManager"
import { PremiumManager } from "./PremiumManager"

const isDev = process.env.NODE_ENV === "development"

export class AppState {
  private static instance: AppState | null = null

  private windowHelper: WindowHelper
  private screenshotHelper: ScreenshotHelper
  public shortcutsHelper: ShortcutsHelper
  public processingHelper: ProcessingHelper
  public premiumManager!: PremiumManager
  private tray: Tray | null = null

  private view: "queue" | "solutions" = "queue"

  private problemInfo: {
    problem_statement: string
    input_format: Record<string, any>
    output_format: Record<string, any>
    constraints: Array<Record<string, any>>
    test_cases: Array<Record<string, any>>
  } | null = null

  private hasDebugged: boolean = false

  public readonly PROCESSING_EVENTS = {
    UNAUTHORIZED: "procesing-unauthorized",
    NO_SCREENSHOTS: "processing-no-screenshots",

    INITIAL_START: "initial-start",
    PROBLEM_EXTRACTED: "problem-extracted",
    SOLUTION_SUCCESS: "solution-success",
    INITIAL_SOLUTION_ERROR: "solution-error",

    DEBUG_START: "debug-start",
    DEBUG_SUCCESS: "debug-success",
    DEBUG_ERROR: "debug-error"
  } as const

  constructor() {
    this.windowHelper = new WindowHelper(this)

    this.screenshotHelper = new ScreenshotHelper(this.view)

    this.processingHelper = new ProcessingHelper(this)

    this.shortcutsHelper = new ShortcutsHelper(this)
  }

  public static getInstance(): AppState {
    if (!AppState.instance) {
      AppState.instance = new AppState()
    }
    return AppState.instance
  }

  public getMainWindow(): BrowserWindow | null {
    return this.windowHelper.getMainWindow()
  }

  public getView(): "queue" | "solutions" {
    return this.view
  }

  public setView(view: "queue" | "solutions"): void {
    this.view = view
    this.screenshotHelper.setView(view)
  }

  public isVisible(): boolean {
    return this.windowHelper.isVisible()
  }

  public getScreenshotHelper(): ScreenshotHelper {
    return this.screenshotHelper
  }

  public getProblemInfo(): any {
    return this.problemInfo
  }

  public setProblemInfo(problemInfo: any): void {
    this.problemInfo = problemInfo
  }

  public getScreenshotQueue(): string[] {
    return this.screenshotHelper.getScreenshotQueue()
  }

  public getExtraScreenshotQueue(): string[] {
    return this.screenshotHelper.getExtraScreenshotQueue()
  }

  public createWindow(): void {
    this.windowHelper.createWindow()
  }

  public hideMainWindow(): void {
    this.windowHelper.hideMainWindow()
  }

  public showMainWindow(): void {
    this.windowHelper.showMainWindow()
  }

  public toggleMainWindow(): void {
    console.log(
      "Screenshots: ",
      this.screenshotHelper.getScreenshotQueue().length,
      "Extra screenshots: ",
      this.screenshotHelper.getExtraScreenshotQueue().length
    )
    this.windowHelper.toggleMainWindow()
  }

  public setWindowDimensions(width: number, height: number): void {
    this.windowHelper.setWindowDimensions(width, height)
  }

  public ensureWindowSize(minWidth: number, minHeight: number): void {
    this.windowHelper.ensureWindowSize(minWidth, minHeight)
  }

  public setWindowOpacity(opacity: number): void {
    this.windowHelper.setWindowOpacity(opacity)
  }

  public setContentProtection(enabled: boolean): void {
    this.windowHelper.setContentProtection(enabled)
  }

  public clearQueues(): void {
    this.screenshotHelper.clearQueues()

    this.problemInfo = null

    this.setView("queue")
  }

  public async takeScreenshot(): Promise<string> {
    if (!this.getMainWindow()) throw new Error("No main window available")

    const screenshotPath = await this.screenshotHelper.takeScreenshot(
      () => this.hideMainWindow(),
      () => this.showMainWindow()
    )

    return screenshotPath
  }

  public async getImagePreview(filepath: string): Promise<string> {
    return this.screenshotHelper.getImagePreview(filepath)
  }

  public async deleteScreenshot(
    path: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.screenshotHelper.deleteScreenshot(path)
  }

  public moveWindowLeft(): void {
    this.windowHelper.moveWindowLeft()
  }

  public moveWindowRight(): void {
    this.windowHelper.moveWindowRight()
  }
  public moveWindowDown(): void {
    this.windowHelper.moveWindowDown()
  }
  public moveWindowUp(): void {
    this.windowHelper.moveWindowUp()
  }

  public centerAndShowWindow(): void {
    this.windowHelper.centerAndShowWindow()
  }

  public createTray(): void {
    const image = nativeImage.createEmpty()
    
    let trayImage = image
    try {
      trayImage = nativeImage.createFromBuffer(Buffer.alloc(0))
    } catch (error) {
      console.log("Using empty tray image")
      trayImage = nativeImage.createEmpty()
    }
    
    this.tray = new Tray(trayImage)
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Interview Coder',
        click: () => {
          this.centerAndShowWindow()
        }
      },
      {
        label: 'Toggle Window',
        click: () => {
          this.toggleMainWindow()
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Take Screenshot (Cmd+H)',
        click: async () => {
          try {
            const screenshotPath = await this.takeScreenshot()
            const preview = await this.getImagePreview(screenshotPath)
            const mainWindow = this.getMainWindow()
            if (mainWindow) {
              mainWindow.webContents.send("screenshot-taken", {
                path: screenshotPath,
                preview
              })
            }
          } catch (error) {
            console.error("Error taking screenshot from tray:", error)
          }
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Quit',
        accelerator: 'Command+Q',
        click: () => {
          app.quit()
        }
      }
    ])
    
    this.tray.setToolTip('Interview Coder - Press Cmd+Shift+Space to show')
    this.tray.setContextMenu(contextMenu)
    
    if (process.platform === 'darwin') {
      this.tray.setTitle('IC')
    }
    
    this.tray.on('double-click', () => {
      this.centerAndShowWindow()
    })
  }

  public setHasDebugged(value: boolean): void {
    this.hasDebugged = value
  }

  public getHasDebugged(): boolean {
    return this.hasDebugged
  }
}

async function initializeApp() {
  try {
    // Load .env from app directory (works in both dev and production)
    const envPath = isDev 
      ? path.join(__dirname, "../.env")
      : path.join(process.resourcesPath, "../.env")
    dotenv.config({ path: envPath })
    
    // Also try .env in the same directory as the executable (for portable Windows builds)
    if (!isDev && process.platform === "win32") {
      const portableEnvPath = path.join(path.dirname(process.execPath), ".env")
      try {
        dotenv.config({ path: portableEnvPath, override: false })
      } catch (e) {
        // Ignore if .env doesn't exist in portable location
      }
    }
    
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.PROXY_URL
    if (proxyUrl) {
      setGlobalDispatcher(new ProxyAgent(proxyUrl))
      console.log("Global proxy enabled for HTTP(S) via:", proxyUrl.replace(/:\\S+@/, ":***@"))
    }
  } catch (e) {
    console.warn("Proxy setup skipped:", e)
  }
  const appState = AppState.getInstance()
  const tokenManager = new TokenManager()
  const apiUrl = process.env.API_URL || process.env.SITE_URL?.replace(":3005", ":4000") || "http://109.61.108.37:4000"
  const premiumManager = new PremiumManager(tokenManager, apiUrl)
  appState.premiumManager = premiumManager

  // Initialize ProcessingHelper after app is ready so window can show errors
  let processingHelperInitialized = false
  let processingHelperError: string | null = null

  app.whenReady().then(async () => {
    // Create window first so we can show errors if needed
    appState.createWindow()
    appState.createTray()
    
    // Try to initialize ProcessingHelper
    try {
      console.log("[main] Initializing ProcessingHelper...")
      await appState.processingHelper.initialize()
      console.log("[main] ProcessingHelper initialized successfully")
      processingHelperInitialized = true
    } catch (e: any) {
      const errorMsg = e?.message || String(e)
      console.error("[main] CRITICAL: Failed to initialize ProcessingHelper:", errorMsg)
      console.error("[main] Application cannot start without keys from backend")
      processingHelperError = errorMsg
      
      // Show error dialog to user
      const mainWindow = appState.getMainWindow()
      if (mainWindow) {
        try {
          await dialog.showMessageBox(mainWindow, {
            type: "error",
            title: "Ошибка инициализации",
            message: "Не удалось инициализировать приложение",
            detail: `Ошибка: ${errorMsg}\n\nУбедитесь, что KEY_AGENT_URL правильно настроен и доступен.`,
            buttons: ["Закрыть"]
          })
        } catch (err) {
          console.error("[main] Error showing error dialog:", err)
        } finally {
          app.quit()
        }
      } else {
        // If window creation failed too, just quit
        app.quit()
      }
      return
    }

    // Continue with normal initialization
    appState.shortcutsHelper.registerGlobalShortcuts()
    
    const token = tokenManager.load()
    if (token) {
      console.log("[main] Token found, starting premium session...")
      try {
        const premiumInfo = await premiumManager.startSession()
        console.log("[main] Premium session started:", premiumInfo)
        
        const mainWindow = appState.getMainWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("premium-status-updated", premiumInfo)
        }
      } catch (e) {
        console.error("[main] Error starting premium session:", e)
      }
    }
  })

  initializeIpcHandlers(appState)

  const scheme = process.env.DEEPLINK_SCHEME || "cluely"
  
  const gotTheLock = app.requestSingleInstanceLock()
  if (!gotTheLock) {
    console.log("[main] Another instance is running, quitting...")
    app.quit()
    return
  }
  
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(scheme, process.execPath, [path.resolve(process.argv[1])])
    }
  } else {
    app.setAsDefaultProtocolClient(scheme)
  }
  console.log(`[main] Deep link scheme registered: ${scheme}://`)

  async function handleDeepLink(url: string, tokenManager: TokenManager, appState: AppState, scheme: string) {
    try {
      const parsed = new URL(url)
      console.log(`[main] Parsed URL - protocol: ${parsed.protocol}, hostname: ${parsed.hostname}`)
      if (parsed.protocol === `${scheme}:` && parsed.hostname === "auth") {
        const token = parsed.searchParams.get("token")
        if (token && token.length > 0) {
          console.log(`[main] Token received from deep link, length: ${token.length}`)
          console.log(`[main] Token preview: ${token.substring(0, 30)}...`)
          tokenManager.save(token)
          const savedToken = tokenManager.load()
          if (savedToken === token) {
            console.log(`[main] Token saved and verified successfully`)
            
            try {
              const premiumInfo = await appState.premiumManager.startSession()
              console.log(`[main] Premium session started after auth:`, premiumInfo)
              
              const notifyPremiumUpdate = (delay: number = 0) => {
                setTimeout(() => {
                  const mainWindow = appState.getMainWindow()
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    try {
                      const currentInfo = appState.premiumManager.getPremiumInfo()
                      if (currentInfo) {
                        mainWindow.webContents.send("premium-status-updated", currentInfo)
                        console.log(`[main] ✅ Sent premium-status-updated event`)
                      }
                    } catch (e) {
                      console.error(`[main] ❌ Error sending premium-status-updated event:`, e)
                    }
                  }
                }, delay)
              }
              
              notifyPremiumUpdate(500)
              notifyPremiumUpdate(1500)
            } catch (e) {
              console.error(`[main] Error starting premium session:`, e)
            }
            
            const notifyTokenUpdate = (delay: number = 0) => {
              setTimeout(() => {
                const mainWindow = appState.getMainWindow()
                if (mainWindow && !mainWindow.isDestroyed()) {
                  try {
                    if (mainWindow.webContents.isLoading()) {
                      console.log(`[main] Window still loading, will send token-updated after load`)
                      mainWindow.webContents.once('did-finish-load', () => {
                        setTimeout(() => {
                          mainWindow.webContents.send("token-updated", token)
                          console.log(`[main] ✅ Sent token-updated event to renderer (after load)`)
                        }, 300)
                      })
                    } else {
                      mainWindow.webContents.send("token-updated", token)
                      console.log(`[main] ✅ Sent token-updated event to renderer process`)
                    }
                  } catch (e) {
                    console.error(`[main] ❌ Error sending token-updated event:`, e)
                  }
                } else {
                  console.warn(`[main] ⚠️ Main window not available, cannot send token-updated event`)
                }
              }, delay)
            }
            
            if (app.isReady()) {
              const mainWindow = appState.getMainWindow()
              if (mainWindow && !mainWindow.isDestroyed()) {
                if (mainWindow.isMinimized()) {
                  mainWindow.restore()
                }
                if (process.platform === "darwin") {
                  app.dock?.show()
                }
                mainWindow.show()
                mainWindow.focus()
                mainWindow.setAlwaysOnTop(true)
              }
              
              appState.centerAndShowWindow()
              console.log(`[main] Window restored and shown after auth`)
              
              notifyTokenUpdate(300)
              notifyTokenUpdate(1000)
              notifyTokenUpdate(2000)
            } else {
              console.log(`[main] App not ready yet, token saved. Window will show when app is ready.`)
              app.whenReady().then(() => {
                const mainWindow = appState.getMainWindow()
                if (mainWindow && !mainWindow.isDestroyed()) {
                  if (mainWindow.isMinimized()) {
                    mainWindow.restore()
                  }
                  if (process.platform === "darwin") {
                    app.dock?.show()
                  }
                  mainWindow.show()
                  mainWindow.focus()
                }
                appState.centerAndShowWindow()
                notifyTokenUpdate(300)
                notifyTokenUpdate(1000)
                notifyTokenUpdate(2000)
              })
            }
          } else {
            console.error(`[main] Token save verification failed!`)
          }
        } else {
          console.error("[main] No token or empty token in deep link URL")
        }
      } else {
        console.warn(`[main] Invalid deep link format: ${url}`)
      }
    } catch (e) {
      console.error("[main] Failed to handle deep link:", e)
    }
  }

  app.on("open-url", (event, url) => {
    event.preventDefault()
    console.log(`[main] Deep link received (macOS): ${url}`)
    handleDeepLink(url, tokenManager, appState, scheme)
  })

  const maybeUrl = process.argv.find(arg => arg.startsWith(`${scheme}://`))
  if (maybeUrl) {
    console.log(`[main] Deep link received (Windows/Linux): ${maybeUrl}`)
    handleDeepLink(maybeUrl, tokenManager, appState, scheme)
  }
  
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    const deepLinkUrl = commandLine.find(arg => arg.startsWith(`${scheme}://`))
    if (deepLinkUrl) {
      console.log(`[main] Deep link received via second-instance: ${deepLinkUrl}`)
      handleDeepLink(deepLinkUrl, tokenManager, appState, scheme)
    }
  })

  // Setup display media handler for system audio capture (like original Cluely)
  function setupDisplayMediaHandler() {
    session.defaultSession.setDisplayMediaRequestHandler(
      (request, callback) => {
        desktopCapturer.getSources({ types: ["screen"] }).then((sources) => {
          if (sources.length === 0) {
            console.warn("[DisplayMedia] No display sources found")
            callback({})
            return
          }

          const displays = screen.getAllDisplays()
          
          // Try to find internal display first (macOS)
          for (const display of displays) {
            if ((display as any).internal) {
              const source = sources.find(
                (s) => s.display_id === String(display.id)
              )
              if (source) {
                callback({ video: source, audio: "loopback" })
                return
              }
            }
          }

          // Fallback to primary display
          const primaryDisplay = screen.getPrimaryDisplay()
          const primarySource = sources.find(
            (s) => s.display_id === String(primaryDisplay.id)
          )
          if (primarySource) {
            callback({ video: primarySource, audio: "loopback" })
            return
          }

          // Last resort: use first available source
          callback({ video: sources[0], audio: "loopback" })
        }).catch((error) => {
          console.error("[DisplayMedia] Error getting sources:", error)
          callback({})
        })
      },
      { useSystemPicker: false }
    )
    console.log("[DisplayMedia] Handler configured for system audio capture")
  }

  app.whenReady().then(() => {
    console.log("App is ready")
    setupDisplayMediaHandler()
    // Window creation moved above to show initialization errors
  })

  app.on("activate", () => {
    console.log("App activated")
    if (appState.getMainWindow() === null) {
      appState.createWindow()
    }
  })

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit()
    }
  })

  app.dock?.hide()
  app.commandLine.appendSwitch("disable-background-timer-throttling")
}

initializeApp().catch(console.error)
