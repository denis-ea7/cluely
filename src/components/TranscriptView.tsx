import React from "react"
import { Card, CardContent } from "./ui/card"
import { cn } from "../lib/utils"

export const TranscriptView: React.FC<{
  lines: string[]
}> = ({ lines }) => {
  return (
    <Card 
      className="w-[700px] max-w-[92vw] border-white/10 text-white"
      style={{ 
        backgroundColor: 'rgba(0,0,0,0.4)', 
        backdropFilter: 'blur(20px)', 
        borderColor: 'rgba(255,255,255,0.15)',
        maxHeight: '600px',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <CardContent className="p-4 flex flex-col flex-1 min-h-0">
        {lines.length === 0 ? (
          <div className="text-white/60 text-sm">Транскрипт появится здесь…</div>
        ) : (
          <div 
            className="space-y-2 overflow-y-auto flex-1"
            style={{ maxHeight: '550px' }}
          >
            {lines.map((l, i) => (
              <div key={i} className="text-white text-sm leading-relaxed">
                {l}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
