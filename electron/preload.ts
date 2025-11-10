import { contextBridge, ipcRenderer } from "electron"

interface ElectronAPI {
  updateContentDimensions: (dimensions: {
    width: number
    height: number
  }) => Promise<void>
  ensureWindowSize: (dimensions: {
    width: number
    height: number
  }) => Promise<void>
  getScreenshots: () => Promise<Array<{ path: string; preview: string }>>
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }>
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => () => void
  onSolutionsReady: (callback: (solutions: string) => void) => () => void
  onResetView: (callback: () => void) => () => void
  onSolutionStart: (callback: () => void) => () => void
  onDebugStart: (callback: () => void) => () => void
  onDebugSuccess: (callback: (data: any) => void) => () => void
  onSolutionError: (callback: (error: string) => void) => () => void
  onProcessingNoScreenshots: (callback: () => void) => () => void
  onProblemExtracted: (callback: (data: any) => void) => () => void
  onSolutionSuccess: (callback: (data: any) => void) => () => void

  onUnauthorized: (callback: () => void) => () => void
  onDebugError: (callback: (error: string) => void) => () => void
  takeScreenshot: () => Promise<void>
  moveWindowLeft: () => Promise<void>
  moveWindowRight: () => Promise<void>
  moveWindowUp: () => Promise<void>
  moveWindowDown: () => Promise<void>
  analyzeAudioFromBase64: (data: string, mimeType: string) => Promise<{ text: string; timestamp: number }>
  analyzeAudioFile: (path: string) => Promise<{ text: string; timestamp: number }>
  transcribePcm16: (pcmBase64: string, sampleRate?: number) => Promise<{ text: string; timestamp: number }>
  startTranscriptionStream: () => Promise<{ success: boolean }>
  sendTranscriptionChunk: (pcmBase64: string) => Promise<{ success: boolean }>
  stopTranscriptionStream: () => Promise<{ success: boolean }>
  onTranscriptionInterim: (callback: (data: { text: string }) => void) => () => void
  onTranscriptionError: (callback: (data: { error: string }) => void) => () => void
  analyzeImageFile: (path: string) => Promise<void>
  quitApp: () => Promise<void>
  
  getToken: () => Promise<string | null>
  setToken: (token: string) => Promise<{ success: boolean; error?: string }>
  clearToken: () => Promise<{ success: boolean }>
  openAuth: () => Promise<{ success: boolean }>
  
  getCurrentLlmConfig: () => Promise<{ provider: "ollama" | "gemini"; model: string; isOllama: boolean }>
  getAvailableOllamaModels: () => Promise<string[]>
  switchToOllama: (model?: string, url?: string) => Promise<{ success: boolean; error?: string }>
  switchToGemini: (apiKey?: string) => Promise<{ success: boolean; error?: string }>
  testLlmConnection: () => Promise<{ success: boolean; error?: string }>
  
  invoke: (channel: string, ...args: any[]) => Promise<any>
  onThemeChange: (callback: (theme: "dark" | "dark") => void) => () => void
  onTokenUpdated: (callback: (token: string) => void) => () => void
  onWindowFocused: (callback: () => void) => () => void
  
  getPremiumInfo: () => Promise<{ isPremium: boolean; premiumUntil: string | null; timeRemaining: number | null }>
  canUseApp: () => Promise<boolean>
  openPremiumPurchase: () => Promise<{ success: boolean }>
  refreshPremiumInfo: () => Promise<{ isPremium: boolean; premiumUntil: string | null; timeRemaining: number | null }>
  onPremiumStatusUpdated: (callback: (info: { isPremium: boolean; premiumUntil: string | null; timeRemaining: number | null }) => void) => () => void
}

