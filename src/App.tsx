import { ToastProvider } from "./components/ui/toast"
import Queue from "./_pages/Queue"
import { ToastViewport } from "@radix-ui/react-toast"
import { useCallback, useEffect, useRef, useState } from "react"
import Solutions from "./_pages/Solutions"
import { useQuery, useQueryClient } from "react-query"
import { ControlBar } from "./components/ControlBar"
import { TranscriptView } from "./components/TranscriptView"
import { ChatView } from "./components/ChatView"
import { ProfileSettings } from "./components/ProfileSettings"
import { OpacitySlider } from "./components/OpacitySlider"
import { useVoiceRecorder } from "./hooks/useVoiceRecorder"
import { cn } from "./lib/utils"
import { Button } from "./components/ui/button"
import { Alert, AlertDescription } from "./components/ui/alert"

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
      setWindowOpacity: (opacity: number) => Promise<{ success: boolean; error?: string }>
      getScreenshots: () => Promise<Array<{ path: string; preview: string }>>

      onUnauthorized: (callback: () => void) => () => void
      onScreenshotTaken: (
        callback: (data: { path: string; preview: string }) => void
      ) => () => void
      onProcessingNoScreenshots: (callback: () => void) => () => void
      onResetView: (callback: () => void) => () => void
      takeScreenshot: () => Promise<{ path: string; preview: string }>

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
      startChatStream: (message: string, imagePath?: string) => Promise<{ ok: boolean }>
      onChatDelta: (callback: (data: { delta: string }) => void) => () => void
      onChatComplete: (callback: (data: { text: string }) => void) => () => void
    }
  }
}

const normalizeQuestion = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,!…–—-]+$/g, "")
    .trim()

const extractLastQuestion = (text: string) => {
  const trimmed = text.trim()
  if (!trimmed) return ""
  const matches = trimmed.match(/[^?]*\?/g)
  if (matches && matches.length > 0) {
    return matches[matches.length - 1].trim()
  }
  const parts = trimmed.split(/[.!]/).map((p) => p.trim()).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : trimmed
}

