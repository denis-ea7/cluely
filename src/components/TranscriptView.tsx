import React from "react"

export const TranscriptView: React.FC<{
  lines: string[]
  height?: number
}> = ({ lines, height }) => {
  return (
    <div
      style={{
        width: 700,
        maxWidth: "92vw",
        ...(height != null ? { height } : {}),
        overflowY: "auto",
        background: "rgba(17,24,39,0.82)",
        color: "#e5e7eb",
        padding: 16,
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.35)"
      }}
    >
      {lines.length === 0 ? (
        <div style={{ opacity: 0.6, fontSize: 14 }}>Транскрипт появится здесь…</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {lines.map((l, i) => (
            <div key={i} style={{ lineHeight: 1.5, fontSize: 14 }}>
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}



