  import React, { useEffect, useRef, useState } from "react"
  import { Button } from "./ui/button"
  import { Card, CardContent } from "./ui/card"
  import { Input } from "./ui/input"
  import { Sparkles, Send } from "lucide-react"
  import { cn } from "../lib/utils"

  export const ChatView: React.FC<{
    answers: string[]
    onAsk: (text: string) => Promise<string>
    height?: number
    externalAnswer?: string
    onAnswered?: (payload: { question?: string; answer: string; type: "assist" | "custom" }) => void
    onAssistClick?: () => Promise<void>
    useScreen?: boolean
    onUseScreenChange?: (value: boolean) => void
  }> = ({ answers, onAsk, height, externalAnswer, onAnswered, onAssistClick, useScreen = false, onUseScreenChange }) => {
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

    const handleCopyAll = async () => {
      try {
        const text =
          answers.length === 0
            ? ""
            : answers
                .map((a, i) => `Ответ ${i + 1}:\n${a}`)
                .join("\n\n----------------\n\n")
        if (!text) return
        await navigator.clipboard.writeText(text)
      } catch (e) {
        console.error("[ChatView] Failed to copy all answers:", e)
      }
    }

  return (
    <Card className="w-[700px] max-w-[92vw] border-slate-600/80 text-white bg-slate-900/95 backdrop-blur-[18px] max-h-[600px] flex flex-col shadow-2xl rounded-2xl">
        <CardContent className="p-4 space-y-3 flex flex-col flex-1 min-h-0">
          <div className="flex gap-2 flex-shrink-0">
            <Button
              onClick={askWholeContext}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
              size="sm"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Assist
            </Button>
            <Button
              onClick={() => onUseScreenChange?.(!useScreen)}
              variant={useScreen ? "default" : "outline"}
              className={useScreen ? "bg-green-600 hover:bg-green-700 text-white" : "border-white/30 text-white hover:bg-white/20"}
              size="sm"
              title="Включить отправку скриншота экрана вместе с запросом"
            >
              Use Screen
            </Button>
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && askCustom()}
            placeholder="Спросить по контексту…"
            className="flex-1 bg-black/20 border-white/30 text-white placeholder:text-white/70 focus-visible:ring-white/40 focus-visible:border-white/50"
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
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-white hover:bg-white/20 hover:text-white"
              onClick={handleCopyAll}
              disabled={answers.length === 0}
            >
              Копировать всё
            </Button>
          </div>
        <div
          ref={listRef}
          className="overflow-y-auto bg-slate-900/80 rounded-lg p-3 border border-slate-700/80 flex-1 min-h-0 max-h-[450px]"
        >
          {answers.length === 0 ? (
            <div className="text-white text-sm">
              Нажмите Assist, чтобы получить ответ по всей встрече, или задайте вопрос.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {answers.map((text, idx) => (
              <Card key={idx} className="bg-slate-900/90 border-slate-700/80 p-3 shadow-md">
                  <div className="text-white font-medium text-sm whitespace-pre-wrap leading-relaxed">
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
