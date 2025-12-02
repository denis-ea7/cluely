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

  const updateOpacityFromMouse = useCallback((clientX: number) => {
    if (!sliderRef.current) return
    
    const rect = sliderRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const width = rect.width
    const percentage = Math.max(0, Math.min(1, x / width))
    const newOpacity = 0.1 + percentage * 0.9
    setOpacity(newOpacity)
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    isDraggingRef.current = true
    updateOpacityFromMouse(e.clientX)
  }, [updateOpacityFromMouse])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        updateOpacityFromMouse(e.clientX)
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
    <div className="pointer-events-auto">
      <div
        ref={sliderRef}
        className="relative w-full h-2 bg-white/10 rounded-full border border-white/20"
        onMouseDown={handleMouseDown}
      >
        <div
          className="absolute left-0 top-0 bottom-0 bg-white/30 rounded-full"
          style={{
            width: `${percentage}%`,
          }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full border-2 border-slate-800 shadow-lg pointer-events-none"
          style={{
            left: `calc(${percentage}% - 6px)`,
          }}
        />
      </div>
    </div>
  )
}

