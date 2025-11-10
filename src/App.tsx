import { ToastProvider } from "./components/ui/toast"
import Queue from "./_pages/Queue"
import { ToastViewport } from "@radix-ui/react-toast"
import { useCallback, useEffect, useRef, useState } from "react"
import Solutions from "./_pages/Solutions"
import { useQuery, useQueryClient } from "react-query"
import { PremiumModal } from "./components/PremiumModal"
import { ControlBar } from "./components/ControlBar"
import { TranscriptView } from "./components/TranscriptView"
import { ChatView } from "./components/ChatView"
import { SummaryOverlay } from "./components/SummaryOverlay"
import { ProfileSettings } from "./components/ProfileSettings"
import { useVoiceRecorder } from "./hooks/useVoiceRecorder"

declare global {
  interface Window {
    electronAPI: {
      updateContentDimensions: (dimensions: {
        width: number
        height: number
      }) => Promise<void>
      ensureWindowSize: (dimensions: {
        width: number
        height: number
      }) => Promise<void>
      getScreenshots: () => Promise<Array<{ path: string; preview: string }>>

      onUnauthorized: (callback: () => void) => () => void
      onScreenshotTaken: (
        callback: (data: { path: string; preview: string }) => void
      ) => () => void
      onProcessingNoScreenshots: (callback: () => void) => () => void
      onResetView: (callback: () => void) => () => void
      takeScreenshot: () => Promise<void>

      deleteScreenshot: (
        path: string
      ) => Promise<{ success: boolean; error?: string }>
      onSolutionStart: (callback: () => void) => () => void
      onSolutionError: (callback: (error: string) => void) => () => void
      onSolutionSuccess: (callback: (data: any) => void) => () => void
      onProblemExtracted: (callback: (data: any) => void) => () => void

      onDebugSuccess: (callback: (data: any) => void) => () => void

      onDebugStart: (callback: () => void) => () => void
      onDebugError: (callback: (error: string) => void) => () => void

      analyzeAudioFromBase64: (data: string, mimeType: string, chatHistory?: string) => Promise<{ text: string; timestamp: number; isResponse?: boolean; transcript?: string }>
      analyzeAudioFile: (path: string) => Promise<{ text: string; timestamp: number }>
      transcribePcm16: (pcmBase64: string, sampleRate?: number) => Promise<{ text: string; timestamp: number }>

      moveWindowLeft: () => Promise<void>
      moveWindowRight: () => Promise<void>
      moveWindowUp: () => Promise<void>
      moveWindowDown: () => Promise<void>
      quitApp: () => Promise<void>
      
      getCurrentLlmConfig: () => Promise<{ provider: "ollama" | "gemini"; model: string; isOllama: boolean }>
      getAvailableOllamaModels: () => Promise<string[]>
      switchToOllama: (model?: string, url?: string) => Promise<{ success: boolean; error?: string }>
      switchToGemini: (apiKey?: string) => Promise<{ success: boolean; error?: string }>
      testLlmConnection: () => Promise<{ success: boolean; error?: string }>
      
      invoke: (channel: string, ...args: any[]) => Promise<any>
      onThemeChange: (callback: (theme: "dark" | "dark") => void) => () => void
      
      getToken: () => Promise<string | null>
      setToken: (token: string) => Promise<{ success: boolean; error?: string }>
      clearToken: () => Promise<{ success: boolean }>
      openAuth: () => Promise<{ success: boolean }>
      onTokenUpdated: (callback: (token: string) => void) => () => void
      onWindowFocused: (callback: () => void) => () => void
      
      getPremiumInfo: () => Promise<{ isPremium: boolean; premiumUntil: string | null; timeRemaining: number | null }>
      canUseApp: () => Promise<boolean>
      openPremiumPurchase: () => Promise<{ success: boolean }>
      refreshPremiumInfo: () => Promise<{ isPremium: boolean; premiumUntil: string | null; timeRemaining: number | null }>
      onPremiumStatusUpdated: (callback: (info: { isPremium: boolean; premiumUntil: string | null; timeRemaining: number | null }) => void) => () => void
    }
  }
}

