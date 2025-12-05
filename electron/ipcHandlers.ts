
import { ipcMain, app, shell, BrowserWindow } from "electron"
import { AppState } from "./main"
import { TokenManager } from "./TokenManager"
import WebSocket from "ws"

// node-record-lpcm16 — CJS, подключаем через require
type NodeRecorder = { stream(): NodeJS.ReadableStream; stop(): void }
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodeRecord = require("node-record-lpcm16") as {
  record: (options: any) => NodeRecorder
}

type TranscriptionStreamEntry = {
  sendChunk: (pcmChunk: Buffer) => void
  close: () => Promise<void>
  stopSystem?: () => void
}

const activeTranscriptionStreams = new Map<number, TranscriptionStreamEntry>()

type DeepgramSession = {
  stop: () => void
}

const activeDeepgramSessions = new Map<number, DeepgramSession>()

export function initializeIpcHandlers(appState: AppState): void {
  const tokenManager = new TokenManager()
  tokenManager.load()

  ipcMain.handle(
    "update-content-dimensions",
    async (event, { width, height }: { width: number; height: number }) => {
      if (width && height) {
        appState.setWindowDimensions(width, height)
      }
    }
  )

  ipcMain.handle(
    "ensure-window-size",
    async (event, { width, height }: { width: number; height: number }) => {
      if (width && height) {
        appState.ensureWindowSize(width, height)
      }
    }
  )

  ipcMain.handle("set-window-opacity", async (event, opacity: number) => {
    if (typeof opacity === "number" && opacity >= 0 && opacity <= 1) {
      appState.setWindowOpacity(opacity)
      return { success: true }
    }
    return { success: false, error: "Invalid opacity value" }
  })

  ipcMain.handle("set-content-protection", async (event, enabled: boolean) => {
    if (typeof enabled === "boolean") {
      appState.setContentProtection(enabled)
      return { success: true }
    }
    return { success: false, error: "Invalid value" }
  })

  ipcMain.handle("delete-screenshot", async (event, path: string) => {
    return appState.deleteScreenshot(path)
  })

  
  ipcMain.handle("chat-stream-start", async (event, message: string, imagePath?: string) => {
    try {
      const helper = appState.processingHelper.getLLMHelper()
      const final = imagePath 
        ? await helper.chatStreamWithImage(message, imagePath, (delta: string) => {
            try {
              event.sender.send("chat-stream-delta", { delta })
            } catch {}
          })
        : await helper.chatStream(message, (delta: string) => {
            try {
              event.sender.send("chat-stream-delta", { delta })
            } catch {}
          })
      event.sender.send("chat-stream-complete", { text: final })
      return { ok: true }
    } catch (error: any) {
      console.error("Error in chat-stream-start:", error)
      event.sender.send("chat-stream-error", { error: String(error?.message || error) })
      throw error
    }
  })

  ipcMain.handle("take-screenshot", async () => {
    try {
      const screenshotPath = await appState.takeScreenshot()
      
      let preview = ""
      let attempts = 0
      const maxAttempts = 10
      
      while (attempts < maxAttempts) {
        try {
          const fs = require("fs")
          if (fs.existsSync(screenshotPath)) {
            preview = await appState.getImagePreview(screenshotPath)
            break
          }
        } catch (err) {
          if (attempts === maxAttempts - 1) {
            console.warn("[IPC] Failed to read preview after attempts, using empty preview")
            preview = ""
          }
        }
        attempts++
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      return { path: screenshotPath, preview }
    } catch (error) {
      console.error("Error taking screenshot:", error)
      throw error
    }
  })

  ipcMain.handle("get-token", async () => {
    const token = tokenManager.load()
    console.log("[IPC] get-token:", token ? "token exists" : "no token")
    return token
  })

  ipcMain.handle("set-token", async (event, token: string) => {
    if (!token || typeof token !== "string") {
      console.error("[IPC] set-token: invalid token provided")
      return { success: false, error: "Invalid token" }
    }
    try {
      tokenManager.save(token)
      console.log("[IPC] set-token: token saved successfully")
      
      const mainWindow = appState.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("token-updated", token)
        console.log("[IPC] Sent token-updated event to renderer process")
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("token-updated", token)
            console.log("[IPC] Sent token-updated event again (retry)")
          }
        }, 500)
      } else {
        console.warn("[IPC] Main window not available, cannot send token-updated event")
      }
      
      return { success: true }
    } catch (error: any) {
      console.error("[IPC] set-token error:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("clear-token", async () => {
    tokenManager.clear()
    console.log("[IPC] clear-token: token cleared")
    return { success: true }
  })

  ipcMain.handle("logout", async () => {
    tokenManager.clear()
    console.log("[IPC] logout: token cleared")
    return { success: true }
  })

  ipcMain.handle("open-auth", async () => {
    const siteUrl = process.env.SITE_URL || "http://localhost:3005"
    const scheme = process.env.DEEPLINK_SCHEME || "cluely"
    const url = `${siteUrl}/auth?redirect=${encodeURIComponent(`${scheme}://auth`)}`
    
    const mainWindow = appState.getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log("[IPC] Minimizing window before opening auth page")
      mainWindow.minimize()
      if (process.platform === "darwin") {
        app.dock?.hide()
      }
    }
    
    await shell.openExternal(url)
    return { success: true }
  })

  ipcMain.handle("get-premium-info", async () => {
    try {
      const premiumInfo = appState.premiumManager.getPremiumInfo()
      return premiumInfo || { isPremium: false, premiumUntil: null, timeRemaining: null }
    } catch (e: any) {
      console.error("[IPC] Error getting premium info:", e)
      return { isPremium: false, premiumUntil: null, timeRemaining: null }
    }
  })

  ipcMain.handle("can-use-app", async () => {
    try {
      return appState.premiumManager.canUseApp()
    } catch (e: any) {
      console.error("[IPC] Error checking if can use app:", e)
      return false
    }
  })

  ipcMain.handle("open-premium-purchase", async () => {
    const purchaseUrl = process.env.PREMIUM_PURCHASE_URL || "http://109.61.108.37:3005/#pricing"
    await shell.openExternal(purchaseUrl)
    return { success: true }
  })

  ipcMain.handle("refresh-premium-info", async () => {
    try {
      const premiumInfo = await appState.premiumManager.refreshPremiumInfo()
      const mainWindow = appState.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("premium-status-updated", premiumInfo)
      }
      return premiumInfo
    } catch (e: any) {
      console.error("[IPC] Error refreshing premium info:", e)
      return { isPremium: false, premiumUntil: null, timeRemaining: null }
    }
  })

  ipcMain.handle("get-screenshots", async () => {
    console.log({ view: appState.getView() })
    try {
      let previews = []
      if (appState.getView() === "queue") {
        previews = await Promise.all(
          appState.getScreenshotQueue().map(async (path) => ({
            path,
            preview: await appState.getImagePreview(path)
          }))
        )
      } else {
        previews = await Promise.all(
          appState.getExtraScreenshotQueue().map(async (path) => ({
            path,
            preview: await appState.getImagePreview(path)
          }))
        )
      }
      previews.forEach((preview: any) => console.log(preview.path))
      return previews
    } catch (error) {
      console.error("Error getting screenshots:", error)
      throw error
    }
  })

  ipcMain.handle("toggle-window", async () => {
    appState.toggleMainWindow()
  })

  ipcMain.handle("reset-queues", async () => {
    try {
      appState.clearQueues()
      console.log("Screenshot queues have been cleared.")
      return { success: true }
    } catch (error: any) {
      console.error("Error resetting queues:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("analyze-audio-base64", async (event, data: string, mimeType: string, chatHistory?: string) => {
    try {
      const result = await appState.processingHelper.processAudioBase64(data, mimeType, chatHistory)
      return result
    } catch (error: any) {
      console.error("Error in analyze-audio-base64 handler:", error)
      throw error
    }
  })

  ipcMain.handle("transcribe-pcm16", async (_event, base64: string, sampleRate?: number) => {
    try {
      const helper = appState.processingHelper.getLLMHelper()
      const result = await helper.transcribePcm16Base64(base64, sampleRate || 16000)
      return result
    } catch (error: any) {
      console.error("Error in transcribe-pcm16 handler:", error)
      throw error
    }
  })

  // ===== СТАРЫЙ стрим через server2.meetingaitools.com (по умолчанию) =====
  ipcMain.handle("start-transcription-stream", async (event) => {
    try {
      const webContentsId = event.sender.id
      
      const existing = activeTranscriptionStreams.get(webContentsId)
      if (existing) {
        await existing.close()
        activeTranscriptionStreams.delete(webContentsId)
        // Небольшая задержка для гарантии полного закрытия соединения
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      const helper = appState.processingHelper.getLLMHelper()
      const primary = (helper as any).primary
      if (!primary) {
        throw new Error("PrimaryAI not configured")
      }

      let processingInterim = false
      let lastInterimTime = 0
      let pendingInterimText = ""

      const stream = primary.createTranscriptionStream(
        (text: string) => {
          const now = Date.now()
          if (processingInterim || (now - lastInterimTime < 200)) {
            pendingInterimText = text
            return
          }
          processingInterim = true
          lastInterimTime = now
          const textToSend = pendingInterimText || text
          pendingInterimText = ""

          try {
            if (!event.sender.isDestroyed()) {
              event.sender.send("transcription-interim", { text: textToSend })
            }
          } catch (err) {
            console.error("[IPC] Error sending transcription-interim:", err)
          } finally {
            setTimeout(() => {
              processingInterim = false
              if (pendingInterimText && !event.sender.isDestroyed()) {
                const delayedText = pendingInterimText
                pendingInterimText = ""
                event.sender.send("transcription-interim", { text: delayedText })
              }
            }, 200)
          }
        },
        (error: Error) => {
          event.sender.send("transcription-error", { error: error.message })
          activeTranscriptionStreams.delete(webContentsId)
        }
      )

      // Дополнительно: захват системного звука через BlackHole и отправка в тот же стрим
      let systemRecorder: NodeRecorder | null = null
      const startSystemRecorder = () => {
        try {
          systemRecorder = nodeRecord.record({
            sampleRate: 16000,
            channels: 1,
            audioType: "wav",
            device: "BlackHole 2ch"
          })
          const sysStream = systemRecorder.stream()
          sysStream.on("data", (chunk: Buffer) => {
            setImmediate(() => {
              try {
                stream.sendChunk(chunk)
              } catch (err) {
                console.error("[IPC] Error sending system audio chunk:", err)
              }
            })
          })
          sysStream.on("error", (err: any) => {
            console.error("[IPC] System audio stream error:", err)
          })
        } catch (err) {
          console.error("[IPC] Failed to start system audio recorder (BlackHole):", err)
        }
      }

      startSystemRecorder()

      const stopSystem = () => {
        try {
          systemRecorder?.stop()
        } catch {}
        systemRecorder = null
      }

      activeTranscriptionStreams.set(webContentsId, {
        ...stream,
        stopSystem
      })
      return { success: true }
    } catch (error: any) {
      console.error("Error starting transcription stream:", error)
      throw error
    }
  })

  ipcMain.handle("send-transcription-chunk", async (event, pcmBase64: string) => {
    try {
      const webContentsId = event.sender.id
      const stream = activeTranscriptionStreams.get(webContentsId)
      if (!stream) {
        return { success: false, error: "Transcription stream not started" }
      }
      const pcmBuffer = Buffer.from(pcmBase64, "base64")
      
      setImmediate(() => {
        try {
          stream.sendChunk(pcmBuffer)
        } catch (err) {
          console.error("[IPC] Error in sendChunk:", err)
        }
      })
      
      return { success: true }
    } catch (error: any) {
      console.error("Error sending transcription chunk:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("stop-transcription-stream", async (event) => {
    try {
      const webContentsId = event.sender.id
      const stream = activeTranscriptionStreams.get(webContentsId)
      if (stream) {
        try {
          stream.stopSystem?.()
        } catch {}
        await stream.close()
        activeTranscriptionStreams.delete(webContentsId)
      }
      return { success: true }
    } catch (error: any) {
      console.error("Error stopping transcription stream:", error)
      throw error
    }
  })

  // ===== Новый Deepgram-стрим (микрофон + системный звук) =====
  ipcMain.handle(
    "deepgram-start",
    async (event, options?: { micDevice?: string; systemDevice?: string; language?: string; model?: string }) => {
      const webContentsId = event.sender.id

      // Если уже есть сессия — останавливаем
      const existing = activeDeepgramSessions.get(webContentsId)
      if (existing) {
        try {
          existing.stop()
        } catch {}
        activeDeepgramSessions.delete(webContentsId)
      }

      const language = options?.language || "ru"
      const model = options?.model || "nova-2"
      const micDevice = options?.micDevice
      const systemDevice = options?.systemDevice || "BlackHole 2ch"

      const DEEPGRAM_WS = "wss://api.deepgram.com/v1/listen"
      const apiKey = "179f5732c4176f66663bf7bcd3073e21f55cae9e"

      if (!apiKey) {
        throw new Error("Deepgram API key is not configured")
      }

      const baseRecordOptions = {
        sampleRate: 16000,
        channels: 1,
        audioType: "wav"
      }

      const params = new URLSearchParams({
        encoding: "linear16",
        sample_rate: String(baseRecordOptions.sampleRate),
        channels: String(baseRecordOptions.channels),
        model,
        language,
        punctuate: "true",
        interim_results: "false"
      })

      const createDeepgramConnection = (
        label: "mic" | "system",
        onTranscript: (text: string) => void
      ): WebSocket => {
        const wsUrl = `${DEEPGRAM_WS}?${params.toString()}`
        const socket = new WebSocket(wsUrl, {
          headers: { Authorization: `Token ${apiKey}` }
        })

        socket.on("open", () => {
          console.log(`[Deepgram:${label}] WebSocket opened`)
        })

        socket.on("message", (data) => {
          try {
            const msg = JSON.parse(data.toString())
            if (!msg.is_final) return
            if (!(msg.channel && msg.channel.alternatives && msg.channel.alternatives[0])) return
            const alt = msg.channel.alternatives[0]
            const text = (alt.transcript || "").trim()
            if (!text) return
            onTranscript(text)
          } catch (e: any) {
            console.error(`[Deepgram:${label}] parse error:`, e?.message || e)
          }
        })

        socket.on("close", () => {
          console.log(`[Deepgram:${label}] WebSocket closed`)
        })

        socket.on("error", (err: any) => {
          console.error(`[Deepgram:${label}] WebSocket error:`, err?.message || err)
        })

        return socket
      }

      const dgMic = createDeepgramConnection("mic", (text) => {
        try {
          if (!event.sender.isDestroyed()) {
            event.sender.send("deepgram-transcript", { source: "mic", text })
          }
        } catch {}
      })

      const dgSystem = createDeepgramConnection("system", (text) => {
        try {
          if (!event.sender.isDestroyed()) {
            event.sender.send("deepgram-transcript", { source: "system", text })
          }
        } catch {}
      })

      let micRecorder: NodeRecorder | null = null
      let systemRecorder: NodeRecorder | null = null

      const startMicRecorder = () => {
        const recOptions = micDevice
          ? { ...baseRecordOptions, device: micDevice }
          : { ...baseRecordOptions }
        micRecorder = nodeRecord.record(recOptions)
        const stream = micRecorder.stream()
        stream.on("data", (chunk: Buffer) => {
          if (dgMic.readyState === WebSocket.OPEN) {
            dgMic.send(chunk)
          }
        })
        stream.on("error", (err: any) => {
          console.error("[Deepgram] mic stream error:", err)
        })
      }

      const startSystemRecorder = () => {
        const recOptions = { ...baseRecordOptions, device: systemDevice }
        systemRecorder = nodeRecord.record(recOptions)
        const stream = systemRecorder.stream()
        stream.on("data", (chunk: Buffer) => {
          if (dgSystem.readyState === WebSocket.OPEN) {
            dgSystem.send(chunk)
          }
        })
        stream.on("error", (err: any) => {
          console.error("[Deepgram] system stream error:", err)
        })
      }

      let openedCount = 0
      const tryStart = () => {
        openedCount += 1
        if (openedCount === 2) {
          startMicRecorder()
          startSystemRecorder()
        }
      }

      dgMic.on("open", tryStart)
      dgSystem.on("open", tryStart)

      const stop = () => {
        try {
          micRecorder?.stop()
        } catch {}
        try {
          systemRecorder?.stop()
        } catch {}
        try {
          if (dgMic.readyState === WebSocket.OPEN) dgMic.close()
        } catch {}
        try {
          if (dgSystem.readyState === WebSocket.OPEN) dgSystem.close()
        } catch {}
      }

      activeDeepgramSessions.set(webContentsId, { stop })

      return { success: true }
    }
  )

  ipcMain.handle("deepgram-stop", async (event) => {
    const webContentsId = event.sender.id
    const sess = activeDeepgramSessions.get(webContentsId)
    if (sess) {
      try {
        sess.stop()
      } catch {}
      activeDeepgramSessions.delete(webContentsId)
    }
    return { success: true }
  })

  app.on("web-contents-created", (_event, webContents) => {
    webContents.on("destroyed", async () => {
      const stream = activeTranscriptionStreams.get(webContents.id)
      if (stream) {
        await stream.close().catch(() => {})
        activeTranscriptionStreams.delete(webContents.id)
      }

      const deepgramSession = activeDeepgramSessions.get(webContents.id)
      if (deepgramSession) {
        try {
          deepgramSession.stop()
        } catch {}
        activeDeepgramSessions.delete(webContents.id)
      }
    })
  })

  ipcMain.handle("analyze-audio-file", async (event, path: string) => {
    try {
      const result = await appState.processingHelper.processAudioFile(path)
      return result
    } catch (error: any) {
      console.error("Error in analyze-audio-file handler:", error)
      throw error
    }
  })

  ipcMain.handle("analyze-image-file", async (event, path: string) => {
    try {
      const result = await appState.processingHelper.getLLMHelper().analyzeImageFile(path)
      return result
    } catch (error: any) {
      console.error("Error in analyze-image-file handler:", error)
      throw error
    }
  })

  ipcMain.handle("gemini-chat", async (event, message: string) => {
    try {
      const result = await appState.processingHelper.getLLMHelper().chat(message);
      return result;
    } catch (error: any) {
      console.error("Error in gemini-chat handler:", error);
      throw error;
    }
  });
  
  ipcMain.handle("chat", async (_event, message: string) => {
    try {
      const result = await appState.processingHelper.getLLMHelper().chat(message);
      return result;
    } catch (error: any) {
      console.error("Error in chat handler:", error);
      throw error;
    }
  });

  ipcMain.handle("quit-app", () => {
    app.quit()
  })

  ipcMain.handle("move-window-left", async () => {
    appState.moveWindowLeft()
  })

  ipcMain.handle("move-window-right", async () => {
    appState.moveWindowRight()
  })

  ipcMain.handle("move-window-up", async () => {
    appState.moveWindowUp()
  })

  ipcMain.handle("move-window-down", async () => {
    appState.moveWindowDown()
  })

  ipcMain.handle("center-and-show-window", async () => {
    appState.centerAndShowWindow()
  })

  ipcMain.handle("get-current-llm-config", async () => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      return {
        provider: llmHelper.getCurrentProvider(),
        model: llmHelper.getCurrentModel(),
        isOllama: llmHelper.isUsingOllama()
      };
    } catch (error: any) {
      console.error("Error getting current LLM config:", error);
      throw error;
    }
  });

  ipcMain.handle("get-available-ollama-models", async () => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      const models = await llmHelper.getOllamaModels();
      return models;
    } catch (error: any) {
      console.error("Error getting Ollama models:", error);
      throw error;
    }
  });

  ipcMain.handle("switch-to-ollama", async (_, model?: string, url?: string) => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      await llmHelper.switchToOllama(model, url);
      return { success: true };
    } catch (error: any) {
      console.error("Error switching to Ollama:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("switch-to-gemini", async (_, apiKey?: string) => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      await llmHelper.switchToGemini(apiKey);
      return { success: true };
    } catch (error: any) {
      console.error("Error switching to Gemini:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("test-llm-connection", async () => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      const result = await llmHelper.testConnection();
      return result;
    } catch (error: any) {
      console.error("Error testing LLM connection:", error);
      return { success: false, error: error.message };
    }
  });
}