export const PROCESSING_EVENTS = {
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

contextBridge.exposeInMainWorld("electronAPI", {
  updateContentDimensions: (dimensions: { width: number; height: number }) =>
    ipcRenderer.invoke("update-content-dimensions", dimensions),
  ensureWindowSize: (dimensions: { width: number; height: number }) =>
    ipcRenderer.invoke("ensure-window-size", dimensions),
  takeScreenshot: () => ipcRenderer.invoke("take-screenshot"),
  getScreenshots: () => ipcRenderer.invoke("get-screenshots"),
  deleteScreenshot: (path: string) =>
    ipcRenderer.invoke("delete-screenshot", path),

  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => {
    const subscription = (_: any, data: { path: string; preview: string }) =>
      callback(data)
    ipcRenderer.on("screenshot-taken", subscription)
    return () => {
      ipcRenderer.removeListener("screenshot-taken", subscription)
    }
  },
  onSolutionsReady: (callback: (solutions: string) => void) => {
    const subscription = (_: any, solutions: string) => callback(solutions)
    ipcRenderer.on("solutions-ready", subscription)
    return () => {
      ipcRenderer.removeListener("solutions-ready", subscription)
    }
  },
  onResetView: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("reset-view", subscription)
    return () => {
      ipcRenderer.removeListener("reset-view", subscription)
    }
  },
  onSolutionStart: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_START, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.INITIAL_START, subscription)
    }
  },
  onDebugStart: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.DEBUG_START, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.DEBUG_START, subscription)
    }
  },

  onDebugSuccess: (callback: (data: any) => void) => {
    ipcRenderer.on("debug-success", (_event, data) => callback(data))
    return () => {
      ipcRenderer.removeListener("debug-success", (_event, data) =>
        callback(data)
      )
    }
  },
  onDebugError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on(PROCESSING_EVENTS.DEBUG_ERROR, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.DEBUG_ERROR, subscription)
    }
  },
  onSolutionError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
        subscription
      )
    }
  },
  onProcessingNoScreenshots: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.NO_SCREENSHOTS, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.NO_SCREENSHOTS, subscription)
    }
  },

  onProblemExtracted: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.PROBLEM_EXTRACTED, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.PROBLEM_EXTRACTED,
        subscription
      )
    }
  },
  onSolutionSuccess: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.SOLUTION_SUCCESS, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.SOLUTION_SUCCESS,
        subscription
      )
    }
  },
  onUnauthorized: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.UNAUTHORIZED, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.UNAUTHORIZED, subscription)
    }
  },
  moveWindowLeft: () => ipcRenderer.invoke("move-window-left"),
  moveWindowRight: () => ipcRenderer.invoke("move-window-right"),
  moveWindowUp: () => ipcRenderer.invoke("move-window-up"),
  moveWindowDown: () => ipcRenderer.invoke("move-window-down"),
  analyzeAudioFromBase64: (data: string, mimeType: string, chatHistory?: string) => ipcRenderer.invoke("analyze-audio-base64", data, mimeType, chatHistory),
  analyzeAudioFile: (path: string) => ipcRenderer.invoke("analyze-audio-file", path),
  transcribePcm16: (pcmBase64: string, sampleRate?: number) => ipcRenderer.invoke("transcribe-pcm16", pcmBase64, sampleRate),
  startTranscriptionStream: () => ipcRenderer.invoke("start-transcription-stream"),
  sendTranscriptionChunk: (pcmBase64: string) => ipcRenderer.invoke("send-transcription-chunk", pcmBase64),
  stopTranscriptionStream: () => ipcRenderer.invoke("stop-transcription-stream"),
  onTranscriptionInterim: (callback: (data: { text: string }) => void) => {
    const subscription = (_: any, data: { text: string }) => callback(data)
    ipcRenderer.on("transcription-interim", subscription)
    return () => ipcRenderer.removeListener("transcription-interim", subscription)
  },
  onTranscriptionError: (callback: (data: { error: string }) => void) => {
    const subscription = (_: any, data: { error: string }) => callback(data)
    ipcRenderer.on("transcription-error", subscription)
    return () => ipcRenderer.removeListener("transcription-error", subscription)
  },
  analyzeImageFile: (path: string) => ipcRenderer.invoke("analyze-image-file", path),
  quitApp: () => ipcRenderer.invoke("quit-app"),
  
  getToken: () => ipcRenderer.invoke("get-token"),
  setToken: (token: string) => ipcRenderer.invoke("set-token", token),
  clearToken: () => ipcRenderer.invoke("clear-token"),
  openAuth: () => ipcRenderer.invoke("open-auth"),
  
  getCurrentLlmConfig: () => ipcRenderer.invoke("get-current-llm-config"),
  getAvailableOllamaModels: () => ipcRenderer.invoke("get-available-ollama-models"),
  switchToOllama: (model?: string, url?: string) => ipcRenderer.invoke("switch-to-ollama", model, url),
  switchToGemini: (apiKey?: string) => ipcRenderer.invoke("switch-to-gemini", apiKey),
  testLlmConnection: () => ipcRenderer.invoke("test-llm-connection"),
  
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  onThemeChange: (callback: (theme: "dark" | "dark") => void) => {
    const subscription = (_: any, theme: "dark" | "dark") => callback(theme)
    ipcRenderer.on("theme-change", subscription)
    return () => ipcRenderer.removeListener("theme-change", subscription)
  },
  onTokenUpdated: (callback: (token: string) => void) => {
    const subscription = (_: any, token: string) => callback(token)
    ipcRenderer.on("token-updated", subscription)
    return () => ipcRenderer.removeListener("token-updated", subscription)
  },
  onWindowFocused: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("window-focused", subscription)
    return () => ipcRenderer.removeListener("window-focused", subscription)
  },
  getPremiumInfo: () => ipcRenderer.invoke("get-premium-info"),
  canUseApp: () => ipcRenderer.invoke("can-use-app"),
  openPremiumPurchase: () => ipcRenderer.invoke("open-premium-purchase"),
  refreshPremiumInfo: () => ipcRenderer.invoke("refresh-premium-info"),
  onPremiumStatusUpdated: (callback: (info: { isPremium: boolean; premiumUntil: string | null; timeRemaining: number | null }) => void) => {
    const subscription = (_: any, info: { isPremium: boolean; premiumUntil: string | null; timeRemaining: number | null }) => callback(info)
    ipcRenderer.on("premium-status-updated", subscription)
    return () => ipcRenderer.removeListener("premium-status-updated", subscription)
  }
} as ElectronAPI)