const App: React.FC = () => {
  const [view, setView] = useState<"queue" | "solutions" | "debug">("queue")
  const containerRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const [premiumInfo, setPremiumInfo] = useState<{ isPremium: boolean; premiumUntil: string | null; timeRemaining: number | null } | null>(null)
  const [showPremiumModal, setShowPremiumModal] = useState(false)
  const [paused, setPaused] = useState(false)
  const [activeTab, setActiveTab] = useState<"chat" | "transcript">("chat")
  const [transcript, setTranscript] = useState<string[]>([])
  const [showSummary, setShowSummary] = useState(false)
  const [summaryText, setSummaryText] = useState("")
  const [showProfile, setShowProfile] = useState(false)
  const [sessionActive, setSessionActive] = useState(true)
  const [lastAssistantAnswer, setLastAssistantAnswer] = useState("")
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const transcriptRef = useRef<string[]>([])
  const conversationRef = useRef<Array<{ role: "user" | "assistant"; text: string }>>([])
  
  const { data: token, refetch: refetchToken } = useQuery(
    ["auth_token"], 
    async () => {
      try {
        const t = await (window.electronAPI.getToken?.() || window.electronAPI.invoke("get-token"))
        console.log("[App] Token query result:", t ? `Found token (${t.length} chars)` : "No token")
        return t
      } catch (e) {
        console.error("[App] Error getting token:", e)
        return null
      }
    },
    {
      refetchInterval: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      staleTime: 1000,
      cacheTime: 5000
    }
  )

  const { data: premiumData, refetch: refetchPremium } = useQuery(
    ["premium_info"],
    async () => {
      try {
        const info = await window.electronAPI.getPremiumInfo?.()
        console.log("[App] Premium info:", info)
        return info
      } catch (e) {
        console.error("[App] Error getting premium info:", e)
        return { isPremium: false, premiumUntil: null, timeRemaining: null }
      }
    },
    {
      refetchInterval: 1000,
      enabled: !!token,
      staleTime: 0
    }
  )

  useEffect(() => {
    if (premiumData) {
      setPremiumInfo(premiumData)
      
      if (!premiumData.isPremium && premiumData.timeRemaining !== null && premiumData.timeRemaining <= 0) {
        setShowPremiumModal(true)
      }
    }
  }, [premiumData])

  useEffect(() => {
    const cleanupTheme = window.electronAPI.onThemeChange?.((theme) => {
      if (theme === 'dark') {
        document.body.classList.add('theme-dark')
        document.body.classList.remove('theme-light')
      } else {
        document.body.classList.add('theme-light')
        document.body.classList.remove('theme-dark')
      }
    })

    const cleanup = window.electronAPI.onResetView(() => {
      console.log("Received 'reset-view' message from main process.")
      queryClient.invalidateQueries(["screenshots"])
      queryClient.invalidateQueries(["problem_statement"])
      queryClient.invalidateQueries(["solution"])
      queryClient.invalidateQueries(["new_solution"])
      setView("queue")
    })

    return () => {
      cleanup()
      cleanupTheme && cleanupTheme()
    }
  }, [])

  useEffect(() => {
    console.log("[App] Setting up token update listener...")
    
    const cleanupTokenUpdate = window.electronAPI.onTokenUpdated?.((newToken: string) => {
      console.log("[App] ⚡ Token updated event received from deep link, length:", newToken.length)
      
      queryClient.setQueryData(["auth_token"], newToken)
      console.log("[App] ✅ Token cache updated immediately")
      
      setTimeout(() => {
        refetchPremium()
      }, 500)
      
      setTimeout(() => {
        refetchToken().then((result) => {
          console.log("[App] ✅ Token refetched after deep link update, result:", result.data ? "token exists" : "no token")
        }).catch((e) => {
          console.error("[App] ❌ Error refetching token:", e)
        })
      }, 200)
    })

    const cleanupPremiumUpdate = window.electronAPI.onPremiumStatusUpdated?.((info) => {
      console.log("[App] ⚡ Premium status updated:", info)
      setPremiumInfo(info)
      queryClient.setQueryData(["premium_info"], info)
      
      if (!info.isPremium && info.timeRemaining !== null && info.timeRemaining <= 0) {
        setShowPremiumModal(true)
      }
    })

    const cleanupWindowFocused = window.electronAPI.onWindowFocused?.(() => {
      console.log("[App] 👁️ Window focused event from Electron, checking token...")
      refetchToken()
    })
    
    const handleFocus = () => {
      console.log("[App] 👁️ Browser window focused, checking token...")
      refetchToken()
    }
    window.addEventListener('focus', handleFocus)
    
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log("[App] 👁️ Window became visible, checking token...")
        refetchToken()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      console.log("[App] Cleaning up token update listener...")
      cleanupTokenUpdate?.()
      cleanupPremiumUpdate?.()
      cleanupWindowFocused?.()
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refetchToken, refetchPremium, queryClient])

  useEffect(() => {
    if (!containerRef.current) return

    const updateHeight = () => {
      if (!containerRef.current) return
      const height = containerRef.current.scrollHeight
      const width = containerRef.current.scrollWidth
      window.electronAPI?.updateContentDimensions({ width, height })
    }

    const resizeObserver = new ResizeObserver(() => {
      updateHeight()
    })

    updateHeight()

    resizeObserver.observe(containerRef.current)

    const mutationObserver = new MutationObserver(() => {
      updateHeight()
    })

    mutationObserver.observe(containerRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    })

    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [view])

  useEffect(() => {
    const cleanupFunctions = [
      window.electronAPI.onSolutionStart(() => {
        setView("solutions")
        console.log("starting processing")
      }),

      window.electronAPI.onUnauthorized(() => {
        queryClient.removeQueries(["screenshots"])
        queryClient.removeQueries(["solution"])
        queryClient.removeQueries(["problem_statement"])
        setView("queue")
        console.log("Unauthorized")
      }),
      window.electronAPI.onResetView(() => {
        console.log("Received 'reset-view' message from main process")

        queryClient.removeQueries(["screenshots"])
        queryClient.removeQueries(["solution"])
        queryClient.removeQueries(["problem_statement"])
        setView("queue")
        console.log("View reset to 'queue' via Command+R shortcut")
      }),
      window.electronAPI.onProblemExtracted((data: any) => {
        if (view === "queue") {
          console.log("Problem extracted successfully")
          queryClient.invalidateQueries(["problem_statement"])
          queryClient.setQueryData(["problem_statement"], data)
        }
      })
    ]
    return () => {
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  }, [])

  async function geminiAsk(message: string): Promise<string> {
    try {
      const r = await window.electronAPI.invoke("gemini-chat", message)
      if (r && typeof r === "string") return r
      if (r && typeof r?.text === "string") return r.text
      return String(r ?? "")
    } catch (e: any) {
      return "Ошибка: " + (e?.message || String(e))
    }
  }

  const appendTranscript = useCallback((entry: { speaker: "user" | "assistant"; text: string }) => {
    if (!entry.text?.trim()) return
    const clean = entry.text.trim()
    const prefix = entry.speaker === "user" ? "Пользователь" : "Ассистент"
    setTranscript((prev) => {
      const next = [...prev, `${prefix}: ${clean}`]
      transcriptRef.current = next
      return next
    })
    conversationRef.current = [...conversationRef.current, { role: entry.speaker, text: clean }]
  }, [])

  const conversationToString = useCallback(() => {
    if (!conversationRef.current.length) return ""
    return conversationRef.current
      .map((item) => `${item.role === "user" ? "User" : "Assistant"}: ${item.text}`)
      .join("\n")
  }, [])

  // Агрегатор голоса как в del2.js
  const lastVoiceTextRef = useRef<string>("")
  const lastSentVoiceTextRef = useRef<string>("")
  const voiceTimerRef = useRef<number | null>(null)

  const handleVoiceResult = useCallback(
    async (result: { text: string; isResponse?: boolean; transcript?: string }) => {
      const incoming = result?.text?.trim()
      if (!incoming) return
      if (result.isResponse) {
        if (result.transcript?.trim()) {
          appendTranscript({ speaker: "user", text: result.transcript.trim() })
        }
        appendTranscript({ speaker: "assistant", text: incoming })
        setLastAssistantAnswer(incoming)
        return
      }
      // Не вызываем чат на каждый interim — копим последний текст
      lastVoiceTextRef.current = incoming
    },
    []
  )

  const {
    isRecording: isVoiceRecording,
    inputLevel: voiceInputLevel,
    devices: voiceDevices,
    selectedDeviceId: selectedVoiceDevice,
    setSelectedDeviceId: setSelectedVoiceDevice,
    refreshDevices: refreshVoiceDevices,
    toggleRecording: toggleVoiceRecording,
    stopRecording: stopVoiceRecording,
    error: voiceRecorderError
  } = useVoiceRecorder({
    onResult: handleVoiceResult,
    getChatHistory: conversationToString
  })

  // Таймер: каждые 5 сек отправляем последний распознанный текст, если он изменился
  useEffect(() => {
    if (!isVoiceRecording) {
      if (voiceTimerRef.current) {
        window.clearInterval(voiceTimerRef.current)
        voiceTimerRef.current = null
      }
      return
    }
    if (voiceTimerRef.current) return
    voiceTimerRef.current = window.setInterval(async () => {
      const text = (lastVoiceTextRef.current || "").trim()
      if (!text || text === lastSentVoiceTextRef.current) return
      lastSentVoiceTextRef.current = text
      appendTranscript({ speaker: "user", text })
      try {
        const history = conversationToString()
        const prompt = history
          ? `Контекст диалога:\n${history}\n\nОтветь на последнюю реплику пользователя, учитывая контекст.`
          : `Ответь на следующий запрос пользователя:\n${text}`
        const response = await geminiAsk(prompt)
        appendTranscript({ speaker: "assistant", text: response })
        setLastAssistantAnswer(response)
      } catch (err: any) {
        const message = err?.message ? `Ошибка: ${err.message}` : "Ошибка обработки голоса."
        appendTranscript({ speaker: "assistant", text: message })
        setLastAssistantAnswer(message)
        setVoiceError(message)
      }
    }, 5000) as unknown as number
    return () => {
      if (voiceTimerRef.current) {
        window.clearInterval(voiceTimerRef.current)
        voiceTimerRef.current = null
      }
    }
  }, [isVoiceRecording, appendTranscript, conversationToString])

  const selectVoiceDevice = useCallback(
    (id: string) => {
      setSelectedVoiceDevice(id)
    },
    [setSelectedVoiceDevice]
  )

  const handleRecordToggle = useCallback(
    async () => {
      const wasRecording = isVoiceRecording
      try {
        await toggleVoiceRecording()
        if (!wasRecording) setVoiceError(null)
      } catch (err: any) {
        const message = err?.message ? `Не удалось начать запись: ${err.message}` : "Не удалось начать запись."
        setVoiceError(message)
      }
    },
    [isVoiceRecording, toggleVoiceRecording]
  )

  const handleChatAnswered = useCallback(
    (payload: { question?: string; answer: string; type: "assist" | "custom" }) => {
      if (payload.type === "custom" && payload.question?.trim()) {
        appendTranscript({ speaker: "user", text: payload.question.trim() })
      }
      if (payload.answer?.trim()) {
        appendTranscript({ speaker: "assistant", text: payload.answer.trim() })
        setLastAssistantAnswer(payload.answer.trim())
      }
    },
    [appendTranscript]
  )

  useEffect(() => {
    if (!voiceRecorderError) return
    setVoiceError(voiceRecorderError)
  }, [voiceRecorderError])

  useEffect(() => {
    if (!voiceError) return
    const timer = window.setTimeout(() => setVoiceError(null), 4000)
    return () => window.clearTimeout(timer)
  }, [voiceError])

  useEffect(() => {
    if (!sessionActive && isVoiceRecording) {
      stopVoiceRecording()
    }
  }, [sessionActive, isVoiceRecording, stopVoiceRecording])

  useEffect(() => {
    transcriptRef.current = transcript
  }, [transcript])

  const startNewSession = () => {
    stopVoiceRecording()
    conversationRef.current = []
    transcriptRef.current = []
    setTranscript([])
    setSummaryText("")
    setShowSummary(false)
    setSessionActive(true)
    setActiveTab("chat")
    setPaused(false)
    setShowProfile(false)
    setLastAssistantAnswer("")
    setVoiceError(null)
    setTimeout(() => {
      window.electronAPI.updateContentDimensions?.({
        width: document.body.scrollWidth,
        height: document.body.scrollHeight
      })
    }, 100)
  }

  async function onStopSession() {
    stopVoiceRecording()
    setSessionActive(false)
    try {
      const ctx = transcript.join("\n")
      const prompt =
        "Сделай краткое, структурированное резюме по этой стенограмме встречи. " +
        "Выдели цели, принятые решения, задачи, сроки, риски. " +
        "Стенограмма:\n" +
        ctx
      const result = await geminiAsk(prompt)
      setSummaryText(result)
      setShowSummary(true)
      setTimeout(() => {
        window.electronAPI.ensureWindowSize?.({ width: 900, height: 640 })
      }, 50)
    } catch (e) {
      setSummaryText("Не удалось получить резюме.")
      setShowSummary(true)
    }
  }

  return (
    <div ref={containerRef} className="min-h-0">
        <ToastProvider>
        {(() => {
          if (token) {
            // console.log("[App] 🔑 Token exists in UI, length:", token.length)
          } else {
            console.log("[App] ❌ No token in UI")
          }
          
          if (!token) {
            return (
              <div style={{ 
                padding: "12px 16px", 
                background: "#111827", 
                color: "#fff", 
                borderRadius: 8, 
                marginBottom: 12,
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Требуется авторизация</div>
                    <div style={{ fontSize: "12px", opacity: 0.8 }}>Для работы приложения необходимо войти в систему</div>
                    <button
                      onClick={() => {
                        console.log("[App] Manual token refresh requested")
                        refetchToken()
                      }}
                      style={{
                        marginTop: 8,
                        padding: "4px 8px",
                        fontSize: "11px",
                        background: "rgba(255,255,255,0.1)",
                        color: "#fff",
                        border: "1px solid rgba(255,255,255,0.2)",
                        borderRadius: 4,
                        cursor: "pointer"
                      }}
                    >
                      🔄 Проверить токен
                    </button>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        console.log("[App] Opening auth page...")
                        const result = await (window.electronAPI.openAuth?.() || window.electronAPI.invoke("open-auth"))
                        console.log("[App] Open auth result:", result)
                        setTimeout(() => refetchToken(), 2000)
                        setTimeout(() => refetchToken(), 5000)
                        setTimeout(() => refetchToken(), 10000)
                      } catch (e) {
                        console.error("[App] Error opening auth:", e)
                        alert("Ошибка открытия страницы авторизации: " + (e instanceof Error ? e.message : String(e)))
                      }
                    }}
                    style={{ 
                      background: "#2563eb", 
                      color: "#fff", 
                      border: "none", 
                      padding: "10px 20px", 
                      borderRadius: 6, 
                      cursor: "pointer",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      transition: "background 0.2s"
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = "#1d4ed8"}
                    onMouseOut={(e) => e.currentTarget.style.background = "#2563eb"}
                  >
                    Авторизоваться
                  </button>
                </div>
              </div>
            )
          } else {
            return (
              <div style={{ 
                padding: "10px 16px", 
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)", 
                color: "#fff", 
                borderRadius: 8, 
                marginBottom: 12,
                fontSize: "13px",
                boxShadow: "0 2px 4px rgba(16,185,129,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: "16px" }}>✅</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>Авторизован</div>
                    <div style={{ fontSize: "11px", opacity: 0.9 }}>Токен: {token.substring(0, 25)}...</div>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    if (confirm("Вы уверены, что хотите выйти?")) {
                      try {
                        await (window.electronAPI.clearToken?.() || window.electronAPI.invoke("clear-token"))
                        queryClient.setQueryData(["auth_token"], null)
                        await refetchToken()
                        console.log("[App] Token cleared and UI updated")
                      } catch (e) {
                        console.error("[App] Error clearing token:", e)
                      }
                    }
                  }}
                  style={{
                    background: "rgba(255,255,255,0.2)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.3)",
                    padding: "6px 12px",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontSize: "11px",
                    fontWeight: 600
                  }}
                >
                  Выйти
                </button>
              </div>
            )
          }
        })()}
        {voiceError && (
          <div
            style={{
              marginBottom: 12,
              background: "rgba(220,38,38,0.85)",
              color: "#fff",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: "12px",
              boxShadow: "0 4px 12px rgba(220,38,38,0.4)"
            }}
          >
            {voiceError}
          </div>
        )}
          {view === "queue" ? (
            <Queue setView={setView} onTranscriptUpdate={appendTranscript} />
          ) : view === "solutions" ? (
            <Solutions setView={setView} />
          ) : (
            <></>
          )}
          <ToastViewport />
        
        <PremiumModal
          isOpen={showPremiumModal}
          onClose={() => setShowPremiumModal(false)}
          onPurchase={async () => {
            try {
              await window.electronAPI.openPremiumPurchase?.()
              setShowPremiumModal(false)
            } catch (e) {
              console.error("[App] Error opening premium purchase:", e)
            }
          }}
          timeRemaining={premiumInfo?.timeRemaining || null}
        />

        {sessionActive && (
          <>
            <ControlBar
              tab={activeTab}
              onTabChange={(t) => {
                setActiveTab(t)
                setTimeout(() => {
                  window.electronAPI.updateContentDimensions?.({
                    width: document.body.scrollWidth,
                    height: document.body.scrollHeight
                  })
                }, 50)
              }}
              paused={paused}
              onPauseToggle={() => setPaused((p) => !p)}
              onStop={onStopSession}
              onHome={() => setShowProfile(true)}
              onToggleRecording={handleRecordToggle}
              recording={isVoiceRecording}
              inputLevel={voiceInputLevel}
            />

            <div
              style={{
                position: "fixed",
                left: "50%",
                top: 150,
                transform: "translateX(-50%)",
                zIndex: 9990
              }}
            >
              {activeTab === "transcript" ? (
                <TranscriptView lines={transcript} />
              ) : (
                <ChatView
                  transcript={transcript}
                  onAsk={geminiAsk}
                  externalAnswer={lastAssistantAnswer}
                  onAnswered={handleChatAnswered}
                />
              )}
            </div>
          </>
        )}

        <SummaryOverlay
          open={showSummary}
          summary={summaryText}
          onClose={() => setShowSummary(false)}
          onNewSession={startNewSession}
        />

        {showProfile && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              zIndex: 9970,
              overflow: "auto"
            }}
            onClick={() => setShowProfile(false)}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <ProfileSettings
                voiceDevices={voiceDevices}
                selectedDeviceId={selectedVoiceDevice}
                onSelectDevice={selectVoiceDevice}
                onRefreshDevices={refreshVoiceDevices}
              />
            </div>
          </div>
        )}
        </ToastProvider>
    </div>
  )
}

export default App
