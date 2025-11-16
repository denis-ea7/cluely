import React, { useEffect, useRef, useState } from "react"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import { Sparkles, Send } from "lucide-react"
import { cn } from "../lib/utils"

export const ChatView: React.FC<{
  answers: string[]
  onAsk: (text: string) => Promise<string>
  height?: number
  externalAnswer?: string
  onAnswered?: (payload: { question?: string; answer: string; type: "assist" | "custom" }) => void
  onAssistClick?: () => Promise<void>
}> = ({ answers, onAsk, height, externalAnswer, onAnswered, onAssistClick }) => {
  const [question, setQuestion] = useState("")
  const [loading, setLoading] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [answers, externalAnswer])

  const askWholeContext = async () => {
    if (loading) return
    setLoading(true)
    try {
      if (onAssistClick) {
        await onAssistClick()
      } else {
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

  console.log("[ChatView] Rendering, answers:", answers.length)
  return (
    <Card className="w-[700px] max-w-[92vw] border-white/10 text-white" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.15)', maxHeight: '600px', display: 'flex', flexDirection: 'column' }}>
      <CardContent className="p-4 space-y-3 flex flex-col flex-1 min-h-0">
        <div className="flex gap-2 flex-shrink-0">
          <Button
            onClick={askWholeContext}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
            size="sm"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Assist
          </Button>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && askCustom()}
            placeholder="Спросить по контексту…"
            className="flex-1 bg-white/5 border border-white/10 text-white rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20"
          />
          <Button
            onClick={askCustom}
            disabled={loading || !question.trim()}
            className="bg-green-600 hover:bg-green-700 text-white"
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div
          ref={listRef}
          className="overflow-y-auto bg-black/20 rounded-lg p-3 border border-white/5 flex-1 min-h-0"
          style={{ maxHeight: '450px' }}
        >
          {answers.length === 0 ? (
            <div className="text-white/60 text-sm">
              Нажмите Assist, чтобы получить ответ по всей встрече, или задайте вопрос.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {answers.map((text, idx) => (
                <Card key={idx} className="bg-white/5 border-white/10 p-3">
                  <div className="text-white text-sm whitespace-pre-wrap">
                    Ассистент: {text}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
