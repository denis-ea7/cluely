import React, { useEffect, useRef, useState } from "react"

export const ChatView: React.FC<{
  answers: string[]
  onAsk: (text: string) => Promise<string>
  height?: number
  externalAnswer?: string
  onAnswered?: (payload: { question?: string; answer: string; type: "assist" | "custom" }) => void
  onAssistClick?: () => Promise<void>
}> = ({ answers, onAsk, height = 260, externalAnswer, onAnswered, onAssistClick }) => {
  const [question, setQuestion] = useState("")
  const [loading, setLoading] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)

  // Автопрокрутка к низу при обновлении диалога или стрим-ответа
  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [answers, externalAnswer])

  const askWholeContext = async () => {
    if (loading) return
    setLoading(true)
    try {
      // Если есть внешний обработчик Assist - используем его
      if (onAssistClick) {
        await onAssistClick()
      } else {
        // Fallback на старую логику
        const prompt = "Дай полезный и краткий ответ по контексту текущей встречи. Будь лаконичен."
        const result = await onAsk(prompt)
        onAnswered?.({ answer: result, type: "assist" })
      }
    } catch (e: any) {
      onAnswered?.({ answer: "Ошибка получения ответа: " + (e?.message || String(e)), type: "assist" })
    } finally {
      setLoading(false)
    }
  }

  const askCustom = async () => {
    if (!question.trim() || loading) return
    setLoading(true)
    try {
      const prompt = `Ответь на вопрос пользователя кратко и по делу:\n${question}`
      const result = await onAsk(prompt)
      onAnswered?.({ question, answer: result, type: "custom" })
      setQuestion("")
    } catch (e: any) {
      onAnswered?.({ question, answer: "Ошибка получения ответа: " + (e?.message || String(e)), type: "custom" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        width: 700,
        maxWidth: "92vw",
        background: "rgba(17,24,39,0.82)",
        color: "#e5e7eb",
        padding: 16,
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.35)"
      }}
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button
          onClick={askWholeContext}
          disabled={loading}
          style={{
            background: "#4f46e5",
            color: "#fff",
            border: "none",
            padding: "8px 12px",
            borderRadius: 10,
            fontWeight: 700,
            cursor: "pointer",
            opacity: loading ? 0.7 : 1
          }}
        >
          Assist
        </button>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Спросить по контексту…"
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.18)",
            color: "#fff",
            borderRadius: 8,
            padding: "8px 10px",
            outline: "none"
          }}
        />
        <button
          onClick={askCustom}
          disabled={loading || !question.trim()}
          style={{
            background: "#10b981",
            color: "#000",
            border: "none",
            padding: "8px 12px",
            borderRadius: 10,
            fontWeight: 700,
            cursor: "pointer",
            opacity: loading ? 0.7 : 1
          }}
        >
          ➤
        </button>
      </div>
      <div
        ref={listRef}
        style={{
          ...(height != null ? { height } : {}),
          overflowY: "auto",
          background: "rgba(0,0,0,0.2)",
          borderRadius: 10,
          padding: 12,
          border: "1px solid rgba(255,255,255,0.08)"
        }}
      >
        {answers.length === 0 ? (
          <div style={{ opacity: 0.6, fontSize: 14 }}>
            Нажмите Assist, чтобы получить ответ по всей встрече, или задайте вопрос.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {answers.map((text, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: "flex-start",
                  maxWidth: "100%",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  padding: "8px 10px",
                  borderRadius: 10,
                  whiteSpace: "pre-wrap",
                  fontSize: 14,
                  lineHeight: 1.5
                }}
              >
                {"Ассистент: " + text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}



