import React from "react"
import { Button } from "./ui/button"
import { Separator } from "./ui/separator"
import { GripVertical, X, Home, Play, Pause, Square, Eye, EyeOff } from "lucide-react"
import { cn } from "../lib/utils"

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
  contentProtectionEnabled: boolean
  onToggleContentProtection: () => void
  onClose?: () => void
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
  inputLevel,
  contentProtectionEnabled,
  onToggleContentProtection,
  onClose
}) => {
  return (
    <div 
      className="fixed left-1/2 top-4 -translate-x-1/2 z-[9999] flex flex-col gap-2 bg-slate-900/90 backdrop-blur-[18px] min-w-[400px] p-2 shadow-2xl border border-slate-700/80 rounded-xl" 
    >
      <div 
        className="flex items-center gap-2 rounded-lg px-3 py-2 border border-slate-600/80 shadow-lg bg-slate-900/95"
      >
        {/* Drag handle */}
        <div className="draggable-area cursor-move flex items-center pr-2">
          <GripVertical className="h-4 w-4 text-white/60" />
        </div>
        
        <Separator orientation="vertical" className="h-5 bg-white/20" />
        
        {/* Home button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onHome}
          className="h-8 w-8 text-white hover:bg-white/10"
        >
          <Home className="h-4 w-4" />
        </Button>
        
        <Separator orientation="vertical" className="h-5 bg-white/20" />
        
        {/* Start Listening / Pause / Stop buttons */}
        {!recording ? (
          <Button
            onClick={onToggleRecording}
            className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-4"
          >
            <Play className="h-4 w-4 mr-2" />
            Start Listening
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={onPauseToggle}
              className="h-8 px-3 text-white hover:bg-white/10"
            >
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onStop}
              className="h-8 px-3"
            >
              <Square className="h-4 w-4" />
            </Button>
          </>
        )}
        
        {/* Input level indicator */}
        {recording && (
          <>
            <Separator orientation="vertical" className="h-5 bg-white/20" />
            <div className="w-16 h-2 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 transition-all duration-150"
                style={{ width: `${Math.min(100, Math.round(inputLevel * 140))}%` }}
              />
            </div>
          </>
        )}
        
        <Separator orientation="vertical" className="h-5 bg-white/20" />
        
        {/* Tabs */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onTabChange("chat")}
          className={cn(
            "h-8 px-3 text-white hover:bg-white/10",
            tab === "chat" ? "bg-white/10" : ""
          )}
        >
          Chat
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onTabChange("transcript")}
          className={cn(
            "h-8 px-3 text-white hover:bg-white/10",
            tab === "transcript" ? "bg-white/10" : ""
          )}
        >
          Transcript
        </Button>
        
        <Separator orientation="vertical" className="h-5 bg-white/20" />
        
        {/* Content Protection toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleContentProtection}
          className={cn(
            "h-8 w-8 text-white hover:bg-white/10",
            contentProtectionEnabled ? "text-green-400" : ""
          )}
          title={contentProtectionEnabled ? "Видна при шаринге" : "Скрыта при шаринге"}
        >
          {contentProtectionEnabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </Button>
        
        <Separator orientation="vertical" className="h-5 bg-white/20" />
        
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8 text-white hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
