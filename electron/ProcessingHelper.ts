import { AppState } from "./main"
import { LLMHelper } from "./LLMHelper"
import { KeyClient, KeysResponse } from "./KeyClient"
import dotenv from "dotenv"
import path from "path"

// Load .env from app directory (works in both dev and production)
const isDev = process.env.NODE_ENV === "development"
// In production, .env should be in resources folder or next to executable
const envPath = isDev 
  ? path.join(__dirname, "../../.env")
  : path.join((process as any).resourcesPath || path.dirname(process.execPath), ".env")
dotenv.config({ path: envPath })

// Also try .env in the same directory as the executable (for portable Windows builds)
if (!isDev && process.platform === "win32") {
  try {
    const portableEnvPath = path.join(path.dirname(process.execPath), ".env")
    dotenv.config({ path: portableEnvPath, override: false })
  } catch (e) {
    // Ignore if .env doesn't exist in portable location
  }
}
const isDevTest = process.env.IS_DEV_TEST === "true"
const MOCK_API_WAIT_TIME = Number(process.env.MOCK_API_WAIT_TIME) || 500

export class ProcessingHelper {
  private appState: AppState
  private llmHelper: LLMHelper | null = null
  private currentProcessingAbortController: AbortController | null = null
  private currentExtraProcessingAbortController: AbortController | null = null

  constructor(appState: AppState) {
    this.appState = appState
  }
    
  public async initialize(): Promise<void> {
    const keyAgentUrl = process.env.KEY_AGENT_URL
    const clientToken = process.env.KEY_AGENT_CLIENT_TOKEN
    const useOllama = process.env.USE_OLLAMA === "true"
    const ollamaModel = process.env.OLLAMA_MODEL
    const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434"

    const initFromKeys = (keys: KeysResponse) => {
      if (!keys) {
        throw new Error("Keys are required. Must be fetched from key-agent backend.")
      }
    
    if (useOllama) {
      console.log("[ProcessingHelper] Initializing with Ollama")
        if (!keys.primary) {
          throw new Error("Primary AI keys are required from backend")
        }
        this.llmHelper = new LLMHelper(undefined, true, ollamaModel, ollamaUrl, keys.primary)
        return
      }

      const list: string[] = []
      if (keys?.gemini?.apiKeys?.length) {
        list.push(...keys.gemini.apiKeys)
      }
      if (list.length === 0) {
        throw new Error("Gemini API key(s) not found from key-agent. Backend must provide GEMINI_API_KEYS or enable USE_OLLAMA=true")
      }
      
      if (!keys.primary) {
        throw new Error("Primary AI keys are required from backend")
      }
      
      console.log(`[ProcessingHelper] Initializing with Gemini (keys: ${list.length}) + Primary from backend`)
      this.llmHelper = new LLMHelper(list, false, undefined, undefined, keys.primary)
    }

    if (keyAgentUrl) {
      const kc = new KeyClient(keyAgentUrl, clientToken)
      try {
        const fetched = await kc.getKeys(false)
        if (!fetched) {
          throw new Error("Key-agent returned empty response")
        }
        initFromKeys(fetched)
        console.log("[ProcessingHelper] Initialized with keys from key-agent backend")
      } catch (e) {
        const errMsg = (e as any)?.message || String(e)
        console.error("[ProcessingHelper] CRITICAL: Failed to fetch keys from key-agent:", errMsg)
        throw new Error(`Cannot start without keys from backend: ${errMsg}`)
      }
    } else {
      console.warn("[ProcessingHelper] WARNING: KEY_AGENT_URL not set. Using env variables (dev mode only).")
      const envPrimary = process.env.PRIMARY_TOKEN && process.env.PRIMARY_WS_URL && process.env.PRIMARY_CHAT_URL && process.env.PRIMARY_MODEL
        ? {
            token: process.env.PRIMARY_TOKEN,
            wsUrl: process.env.PRIMARY_WS_URL,
            chatUrl: process.env.PRIMARY_CHAT_URL,
            model: process.env.PRIMARY_MODEL
          }
        : null

      if (useOllama) {
        if (!envPrimary) {
          throw new Error("In dev mode: PRIMARY_TOKEN, PRIMARY_WS_URL, PRIMARY_CHAT_URL, PRIMARY_MODEL env vars required, or set KEY_AGENT_URL to use backend")
        }
        this.llmHelper = new LLMHelper(undefined, true, ollamaModel, ollamaUrl, envPrimary)
        return
      }

      const envKeys: string[] = []
      const listFromCombined = (process.env.GEMINI_API_KEYS || "")
        .split(/[,\s]+/)
        .map(k => k.trim())
        .filter(k => !!k)
      envKeys.push(...listFromCombined)
      const direct = process.env.GEMINI_API_KEY
      if (direct) envKeys.push(direct)
      for (let i = 1; i <= 10; i++) {
        const v = process.env[`GEMINI_API_KEY_${i}`]
        if (v) envKeys.push(v)
      }
      const seen = new Set<string>()
      const list = envKeys.filter(k => (seen.has(k) ? false : (seen.add(k), true)))

      if (list.length === 0) {
        throw new Error("In dev mode: GEMINI_API_KEY(S) env vars required, or set KEY_AGENT_URL to use backend")
      }
      if (!envPrimary) {
        throw new Error("In dev mode: PRIMARY_TOKEN, PRIMARY_WS_URL, PRIMARY_CHAT_URL, PRIMARY_MODEL env vars required, or set KEY_AGENT_URL to use backend")
      }
      console.log(`[ProcessingHelper] Dev mode: Using env vars (Gemini: ${list.length} keys)`)
      this.llmHelper = new LLMHelper(list, false, undefined, undefined, envPrimary)
    }
  }

