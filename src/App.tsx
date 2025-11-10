import { ToastProvider } from "./components/ui/toast"
import Queue from "./_pages/Queue"
import { ToastViewport } from "@radix-ui/react-toast"
import { useEffect, useRef, useState } from "react"
import Solutions from "./_pages/Solutions"
import { useQuery, useQueryClient } from "react-query"

declare global {
  interface Window {
    electronAPI: {
      //RANDOM GETTER/SETTERS
      updateContentDimensions: (dimensions: {
        width: number
        height: number
      }) => Promise<void>
      getScreenshots: () => Promise<Array<{ path: string; preview: string }>>

      //GLOBAL EVENTS
      //TODO: CHECK THAT PROCESSING NO SCREENSHOTS AND TAKE SCREENSHOTS ARE BOTH CONDITIONAL
      onUnauthorized: (callback: () => void) => () => void
      onScreenshotTaken: (
        callback: (data: { path: string; preview: string }) => void
      ) => () => void
      onProcessingNoScreenshots: (callback: () => void) => () => void
      onResetView: (callback: () => void) => () => void
      takeScreenshot: () => Promise<void>

      //INITIAL SOLUTION EVENTS
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

      // Audio Processing
      analyzeAudioFromBase64: (data: string, mimeType: string) => Promise<{ text: string; timestamp: number }>
      analyzeAudioFile: (path: string) => Promise<{ text: string; timestamp: number }>

      moveWindowLeft: () => Promise<void>
      moveWindowRight: () => Promise<void>
      moveWindowUp: () => Promise<void>
      moveWindowDown: () => Promise<void>
      quitApp: () => Promise<void>
      
      // LLM Model Management
      getCurrentLlmConfig: () => Promise<{ provider: "ollama" | "gemini"; model: string; isOllama: boolean }>
      getAvailableOllamaModels: () => Promise<string[]>
      switchToOllama: (model?: string, url?: string) => Promise<{ success: boolean; error?: string }>
      switchToGemini: (apiKey?: string) => Promise<{ success: boolean; error?: string }>
      testLlmConnection: () => Promise<{ success: boolean; error?: string }>
      
      invoke: (channel: string, ...args: any[]) => Promise<any>
      onThemeChange: (callback: (theme: "dark" | "dark") => void) => () => void
      
      // Auth/Token Management
      getToken: () => Promise<string | null>
      setToken: (token: string) => Promise<{ success: boolean; error?: string }>
      clearToken: () => Promise<{ success: boolean }>
      openAuth: () => Promise<{ success: boolean }>
      onTokenUpdated: (callback: (token: string) => void) => () => void
      onWindowFocused: (callback: () => void) => () => void
    }
  }
}

const App: React.FC = () => {
  const [view, setView] = useState<"queue" | "solutions" | "debug">("queue")
  const containerRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
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
      refetchInterval: false, // Don't poll automatically
      refetchOnWindowFocus: true, // Refetch when window gets focus (important!)
      refetchOnReconnect: true, // Refetch on reconnect
      staleTime: 1000, // Consider data stale after 1 second
      cacheTime: 5000 // Cache for 5 seconds
    }
  )

  // Effect for height monitoring
  useEffect(() => {
    // Dynamic theme from main process
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

  // Separate effect for token updates - this needs refetchToken in dependencies
  useEffect(() => {
    console.log("[App] Setting up token update listener...")
    
    // Listen for token updates from deep link
    const cleanupTokenUpdate = window.electronAPI.onTokenUpdated?.((newToken: string) => {
      console.log("[App] ⚡ Token updated event received from deep link, length:", newToken.length)
      
      // Immediately update the query cache with the new token
      queryClient.setQueryData(["auth_token"], newToken)
      console.log("[App] ✅ Token cache updated immediately")
      
      // Also refetch to ensure consistency and trigger UI update
      setTimeout(() => {
        refetchToken().then((result) => {
          console.log("[App] ✅ Token refetched after deep link update, result:", result.data ? "token exists" : "no token")
        }).catch((e) => {
          console.error("[App] ❌ Error refetching token:", e)
        })
      }, 200)
    })

    // Listen for window focus from Electron main process
    const cleanupWindowFocused = window.electronAPI.onWindowFocused?.(() => {
      console.log("[App] 👁️ Window focused event from Electron, checking token...")
      refetchToken()
    })
    
    // Also listen for browser window focus events
    const handleFocus = () => {
      console.log("[App] 👁️ Browser window focused, checking token...")
      refetchToken()
    }
    window.addEventListener('focus', handleFocus)
    
    // Also check on visibility change (when tab/window becomes visible)
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
      cleanupWindowFocused?.()
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refetchToken, queryClient])

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

    // Initial height update
    updateHeight()

    // Observe for changes
    resizeObserver.observe(containerRef.current)

    // Also update height when view changes
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
  }, [view]) // Re-run when view changes

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
      // Update this reset handler
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

  return (
    <div ref={containerRef} className="min-h-0">
      <ToastProvider>
        {(() => {
          // Debug logging
          if (token) {
            console.log("[App] 🔑 Token exists in UI, length:", token.length)
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
                        // Refetch token after delays to check if auth was successful
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
        {view === "queue" ? (
          <Queue setView={setView} />
        ) : view === "solutions" ? (
          <Solutions setView={setView} />
        ) : (
          <></>
        )}
        <ToastViewport />
      </ToastProvider>
    </div>
  )
}

export default App
