  import React, { useEffect, useRef, useState } from "react"
  import { Button } from "./ui/button"
  import { Card, CardContent } from "./ui/card"
  import { Input } from "./ui/input"
  import { Sparkles, Send } from "lucide-react"
  import { cn } from "../lib/utils"
import ReactMarkdown from "react-markdown"
// @ts-ignore - types may not include this theme by default
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
// @ts-ignore
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism"
import remarkGfm from "remark-gfm"

  export const ChatView: React.FC<{
  answers: string[]
  onAsk: (text: string) => Promise<string>
  height?: number
  externalAnswer?: string
  onAnswered?: (payload: { question?: string; answer: string; type: "assist" | "custom" }) => void
  onAssistClick?: () => Promise<void>
  useScreen?: boolean
  onUseScreenChange?: (value: boolean) => void
  assistSummary?: string
  }> = ({ answers, onAsk, height, externalAnswer, onAnswered, onAssistClick, useScreen = false, onUseScreenChange, assistSummary }) => {
    const [question, setQuestion] = useState("")
    const [loading, setLoading] = useState(false)
    const listRef = useRef<HTMLDivElement | null>(null)
    const prevAnswersLengthRef = useRef<number>(answers.length)

    useEffect(() => {
      if (!listRef.current) return
      
      const currentLength = answers.length
      const prevLength = prevAnswersLengthRef.current
      
      // Если появился новый ответ (увеличилась длина массива)
      if (currentLength > prevLength) {
        // Небольшая задержка, чтобы DOM успел обновиться
        setTimeout(() => {
          if (!listRef.current) return
          
          // Прокручиваем к началу последнего ответа
          const lastCard = listRef.current.querySelector(`[data-answer-id="${currentLength - 1}"]`)
          if (lastCard) {
            lastCard.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        }, 50)
      } else if (currentLength === prevLength && currentLength > 0) {
        // Обновление существующего ответа (стриминг)
        // Проверяем, находился ли пользователь внизу перед обновлением
        const container = listRef.current
        const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50
        
        // Если пользователь не был внизу, не прокручиваем
        if (!wasAtBottom) {
          return
        }
      }
      
      prevAnswersLengthRef.current = currentLength
    }, [answers, externalAnswer])

    const askWholeContext = async () => {
      if (loading) return
      setLoading(true)
      try {
        if (onAssistClick) {
          await onAssistClick()
        } else {
          const prompt = "Дай полезный и полный ответ по контексту текущей встречи. Будь лаконичен."
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
              variant={useScreen ? "primary" : "default"}
              className={useScreen ? "bg-blue-800    text-white" : "border-white/30 text-white "}
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
        {assistSummary && (
          <div className="text-xs text-white/80 flex items-center justify-start gap-2 mt-1">
            <span className="px-2 py-0.5 rounded-full bg-indigo-600/90 text-[11px] font-semibold uppercase tracking-wide">
              Assist
            </span>
            <span className="text-xs text-white/80 line-clamp-2">
              {assistSummary}
            </span>
          </div>
        )}
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
              <Card 
                key={idx} 
                data-answer-id={idx}
                className="bg-slate-900/90 border-slate-700/80 p-3 shadow-md"
              >
                  <div className="text-white text-xs font-semibold mb-1">
                    Ассистент:
                  </div>
                  <div className="text-white text-sm leading-relaxed whitespace-pre-wrap">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        ul: (props: any) => (
                          <ul className="list-disc pl-5 space-y-1" {...props} />
                        ),
                        ol: (props: any) => (
                          <ol className="list-decimal pl-5 space-y-1" {...props} />
                        ),
                        p: (props: any) => (
                          <p className="mb-2" {...props} />
                        ),
                        li: (props: any) => (
                          <li className="mb-1" {...props} />
                        ),
                        code(props: any) {
                          const { inline, className, children, ...rest } = props
                          const match = /language-(\w+)/.exec(className || "")
                          if (!inline) {
                            return (
                              <SyntaxHighlighter
                                style={vscDarkPlus as any}
                                language={match?.[1] as any}
                                PreTag="div"
                                wrapLongLines
                                lineProps={{
                                  style: {
                                    whiteSpace: "pre-wrap",
                                    wordBreak: "break-word"
                                  }
                                }}
                                customStyle={{
                                  margin: 0,
                                  borderRadius: 6,
                                  border: "1px solid rgba(148, 163, 184, 0.6)",
                                  background: "#020617",
                                  maxWidth: "100%",
                                  overflow: "visible"
                                }}
                                {...(rest as any)}
                              >
                                {String(children).replace(/\n$/, "")}
                              </SyntaxHighlighter>
                            )
                          }
                          return (
                            <code
                              className="px-1 py-0.5 rounded bg-slate-700/70 font-mono text-xs"
                              {...(rest as any)}
                            >
                              {children}
                            </code>
                          )
                        }
                      }}
                    >
                      {text}
                    </ReactMarkdown>
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