  public async processScreenshots(): Promise<void> {
    const mainWindow = this.appState.getMainWindow()
    if (!mainWindow) return

    const view = this.appState.getView()

    if (view === "queue") {
      const screenshotQueue = this.appState.getScreenshotHelper().getScreenshotQueue()
      if (screenshotQueue.length === 0) {
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.NO_SCREENSHOTS)
        return
      }

      const allPaths = this.appState.getScreenshotHelper().getScreenshotQueue();
      const lastPath = allPaths[allPaths.length - 1];
      if (lastPath.endsWith('.mp3') || lastPath.endsWith('.wav')) {
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_START);
        this.appState.setView('solutions');
        try {
          const audioResult = await this.llmHelper.analyzeAudioFile(lastPath);
          mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.PROBLEM_EXTRACTED, audioResult);
          this.appState.setProblemInfo({ problem_statement: audioResult.text, input_format: {}, output_format: {}, constraints: [], test_cases: [] });
          return;
        } catch (err: any) {
          console.error('Audio processing error:', err);
          mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, err.message);
          return;
        }
      }

      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_START)
      this.appState.setView("solutions")
      this.currentProcessingAbortController = new AbortController()
      try {
        const imageResult = await this.llmHelper.analyzeImageFile(lastPath);
        const problemInfo = {
          problem_statement: imageResult.text,
          input_format: { description: "Generated from screenshot", parameters: [] as any[] },
          output_format: { description: "Generated from screenshot", type: "string", subtype: "text" },
          complexity: { time: "N/A", space: "N/A" },
          test_cases: [] as any[],
          validation_type: "manual",
          difficulty: "custom"
        };
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.PROBLEM_EXTRACTED, problemInfo);
        this.appState.setProblemInfo(problemInfo);
      } catch (error: any) {
        console.error("Image processing error:", error)
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, error.message)
      } finally {
        this.currentProcessingAbortController = null
      }
      return;
    } else {
      const extraScreenshotQueue = this.appState.getScreenshotHelper().getExtraScreenshotQueue()
      if (extraScreenshotQueue.length === 0) {
        console.log("No extra screenshots to process")
        mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.NO_SCREENSHOTS)
        return
      }

      mainWindow.webContents.send(this.appState.PROCESSING_EVENTS.DEBUG_START)
      this.currentExtraProcessingAbortController = new AbortController()

      try {
        const problemInfo = this.appState.getProblemInfo()
        if (!problemInfo) {
          throw new Error("No problem info available")
        }

        const currentSolution = await this.llmHelper.generateSolution(problemInfo)
        const currentCode = currentSolution.solution.code

        const debugResult = await this.llmHelper.debugSolutionWithImages(
          problemInfo,
          currentCode,
          extraScreenshotQueue
        )

        this.appState.setHasDebugged(true)
        mainWindow.webContents.send(
          this.appState.PROCESSING_EVENTS.DEBUG_SUCCESS,
          debugResult
        )

      } catch (error: any) {
        console.error("Debug processing error:", error)
        mainWindow.webContents.send(
          this.appState.PROCESSING_EVENTS.DEBUG_ERROR,
          error.message
        )
      } finally {
        this.currentExtraProcessingAbortController = null
      }
    }
  }

  public cancelOngoingRequests(): void {
    if (this.currentProcessingAbortController) {
      this.currentProcessingAbortController.abort()
      this.currentProcessingAbortController = null
    }

    if (this.currentExtraProcessingAbortController) {
      this.currentExtraProcessingAbortController.abort()
      this.currentExtraProcessingAbortController = null
    }

    this.appState.setHasDebugged(false)
  }

  public async processAudioBase64(data: string, mimeType: string, chatHistory?: string) {
    return this.llmHelper.analyzeAudioFromBase64(data, mimeType, chatHistory);
  }

  public async processAudioFile(filePath: string) {
    return this.llmHelper.analyzeAudioFile(filePath);
  }

  public getLLMHelper(): LLMHelper {
    if (!this.llmHelper) {
      throw new Error("ProcessingHelper not initialized. Call initialize() first.")
    }
    return this.llmHelper;
  }
}
