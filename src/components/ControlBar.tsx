import React from "react"

type Tab = "chat" | "transcript"

export interface ControlBarProps {
  tab: Tab
  onTabChange: (t: Tab) => void
  paused: boolean
  onPauseToggle: () => void
  onStop: () => void
  onHome: () => void
  onToggleRecording: () => void
  recording: boolean
  inputLevel: number
}

export const ControlBar: React.FC<ControlBarProps> = ({
  tab,
  onTabChange,
  paused,
  onPauseToggle,
  onStop,
  onHome,
  onToggleRecording,
  recording,
  inputLevel
}) => {
  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        top: 90,
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 10
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(31,41,55,0.95)",
          color: "#fff",
          padding: "8px 10px",
          borderRadius: 14,
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          border: "1px solid rgba(255,255,255,0.12)"
        }}
      >
        <button
          title="Home"
          onClick={onHome}
          style={{
            background: "transparent",
            color: "#fff",
            border: "none",
            padding: "6px 10px",
            borderRadius: 10,
            cursor: "pointer"
          }}
        >
          🏠
        </button>
        <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.1)" }} />
        <button
          onClick={onToggleRecording}
          style={{
            background: recording ? "#dc2626" : "transparent",
            color: "#fff",
            border: "none",
            padding: "6px 12px",
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
            boxShadow: recording ? "0 0 12px rgba(220,38,38,0.45)" : "none",
            transition: "all 0.2s ease"
          }}
          title={recording ? "Остановить запись" : "Начать запись голоса"}
        >
          <span style={{ display: "inline-flex", alignItems: "center" }}>{recording ? "● REC" : "🎤 Record"}</span>
          <span
            style={{
              display: "inline-block",
              width: 60,
              height: 6,
              borderRadius: 4,
              background: "rgba(255,255,255,0.15)",
              overflow: "hidden"
            }}
          >
            <span
              style={{
                display: "block",
                width: `${Math.min(100, Math.round(inputLevel * 140))}%`,
                height: "100%",
                background: recording ? "#f97316" : "#6b7280",
                transition: "width 0.15s ease"
              }}
            />
          </span>
        </button>
        <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.1)" }} />
        <button
          onClick={() => onTabChange("chat")}
          style={{
            background: tab === "chat" ? "rgba(255,255,255,0.12)" : "transparent",
            color: "#fff",
            border: "none",
            padding: "6px 10px",
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 600
          }}
        >
          Chat
        </button>
        <button
          onClick={() => onTabChange("transcript")}
          style={{
            background: tab === "transcript" ? "rgba(255,255,255,0.12)" : "transparent",
            color: "#fff",
            border: "none",
            padding: "6px 10px",
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 600
          }}
        >
          Transcript
        </button>
        <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.1)" }} />
        <button
          title={paused ? "Resume" : "Pause"}
          onClick={onPauseToggle}
          style={{
            background: "transparent",
            color: "#fff",
            border: "none",
            padding: "6px 10px",
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 600
          }}
        >
          {paused ? "▶︎" : "⏸"}
        </button>
        <button
          title="Stop"
          onClick={onStop}
          style={{
            background: "#ef4444",
            color: "#fff",
            border: "none",
            padding: "6px 12px",
            borderRadius: 10,
            cursor: "pointer",
            fontWeight: 700,
            marginLeft: 2
          }}
        >
          ⏹ Stop
        </button>
      </div>
    </div>
  )
}



