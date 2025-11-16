import React, { useState, useEffect, useRef } from "react"
import { IoLogOutOutline } from "react-icons/io5"

interface QueueCommandsProps {
  onTooltipVisibilityChange: (visible: boolean, height: number) => void
  screenshots: Array<{ path: string; preview: string }>
  onChatToggle: () => void
  onSettingsToggle: () => void
}

const QueueCommands: React.FC<QueueCommandsProps> = ({
  onTooltipVisibilityChange,
  screenshots,
  onChatToggle,
  onSettingsToggle
}) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let tooltipHeight = 0
    if (tooltipRef.current && isTooltipVisible) {
      tooltipHeight = tooltipRef.current.offsetHeight + 10
    }
    onTooltipVisibilityChange(isTooltipVisible, tooltipHeight)
  }, [isTooltipVisible])

  const handleMouseEnter = () => {
    setIsTooltipVisible(true)
  }

  const handleMouseLeave = () => {
    setIsTooltipVisible(false)
  }

      return (
        <div className="w-full">
          <div className="text-xs text-white/90 py-1 px-2 flex items-center justify-start gap-4 draggable-area border-b border-white/10">
            {}
            <div className="flex items-center gap-2">
              <span className="text-[11px] leading-none">Show/Hide</span>
              <div className="flex gap-1">
                <button className="bg-white/10 hover:bg-white/20 transition-colors rounded-md px-1.5 py-1 text-[11px] leading-none text-white/70">⌘</button>
                <button className="bg-white/10 hover:bg-white/20 transition-colors rounded-md px-1.5 py-1 text-[11px] leading-none text-white/70">B</button>
              </div>
            </div>

            {}
            {screenshots.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] leading-none">Solve</span>
                <div className="flex gap-1">
                  <button className="bg-white/10 hover:bg-white/20 transition-colors rounded-md px-1.5 py-1 text-[11px] leading-none text-white/70">⌘</button>
                  <button className="bg-white/10 hover:bg-white/20 transition-colors rounded-md px-1.5 py-1 text-[11px] leading-none text-white/70">↵</button>
                </div>
              </div>
            )}

            {}
            <div className="flex items-center gap-2">
              <button className="bg-white/10 hover:bg-white/20 transition-colors rounded-md px-2 py-1 text-[11px] leading-none text-white/70 flex items-center gap-1" onClick={onChatToggle} type="button">💬 Chat</button>
            </div>

            {}
            <div className="flex items-center gap-2">
              <button className="bg-white/10 hover:bg-white/20 transition-colors rounded-md px-2 py-1 text-[11px] leading-none text-white/70 flex items-center gap-1" onClick={onSettingsToggle} type="button">⚙️ Models</button>
            </div>

            {}
            <div className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
              <div className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-colors flex items-center justify-center cursor-help z-10">
                <span className="text-xs text-white/70">?</span>
              </div>
              {isTooltipVisible && (
                <div ref={tooltipRef} className="absolute top-full right-0 mt-2 w-80">
                  <div className="p-3 text-xs bg-black/80 backdrop-blur-md rounded-lg border border-white/10 text-white/90 shadow-lg">
                    <div className="space-y-4">
                      <h3 className="font-medium truncate">Keyboard Shortcuts</h3>
                      {}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mx-2 h-4 w-px bg-white/20" />
            <button className="text-red-500/70 hover:text-red-500/90 transition-colors hover:cursor-pointer" title="Sign Out" onClick={() => window.electronAPI.quitApp()}>
              <IoLogOutOutline className="w-4 h-4" />
            </button>
          </div>
          {}
        </div>
      )
    }

    export default QueueCommands
