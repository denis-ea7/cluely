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
      startChatStream: (message: string) => Promise<void>
      onChatDelta: (callback: (data: { delta: string }) => void) => () => void
      onChatComplete: (callback: (data: { text: string }) => void) => () => void
    }
  }
}

// Нормализация вопроса для дедупликации
const normalizeQuestion = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,!…–—-]+$/g, "")
    .trim()

const App: React.FC = () => {
  console.log("[App] render start")
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

  
  const askStream = useCallback(async (message: string): Promise<string> => {
    let acc = ""
    // Сбрасываем текст текущего ответа перед началом стриминга
    setLastAssistantAnswer("")
    
    const unDelta = window.electronAPI.onChatDelta?.(({ delta }) => {
      if (!delta) return
      acc += delta
      setLastAssistantAnswer((prev) => {
        const next = (prev || "") + delta
        // Стрим обновляет текущий ответ в списке answers
        setAnswers((prev) => {
          const idx = streamingAssistantIndexRef.current ?? (prev.length - 1)
          if (idx == null || idx < 0 || idx >= prev.length) {
            // если первый чанк — создаем новую запись и фиксируем индекс
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
    await window.electronAPI.startChatStream?.(message)
    
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
      // дедупликация похожих вопросов, чтобы не плодить повтор
      const norm = normalizeQuestion(clean)
      const last = recentQuestionsRef.current[recentQuestionsRef.current.length - 1]
      const isSameOrSubset =
        !!last &&
        (norm.includes(last) || last.includes(norm)) &&
        Math.abs(norm.length - last.length) < 20
      if (isSameOrSubset) {
        return
      }
      recentQuestionsRef.current = [...recentQuestionsRef.current.slice(-4), norm]
      setTranscript((prev) => {
        const next = [...prev, `Пользователь: ${clean}`]
        transcriptRef.current = next
        return next
      })
    }
    conversationRef.current = [...conversationRef.current, { role: entry.speaker, text: clean }]
  }, [])

  const conversationToString = useCallback(() => {
    if (!conversationRef.current.length) return ""
    return conversationRef.current
      .map((item) => `${item.role === "user" ? "User" : "Assistant"}: ${item.text}`)
      .join("\n")
  }, [])

  // Получить последние N сообщений для контекста (чтобы промпт не был слишком длинным)
  const getRecentContext = useCallback((maxMessages: number = 10) => {
    if (!conversationRef.current.length) return ""
    // Берем последние maxMessages сообщений (5 пар вопрос-ответ)
    const recent = conversationRef.current.slice(-maxMessages)
    return recent
      .map((item) => `${item.role === "user" ? "User" : "Assistant"}: ${item.text}`)
      .join("\n")
  }, [])

  
  // Накопленный текст с момента последнего Assist (для отправки при нажатии Assist)
  const accumulatedVoiceTextRef = useRef<string>("")
  const lastInterimTextRef = useRef<string>("")
  // Индекс строки ассистента, в которую пишется текущий стрим-ответ
  const streamingAssistantIndexRef = useRef<number | null>(null)

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
      
      // Игнорируем interim результаты, которые идентичны предыдущим
      if (incoming === lastInterimTextRef.current) {
        return
      }
      
      // Обновляем накопленный текст только если он действительно новый
      const normalizedIncoming = normalizeQuestion(incoming)
      const normalizedAccumulated = normalizeQuestion(accumulatedVoiceTextRef.current)
      
      // Если новый текст является расширением накопленного - обновляем накопленный
      if (normalizedIncoming.length > normalizedAccumulated.length && normalizedIncoming.startsWith(normalizedAccumulated)) {
        accumulatedVoiceTextRef.current = incoming
        lastInterimTextRef.current = incoming
      } else if (normalizedIncoming !== normalizedAccumulated && !normalizedIncoming.includes(normalizedAccumulated)) {
        // Если это совершенно новый текст (не расширение) - заменяем накопленный
        accumulatedVoiceTextRef.current = incoming
        lastInterimTextRef.current = incoming
      }
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

  // Функция для отправки накопленного текста при нажатии Assist
  const handleAssistClick = useCallback(async () => {
    const textToSend = (accumulatedVoiceTextRef.current || "").trim()
    if (!textToSend || textToSend.length < 3) {
      // Если нет накопленного текста, отправляем запрос по последнему контексту
      const recentHistory = getRecentContext(10)
      const prompt = recentHistory
        ? `Контекст диалога (последние сообщения):\n${recentHistory}\n\nДай полезный и краткий ответ по контексту текущей встречи. Будь лаконичен.`
        : "Дай полезный и краткий ответ по контексту текущей встречи. Будь лаконичен."
      
      if (chatInFlightRef.current) return
      chatInFlightRef.current = true
      
      try {
        setAnswers((prev) => prev.length === 0 ? [""] : prev)
        streamingAssistantIndexRef.current = null
        const response = await askStream(prompt)
        // Добавляем в контекст
        conversationRef.current = [...conversationRef.current, { role: "assistant", text: response }]
      } catch (err: any) {
        const message = err?.message ? `Ошибка: ${err.message}` : "Ошибка обработки."
        setVoiceError(message)
      } finally {
        chatInFlightRef.current = false
      }
      return
    }
    
    if (chatInFlightRef.current) return
    chatInFlightRef.current = true
    
    // Добавляем вопрос пользователя в транскрипт и контекст
    appendTranscript({ speaker: "user", text: textToSend })
    conversationRef.current = [...conversationRef.current, { role: "user", text: textToSend }]
    
    // Очищаем накопленный буфер после отправки
    accumulatedVoiceTextRef.current = ""
    lastInterimTextRef.current = ""
    
    try {
      // Получаем последние сообщения для контекста (чтобы промпт не был слишком длинным)
      const recentHistory = getRecentContext(10) // последние 10 сообщений = 5 пар вопрос-ответ

      // Отправляем ИМЕННО последний запрос, но даём модели короткий контекст.
      // Явно просим НЕ перечислять предыдущие вопросы и не делать пересказ.
      const prompt = recentHistory
        ? [
            "Ты помощник по голосовому диалогу.",
            "",
            "Вот краткий контекст предыдущего диалога (ТОЛЬКО для понимания, не нужно его пересказывать):",
            recentHistory,
            "",
            "Последняя реплика пользователя, на которую нужно ответить:",
            `"${textToSend}"`,
            "",
            "Ответь ТОЛЬКО на эту последнюю реплику.",
            "Не повторяй предыдущие вопросы и ответы, не пересказывай весь диалог, не пиши длинный реферат.",
            "Сделай ответ кратким и по делу, но учитывай контекст, если это помогает понять вопрос."
          ].join("\n")
        : [
            "Ты помощник по голосовому диалогу.",
            "",
            "Ответь на следующий запрос пользователя:",
            `"${textToSend}"`,
            "",
            "Не повторяй предыдущие вопросы и не пиши длинный обзор, просто дай конкретный ответ."
          ].join("\n")
      
      // Подготовить слот для ответа в answers
      setAnswers((prev) => prev.length === 0 ? [""] : prev)
      streamingAssistantIndexRef.current = null
      const response = await askStream(prompt)
      
      // Добавляем ответ в контекст
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
  }, [appendTranscript, getRecentContext, askStream])

  // Фиксированный размер окна - не растягиваем автоматически
  // useEffect(() => {
  //   const el = floatingRef.current
  //   if (!el || !window.electronAPI?.ensureWindowSize) return
  //   try {
  //     const rect = el.getBoundingClientRect()
  //     const requiredWidth = Math.ceil(rect.left + rect.width + 24)
  //     const requiredHeight = Math.ceil(rect.top + rect.height + 24)
  //     if (requiredWidth > 0 && requiredHeight > 0) {
  //       window.electronAPI.ensureWindowSize({ width: requiredWidth, height: requiredHeight })
  //     }
  //   } catch {}
  // }, [activeTab, transcript, lastAssistantAnswer, sessionActive])

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

  // Управление прозрачностью body при активной сессии
  useEffect(() => {
    if (sessionActive) {
      document.body.classList.add("session-active")
      document.body.style.backgroundColor = "transparent"
      document.documentElement.style.backgroundColor = "transparent"
    } else {
      document.body.classList.remove("session-active")
      document.body.style.backgroundColor = ""
      document.documentElement.style.backgroundColor = ""
    }
    return () => {
      document.body.classList.remove("session-active")
      document.body.style.backgroundColor = ""
      document.documentElement.style.backgroundColor = ""
    }
  }, [sessionActive])

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

  console.log("[App] Rendering, sessionActive:", sessionActive, "answers:", answers.length, "transcript:", transcript.length)
  
  return (
    <div
      ref={containerRef}
      className={cn(
        "bg-transparent fixed inset-0 w-full h-full overflow-hidden",
        sessionActive ? "pointer-events-none" : "pointer-events-auto"
      )}
    >
        <ToastProvider>
        {/* Главное окно полностью скрыто */}
          <ToastViewport />

        {/* Плавающий оверлей всегда виден, как в Cluely */}
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
              <ChatView
                answers={answers}
                onAsk={geminiAsk}
                externalAnswer={lastAssistantAnswer}
                onAnswered={handleChatAnswered}
                onAssistClick={handleAssistClick}
              />
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
