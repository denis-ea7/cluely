import React from "react"

export const SummaryOverlay: React.FC<{
  open: boolean
  summary: string
  onClose: () => void
  onNewSession?: () => void
}> = ({ open, summary, onClose, onNewSession }) => {
  if (!open) return null
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9980,
        padding: 16
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 820,
          maxWidth: "76vw",
          maxHeight: "76vh",
          overflowY: "auto",
          background: "rgba(17,24,39,0.95)",
          color: "#e5e7eb",
          borderRadius: 14,
          padding: 20,
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 14px 34px rgba(0,0,0,0.5)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Итоги встречи</div>
          <div style={{ display: "flex", gap: 8 }}>
            {onNewSession && (
              <button
                onClick={onNewSession}
                style={{
                  background: "#10b981",
                  color: "#000",
                  border: "none",
                  borderRadius: 8,
                  padding: "6px 12px",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                Новая сессия
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "none",
                color: "#fff",
                borderRadius: 8,
                padding: "6px 10px",
                cursor: "pointer",
                fontWeight: 700
              }}
            >
              Закрыть
            </button>
          </div>
        </div>
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 14 }}>{summary}</div>
      </div>
    </div>
  )
}


