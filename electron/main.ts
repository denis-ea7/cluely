import { app, BrowserWindow, Tray, Menu, nativeImage } from "electron"
import { ProxyAgent, setGlobalDispatcher } from "undici"
import dotenv from "dotenv"
import path from "path"
import { initializeIpcHandlers } from "./ipcHandlers"
import { WindowHelper } from "./WindowHelper"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { ShortcutsHelper } from "./shortcuts"
import { ProcessingHelper } from "./ProcessingHelper"
import { TokenManager } from "./TokenManager"

export class AppState {
  private static instance: AppState | null = null

  private windowHelper: WindowHelper
  private screenshotHelper: ScreenshotHelper
  public shortcutsHelper: ShortcutsHelper
  public processingHelper: ProcessingHelper
  private tray: Tray | null = null

  // View management
  private view: "queue" | "solutions" = "queue"

  private problemInfo: {
    problem_statement: string
    input_format: Record<string, any>
    output_format: Record<string, any>
    constraints: Array<Record<string, any>>
    test_cases: Array<Record<string, any>>
  } | null = null // Allow null

  private hasDebugged: boolean = false

  // Processing events
  public readonly PROCESSING_EVENTS = {
    //global states
    UNAUTHORIZED: "procesing-unauthorized",
    NO_SCREENSHOTS: "processing-no-screenshots",

    //states for generating the initial solution
    INITIAL_START: "initial-start",
    PROBLEM_EXTRACTED: "problem-extracted",
    SOLUTION_SUCCESS: "solution-success",
    INITIAL_SOLUTION_ERROR: "solution-error",

    //states for processing the debugging
    DEBUG_START: "debug-start",
    DEBUG_SUCCESS: "debug-success",
    DEBUG_ERROR: "debug-error"
  } as const

  constructor() {
    // Initialize WindowHelper with this
    this.windowHelper = new WindowHelper(this)

    // Initialize ScreenshotHelper
    this.screenshotHelper = new ScreenshotHelper(this.view)

    // Initialize ProcessingHelper
    this.processingHelper = new ProcessingHelper(this)

    // Initialize ShortcutsHelper
    this.shortcutsHelper = new ShortcutsHelper(this)
  }

  public static getInstance(): AppState {
    if (!AppState.instance) {
      AppState.instance = new AppState()
    }
    return AppState.instance
  }

  // Getters and Setters
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

  // Window management methods
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

  public clearQueues(): void {
    this.screenshotHelper.clearQueues()

    // Clear problem info
    this.problemInfo = null

    // Reset view to initial state
    this.setView("queue")
  }

  // Screenshot management methods
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

  // New methods to move the window
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
    // Create a simple tray icon
    const image = nativeImage.createEmpty()
    
    // Try to use a system template image for better integration
    let trayImage = image
    try {
      // Create a minimal icon - just use an empty image and set the title
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
    
    // Set a title for macOS (will appear in menu bar)
    if (process.platform === 'darwin') {
      this.tray.setTitle('IC')
    }
    
    // Double-click to show window
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

// Application initialization
async function initializeApp() {
  // Load .env and setup proxy if provided
  try {
    dotenv.config()
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

  // Initialize ProcessingHelper (loads keys from backend if KEY_AGENT_URL is set)
  try {
    console.log("[main] Initializing ProcessingHelper...")
    await appState.processingHelper.initialize()
    console.log("[main] ProcessingHelper initialized successfully")
  } catch (e: any) {
    console.error("[main] CRITICAL: Failed to initialize ProcessingHelper:", e.message)
    console.error("[main] Application cannot start without keys from backend")
    app.quit()
    return
  }

  // Initialize IPC handlers before window creation
  initializeIpcHandlers(appState)

  // Deep link protocol registration
  const scheme = process.env.DEEPLINK_SCHEME || "cluely"
  
  // Request single instance lock for deep link handling
  const gotTheLock = app.requestSingleInstanceLock()
  if (!gotTheLock) {
    console.log("[main] Another instance is running, quitting...")
    app.quit()
    return
  }
  
  // Register protocol handler
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(scheme, process.execPath, [path.resolve(process.argv[1])])
    }
  } else {
    app.setAsDefaultProtocolClient(scheme)
  }
  console.log(`[main] Deep link scheme registered: ${scheme}://`)

  // Helper function to handle deep links
  function handleDeepLink(url: string, tokenManager: TokenManager, appState: AppState, scheme: string) {
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
            
            // Function to notify renderer processes about token update
            const notifyTokenUpdate = (delay: number = 0) => {
              setTimeout(() => {
                const mainWindow = appState.getMainWindow()
                if (mainWindow && !mainWindow.isDestroyed()) {
                  try {
                    // Check if window is fully loaded
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
            
            // Show window if app is ready
            if (app.isReady()) {
              appState.centerAndShowWindow()
              console.log(`[main] Window centered and shown after auth`)
              
              // Notify immediately and with delays to ensure it's received
              notifyTokenUpdate(300)  // After 300ms
              notifyTokenUpdate(1000) // After 1 second
              notifyTokenUpdate(2000) // After 2 seconds (fallback)
            } else {
              console.log(`[main] App not ready yet, token saved. Window will show when app is ready.`)
              app.whenReady().then(() => {
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

  // macOS deep link handler - must be registered before app is ready
  app.on("open-url", (event, url) => {
    event.preventDefault()
    console.log(`[main] Deep link received (macOS): ${url}`)
    handleDeepLink(url, tokenManager, appState, scheme)
  })

  // Windows/Linux: handle protocol link passed as arg
  const maybeUrl = process.argv.find(arg => arg.startsWith(`${scheme}://`))
  if (maybeUrl) {
    console.log(`[main] Deep link received (Windows/Linux): ${maybeUrl}`)
    handleDeepLink(maybeUrl, tokenManager, appState, scheme)
  }
  
  // Also handle deep links when app becomes ready (for delayed deep links)
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    const deepLinkUrl = commandLine.find(arg => arg.startsWith(`${scheme}://`))
    if (deepLinkUrl) {
      console.log(`[main] Deep link received via second-instance: ${deepLinkUrl}`)
      handleDeepLink(deepLinkUrl, tokenManager, appState, scheme)
    }
  })

  app.whenReady().then(() => {
    console.log("App is ready")
    appState.createWindow()
    appState.createTray()
    // Register global shortcuts using ShortcutsHelper
    appState.shortcutsHelper.registerGlobalShortcuts()
  })

  app.on("activate", () => {
    console.log("App activated")
    if (appState.getMainWindow() === null) {
      appState.createWindow()
    }
  })

  // Quit when all windows are closed, except on macOS
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit()
    }
  })

  app.dock?.hide() // Hide dock icon (optional)
  app.commandLine.appendSwitch("disable-background-timer-throttling")
}

// Start the application
initializeApp().catch(console.error)
