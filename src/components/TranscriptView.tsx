  import React from "react"
  import { Card, CardContent } from "./ui/card"
  import { cn } from "../lib/utils"

  export const TranscriptView: React.FC<{
    lines: string[]
  }> = ({ lines }) => {
    const handleCopyAll = async () => {
      try {
        const text = lines.join("\n")
        if (!text) return
        await navigator.clipboard.writeText(text)
      } catch (e) {
        console.error("[TranscriptView] Failed to copy transcript:", e)
      }
    }

    return (
      <Card className="w-[700px] max-w-[92vw] border-slate-600/80 text-white bg-slate-900/95 backdrop-blur-[18px] max-h-[600px] flex flex-col shadow-2xl rounded-2xl">
        <CardContent className="p-4 flex flex-col flex-1 min-h-0 gap-2">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCopyAll}
              className="h-7 px-2 rounded-md text-xs text-white hover:bg-white/20 transition-colors font-medium"
              disabled={lines.length === 0}
            >
              Копировать всё
            </button>
          </div>
          {lines.length === 0 ? (
            <div className="text-white text-sm">Транскрипт появится здесь…</div>
          ) : (
            <div 
              className="space-y-2 overflow-y-auto flex-1 max-h-[550px] bg-slate-900/80 rounded-lg p-3 border border-slate-700/80"
            >
              {lines.map((l, i) => (
                <div key={i} className="text-white text-sm leading-relaxed font-medium">
                  {l}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }
