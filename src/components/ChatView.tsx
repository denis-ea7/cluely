import React, { useState } from "react"

export const ChatView: React.FC<{
  transcript: string[]
  onAsk: (text: string) => Promise<string>
  height?: number
  externalAnswer?: string
  onAnswered?: (payload: { question?: string; answer: string; type: "assist" | "custom" }) => void
}> = ({ transcript, onAsk, height = 260, externalAnswer, onAnswered }) => {
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState<string>("")
  const [loading, setLoading] = useState(false)

  React.useEffect(() => {
    if (externalAnswer !== undefined) {
      setAnswer(externalAnswer)
    }
  }, [externalAnswer])

  const askWholeContext = async () => {
    if (loading) return
    setLoading(true)
    try {
      const ctx = transcript.join("\n")
      const prompt =
        "Проанализируй эту стенограмму встречи и дай полезный ответ по всему контексту. " +
        "Стенограмма:\n" +
        ctx
      const result = await onAsk(prompt)
      setAnswer(result)
      onAnswered?.({ answer: result, type: "assist" })
    } catch (e: any) {
      setAnswer("Ошибка получения ответа: " + (e?.message || String(e)))
    } finally {
      setLoading(false)
    }
  }

  const askCustom = async () => {
    if (!question.trim() || loading) return
    setLoading(true)
    try {
      const ctx = transcript.join("\n")
      const prompt =
        "Контекст встречи (стенограмма):\n" +
        ctx +
        "\n\nВопрос пользователя:\n" +
        question
      const result = await onAsk(prompt)
      setAnswer(result)
      onAnswered?.({ question, answer: result, type: "custom" })
      setQuestion("")
    } catch (e: any) {
      setAnswer("Ошибка получения ответа: " + (e?.message || String(e)))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        width: 700,
        maxWidth: "92vw",
        background: "rgba(17,24,39,0.9)",
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
        style={{
          height,
          overflowY: "auto",
          background: "rgba(0,0,0,0.2)",
          borderRadius: 10,
          padding: 12,
          border: "1px solid rgba(255,255,255,0.08)"
        }}
      >
        {!answer ? (
          <div style={{ opacity: 0.6, fontSize: 14 }}>
            Нажмите Assist, чтобы получить ответ по всей встрече, или задайте вопрос.
          </div>
        ) : (
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: 14 }}>{answer}</div>
        )}
      </div>
    </div>
  )
}



