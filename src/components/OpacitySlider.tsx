import React, { useState, useEffect, useCallback, useRef } from "react"

interface OpacitySliderProps {
  onOpacityChange: (opacity: number) => void
}

export const OpacitySlider: React.FC<OpacitySliderProps> = ({ onOpacityChange }) => {
  const [opacity, setOpacity] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("windowOpacity")
      return saved ? parseFloat(saved) : 1.0
    } catch {
      return 1.0
    }
  })
  const sliderRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)

  useEffect(() => {
    try {
      localStorage.setItem("windowOpacity", opacity.toString())
    } catch {}
    onOpacityChange(opacity)
  }, [opacity, onOpacityChange])

  const updateOpacityFromMouse = useCallback((clientY: number) => {
    if (!sliderRef.current) return
    
    const rect = sliderRef.current.getBoundingClientRect()
    const y = clientY - rect.top
    const height = rect.height
    const percentage = Math.max(0, Math.min(1, 1 - (y / height)))
    const newOpacity = 0.1 + percentage * 0.9
    setOpacity(newOpacity)
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    isDraggingRef.current = true
    updateOpacityFromMouse(e.clientY)
  }, [updateOpacityFromMouse])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        updateOpacityFromMouse(e.clientY)
      }
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
    }
    
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [updateOpacityFromMouse])

  const percentage = ((opacity - 0.1) / 0.9) * 100

  return (
    <div 
      className="fixed left-4 top-1/2 -translate-y-1/2 z-[10000] pointer-events-auto"
    >
      <div
        ref={sliderRef}
        className="relative w-2 h-48 bg-white/10 rounded-full cursor-pointer border border-white/20"
        onMouseDown={handleMouseDown}
        style={{
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)"
        }}
      >
        <div
          className="absolute bottom-0 left-0 right-0 bg-white/30 rounded-full transition-all duration-100"
          style={{
            height: `${percentage}%`,
          }}
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full border-2 border-slate-800 shadow-lg transition-all duration-100 pointer-events-none"
          style={{
            bottom: `calc(${percentage}% - 6px)`,
          }}
        />
      </div>
    </div>
  )
}