const App: React.FC = () => {
  const [view, setView] = useState<"queue" | "solutions" | "debug">("queue")
  const containerRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const [premiumInfo, setPremiumInfo] = useState<{ isPremium: boolean; premiumUntil: string | null; timeRemaining: number | null } | null>(null)
  const [showPremiumModal, setShowPremiumModal] = useState(false)
  const [paused, setPaused] = useState(false)
  const [activeTab, setActiveTab] = useState<"chat" | "transcript">("chat")
  const [transcript, setTranscript] = useState<string[]>([]) // только вопросы (Пользователь)
  const [answers, setAnswers] = useState<string[]>([])       // только ответы ассистента
  const [showSummary, setShowSummary] = useState(false)
  const [summaryText, setSummaryText] = useState("")
  const [showProfile, setShowProfile] = useState(false)
  const [sessionActive, setSessionActive] = useState(true)  
  const [lastAssistantAnswer, setLastAssistantAnswer] = useState("")
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [liveInterimText, setLiveInterimText] = useState<string>("")
  const [useScreen, setUseScreen] = useState<boolean>(false)
  const transcriptRef = useRef<string[]>([])
  const conversationRef = useRef<Array<{ role: "user" | "assistant"; text: string }>>([])
  const floatingRef = useRef<HTMLDivElement>(null)
  const chatInFlightRef = useRef<boolean>(false)
  
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
        return info
      } catch (e) {
        console.error("[App] Error getting premium info:", e)
        return { isPremium: false, premiumUntil: null, timeRemaining: null }
      }
    },
    {
      refetchInterval: 100000,
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
      // Фиксированная ширина окна
      const FIXED_WIDTH = 570
      const width = FIXED_WIDTH
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

  
  const askStream = useCallback(async (message: string, imagePath?: string): Promise<string> => {
    let acc = ""
    setLastAssistantAnswer("")
    
    const unDelta = window.electronAPI.onChatDelta?.(({ delta }) => {
      if (!delta) return
      acc += delta
      setLastAssistantAnswer((prev) => {
        const next = (prev || "") + delta
        setAnswers((prev) => {
          const idx = streamingAssistantIndexRef.current
          if (idx == null || idx < 0 || idx >= prev.length) {
            const created = [...prev, next]
            streamingAssistantIndexRef.current = created.length - 1
            return created
          }
          const updated = [...prev]
          updated[idx] = next
          return updated
        })
        return next
      })
    })
    const unDone = window.electronAPI.onChatComplete?.(({ text }) => {
      acc = text || acc
    })
    await window.electronAPI.startChatStream?.(message, imagePath)
    
    setTimeout(() => {
      unDelta && unDelta()
      unDone && unDone()
    }, 100)
    return acc
  }, [])

  const recentQuestionsRef = useRef<string[]>([])

  const appendTranscript = useCallback((entry: { speaker: "user" | "assistant"; text: string }) => {
    if (!entry.text?.trim()) return
    const clean = entry.text.trim()

    if (entry.speaker === "user") {
      const norm = normalizeQuestion(clean)
      const prevTranscript = transcriptRef.current || []
      const lastLine = prevTranscript[prevTranscript.length - 1]

      if (lastLine) {
        const existingText = lastLine.replace(/^Пользователь:\s*/i, "").trim()
        const normExisting = normalizeQuestion(existingText)
        const minLen = Math.min(normExisting.length, norm.length)
        const samePrefix = minLen > 0 && norm.slice(0, minLen) === normExisting.slice(0, minLen)

        if (samePrefix) {
          const updated = [...prevTranscript]
          updated[updated.length - 1] = `Пользователь: ${clean}`
          transcriptRef.current = updated
          setTranscript(updated)
          conversationRef.current = [...conversationRef.current, { role: "user", text: clean }]
          recentQuestionsRef.current = [
            ...recentQuestionsRef.current.slice(0, -1),
            norm
          ]
          return
        }
      }

      const recent = recentQuestionsRef.current
      const isSameOrSubset = recent.some((q) => {
        if (!q) return false
        const lenDiff = Math.abs(norm.length - q.length)
        if (lenDiff > 20) return false
        return norm.includes(q) || q.includes(norm)
      })
      if (isSameOrSubset) return

      recentQuestionsRef.current = [...recent.slice(-4), norm]
      const next = [...prevTranscript, `Пользователь: ${clean}`]
      transcriptRef.current = next
      setTranscript(next)
    }

    conversationRef.current = [...conversationRef.current, { role: entry.speaker, text: clean }]
  }, [])

  const conversationToString = useCallback(() => {
    return ""
  }, [])

  const getRecentContext = useCallback((maxMessages: number = 10) => {
    if (!conversationRef.current.length) return ""
    const onlyUserMessages = conversationRef.current.filter((m) => m.role === "user")
    if (!onlyUserMessages.length) return ""
    const recent = onlyUserMessages.slice(-maxMessages)
    return recent.map((item) => `User: ${item.text}`).join("\n")
  }, [])

  
  const accumulatedVoiceTextRef = useRef<string>("")
  const lastInterimTextRef = useRef<string>("")
  const streamingAssistantIndexRef = useRef<number | null>(null)
  const lastSentQuestionRef = useRef<string>("")

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
        setLiveInterimText("")
        return
      }
      
      if (incoming === lastInterimTextRef.current) {
        return
      }
      
      const normalizedIncoming = normalizeQuestion(incoming)
      const normalizedAccumulated = normalizeQuestion(accumulatedVoiceTextRef.current)
      
      if (normalizedIncoming.length > normalizedAccumulated.length && normalizedIncoming.startsWith(normalizedAccumulated)) {
        accumulatedVoiceTextRef.current = incoming
        lastInterimTextRef.current = incoming
      } else if (normalizedIncoming !== normalizedAccumulated) {
        accumulatedVoiceTextRef.current = incoming
        lastInterimTextRef.current = incoming
      }
      setLiveInterimText(incoming)
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
    startRecording: startVoiceRecording,
    closeTranscriptionStream: closeVoiceTranscriptionStream,
    error: voiceRecorderError
  } = useVoiceRecorder({
    onResult: handleVoiceResult,
    getChatHistory: conversationToString
  })

  const handleAssistClick = useCallback(async () => {
    if (chatInFlightRef.current) {
      console.log("[Assist] already in flight, skipping")
      return
    }

    if (isVoiceRecording) {
      console.log("[Assist] Closing transcription stream...")
      await closeVoiceTranscriptionStream()
      await new Promise(resolve => setTimeout(resolve, 300))
    }

    const transcriptLines = transcriptRef.current || []
    const userQuestions = transcriptLines
      .map((line) => line.replace(/^Пользователь:\s*/i, "").trim())
      .filter(Boolean)

    let mainQuestion = ""

    const rawText = (accumulatedVoiceTextRef.current || "").trim()
    const fromVoice = extractLastQuestion(rawText)

    if (fromVoice && fromVoice.length >= 3) {
      mainQuestion = fromVoice
      accumulatedVoiceTextRef.current = ""
      lastInterimTextRef.current = ""
      setLiveInterimText("")
    } else if (userQuestions.length > 0) {
      const lastIdx = userQuestions.length - 1
      mainQuestion = userQuestions[lastIdx]
    }

    if (!mainQuestion) {
      const onlyUser = conversationRef.current.filter((m) => m.role === "user")
      const lastUser = onlyUser[onlyUser.length - 1]?.text?.trim() || ""
      if (!lastUser) {
        console.log("[Assist] no question found, skipping")
        return
      }
      mainQuestion = lastUser
    }

    const normalizedQuestion = normalizeQuestion(mainQuestion)
    const normalizedLastSent = normalizeQuestion(lastSentQuestionRef.current)

    if (normalizedQuestion === normalizedLastSent) {
      console.log("[Assist] duplicate question detected, skipping:", mainQuestion)
      return
    }
    
    chatInFlightRef.current = true
    lastSentQuestionRef.current = mainQuestion

    console.log("[Assist] mainQuestion:", mainQuestion)

    const conversationHistory = conversationRef.current || []
    
    const contextPairs: Array<{ question: string; answer: string }> = []
    let currentUserMsg: { role: "user" | "assistant"; text: string } | null = null
    
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const msg = conversationHistory[i]
      
      if (msg.role === "assistant" && currentUserMsg) {
        const msgNormalized = normalizeQuestion(currentUserMsg.text.trim())
        if (msgNormalized !== normalizedQuestion) {
          contextPairs.unshift({
            question: currentUserMsg.text.trim(),
            answer: msg.text.trim()
          })
        }
        currentUserMsg = null
        if (contextPairs.length >= 3) break
      } else if (msg.role === "user") {
        const msgNormalized = normalizeQuestion(msg.text.trim())
        if (msgNormalized !== normalizedQuestion) {
          currentUserMsg = msg
        }
      }
    }
    
    let contextPrompt = ""
    
    if (contextPairs.length > 0) {
      contextPrompt = "\n\nКонтекст предыдущего диалога (последние вопросы и ответы):\n"
      
      contextPairs.forEach((pair, idx) => {
        contextPrompt += `${idx + 1}. Вопрос: ${pair.question}\n   Ответ: ${pair.answer}\n`
        if (idx < contextPairs.length - 1) {
          contextPrompt += "\n"
        }
      })
      
      contextPrompt += "\nТекущий вопрос (на который нужно ответить):"
    }

    const prompt = `Ты помощник на собеседовании. Ответь по-русски, чётко и по делу на вопрос собеседника.${contextPrompt}\n"${mainQuestion}"\n\nУчти контекст предыдущих вопросов и ответов, особенно если текущий вопрос является уточнением или подвопросом к предыдущим. Дай развернутый и полезный ответ, который поможет собеседнику.`

    console.log("[Assist] final prompt:", prompt)

    appendTranscript({ speaker: "user", text: mainQuestion })
    conversationRef.current = [...conversationRef.current, { role: "user", text: mainQuestion }]
    
    let screenshotPath: string | undefined = undefined
    if (useScreen) {
      try {
        console.log("[Assist] Taking screenshot for context...")
        const screenshotResult = await window.electronAPI.takeScreenshot()
        screenshotPath = screenshotResult.path
        console.log("[Assist] Screenshot taken:", screenshotPath)
      } catch (err) {
        console.error("[Assist] Failed to take screenshot:", err)
      }
    }
    
    try {
      setAnswers((prev) => (prev.length === 0 ? [""] : prev))
      streamingAssistantIndexRef.current = null
      const response = await askStream(prompt, screenshotPath)
      
      conversationRef.current = [...conversationRef.current, { role: "assistant", text: response }]
    } catch (err: any) {
      const message = err?.message ? `Ошибка: ${err.message}` : "Ошибка обработки голоса."
      appendTranscript({ speaker: "assistant", text: message })
      setLastAssistantAnswer(message)
      setVoiceError(message)
      conversationRef.current = [...conversationRef.current, { role: "assistant", text: message }]
    } finally {
      chatInFlightRef.current = false
    }
  }, [appendTranscript, askStream, isVoiceRecording, closeVoiceTranscriptionStream, useScreen])

  const testScreenshot = useCallback(async () => {
    try {
      console.log("[Test] Taking screenshot...")
      const screenshotResult = await window.electronAPI.takeScreenshot()
      console.log("[Test] Screenshot taken:", screenshotResult.path)
      
      const testPrompt = "Что изображено на этом скриншоте? Опиши подробно всё, что видишь."
      console.log("[Test] Sending to AI with prompt:", testPrompt)
      
      setAnswers((prev) => (prev.length === 0 ? [""] : prev))
      streamingAssistantIndexRef.current = null
      const response = await askStream(testPrompt, screenshotResult.path)
      
      console.log("[Test] AI Response:", response)
      setAnswers((prev) => {
        const updated = [...prev]
        if (updated.length > 0 && streamingAssistantIndexRef.current !== null) {
          updated[streamingAssistantIndexRef.current] = response
        } else {
          updated.push(response)
        }
        return updated
      })
      setLastAssistantAnswer(response)
      
      return response
    } catch (err: any) {
      console.error("[Test] Error testing screenshot:", err)
      const errorMsg = `Ошибка теста: ${err?.message || String(err)}`
      setVoiceError(errorMsg)
      throw err
    }
  }, [askStream])

  useEffect(() => {
    ;(window as any).testScreenshot = testScreenshot
    console.log("[App] Test function available: window.testScreenshot()")
    return () => {
      delete (window as any).testScreenshot
    }
  }, [testScreenshot])

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
      if (payload.answer?.trim()) {
        setAnswers((prev) => [...prev, payload.answer.trim()])
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

  useEffect(() => {
    if (sessionActive) {
      document.body.classList.add("session-active")
    } else {
      document.body.classList.remove("session-active")
    }
    return () => {
      document.body.classList.remove("session-active")
    }
  }, [sessionActive])

  const handleOpacityChange = useCallback(async (opacity: number) => {
    try {
      await window.electronAPI.setWindowOpacity?.(opacity)
    } catch (error) {
      console.error("[App] Error setting window opacity:", error)
    }
  }, [])

  useEffect(() => {
    // Инициализация прозрачности при загрузке
    try {
      const saved = localStorage.getItem("windowOpacity")
      const initialOpacity = saved ? parseFloat(saved) : 1.0
      handleOpacityChange(initialOpacity)
    } catch (error) {
      console.error("[App] Error initializing window opacity:", error)
    }
  }, [handleOpacityChange])

  const startNewSession = () => {
    stopVoiceRecording()
    conversationRef.current = []
    transcriptRef.current = []
    accumulatedVoiceTextRef.current = ""
    lastInterimTextRef.current = ""
    setTranscript([])
    setAnswers([])
    setSummaryText("")
    setShowSummary(false)
    setSessionActive(true)
    setActiveTab("chat")
    setPaused(false)
    setShowProfile(false)
    setLastAssistantAnswer("")
    setVoiceError(null)
    chatInFlightRef.current = false
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
    <div
      ref={containerRef}
      className={cn(
        // Прозрачный оверлей на весь экран — внутри только компактные панели
        "fixed inset-0 w-full h-full overflow-hidden bg-transparent",
        sessionActive ? "pointer-events-none" : "pointer-events-auto"
      )}
    >
        <ToastProvider>
        {/* Главное окно полностью скрыто */}
          <ToastViewport />

        {/* Плавающий оверлей всегда виден, как в Cluely */}
        <OpacitySlider onOpacityChange={handleOpacityChange} />

        {!showProfile && (
          <div className="pointer-events-auto">
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
              onClose={async () => {
                try {
                  await window.electronAPI.invoke?.("toggle-window")
                } catch {}
              }}
            />
          </div>
        )}

        {!showProfile && (
          <div
            className="fixed left-1/2 top-[150px] -translate-x-1/2 z-[9990] pointer-events-auto"
            ref={floatingRef}
          >
            {activeTab === "transcript" ? (
              <TranscriptView lines={transcript} />
            ) : (
              <div className="space-y-1">
                <ChatView
                  answers={answers}
                  onAsk={geminiAsk}
                  externalAnswer={lastAssistantAnswer}
                  onAnswered={handleChatAnswered}
                  onAssistClick={handleAssistClick}
                  useScreen={useScreen}
                  onUseScreenChange={setUseScreen}
                />
                {liveInterimText && (
                  <div className="mt-1 text-xs text-muted-foreground italic">
                    {liveInterimText}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {voiceError && (
          <Alert 
            variant="destructive"
            className="fixed top-[100px] left-1/2 -translate-x-1/2 z-[9991] pointer-events-auto mb-3 bg-red-600/85 text-white border-red-500/50 shadow-lg max-w-md"
          >
            <AlertDescription className="text-xs">
              {voiceError}
            </AlertDescription>
          </Alert>
        )}


        <ProfileSettings
          open={showProfile}
          onOpenChange={setShowProfile}
          voiceDevices={voiceDevices}
          selectedDeviceId={selectedVoiceDevice}
          onSelectDevice={selectVoiceDevice}
          onRefreshDevices={refreshVoiceDevices}
        />
        </ToastProvider>
    </div>
  )
}

export default App
