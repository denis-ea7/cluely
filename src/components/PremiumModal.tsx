import { useEffect, useState, useRef } from "react"

interface PremiumModalProps {
  isOpen: boolean
  onClose: () => void
  onPurchase: () => void
  timeRemaining?: number | null
}

export const PremiumModal: React.FC<PremiumModalProps> = ({
  isOpen,
  onClose,
  onPurchase,
  timeRemaining
}) => {
  const [timeLeft, setTimeLeft] = useState<string>("")
  const [closedManually, setClosedManually] = useState(false)
  const [premiumActivated, setPremiumActivated] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen || !timeRemaining || closedManually || premiumActivated) {
      setTimeLeft("")
      return
    }

    const updateTime = () => {
      if (timeRemaining <= 0) {
        setTimeLeft("Время истекло")
        return
      }

      const seconds = Math.ceil(timeRemaining / 1000)
      const minutes = Math.floor(seconds / 60)
      const secs = seconds % 60
      setTimeLeft(`${minutes}:${secs.toString().padStart(2, "0")}`)
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [isOpen, timeRemaining, closedManually, premiumActivated])

  useEffect(() => {
    if (isOpen && modalRef.current && window.electronAPI?.ensureWindowSize) {
      const modalElement = modalRef.current
      const updateWindowSize = () => {
        if (!modalElement) return
        
        const rect = modalElement.getBoundingClientRect()
        const modalWidth = rect.width
        const modalHeight = rect.height
        
        const padding = 40
        const requiredWidth = modalWidth + padding
        const requiredHeight = modalHeight + padding
        
        window.electronAPI.ensureWindowSize({ 
          width: requiredWidth, 
          height: requiredHeight 
        }).catch((err) => {
          console.error("[PremiumModal] Error ensuring window size:", err)
        })
      }
      
      const timeoutId = setTimeout(updateWindowSize, 150)
      
      const resizeObserver = new ResizeObserver(() => {
        updateWindowSize()
      })
      
      resizeObserver.observe(modalElement)
      
      return () => {
        clearTimeout(timeoutId)
        resizeObserver.disconnect()
      }
    }
  }, [isOpen])

  if (!isOpen || closedManually) return null

  const handleClose = () => {
    setClosedManually(true)
    onClose()
  }

  const handlePurchase = () => {
    setPremiumActivated(true)
    onPurchase()
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        padding: "20px"
      }}
      onClick={handleClose}
    >
      <div
        ref={modalRef}
        style={{
          backgroundColor: "#1f2937",
          borderRadius: "12px",
          padding: "32px",
          maxWidth: "500px",
          width: "100%",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
          border: "1px solid #374151"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>⭐</div>
          <h2
            style={{
              color: "#fff",
              fontSize: "24px",
              fontWeight: 700,
              marginBottom: "8px"
            }}
          >
            Премиум доступ
          </h2>
          <p style={{ color: "#9ca3af", fontSize: "16px" }}>
            Для продолжения использования приложения требуется премиум подписка
          </p>
        </div>

        {timeRemaining != null && timeRemaining > 0 && (
          <div
            style={{
              backgroundColor: "#374151",
              borderRadius: "8px",
              padding: "16px",
              marginBottom: "24px",
              textAlign: "center"
            }}
          >
            <div
              style={{
                color: "#9ca3af",
                fontSize: "14px",
                marginBottom: "4px"
              }}
            >
              Оставшееся время (бесплатный пробный период):
            </div>
            <div
              style={{
                color: "#fbbf24",
                fontSize: "32px",
                fontWeight: 700,
                fontFamily: "monospace"
              }}
            >
              {timeLeft}
            </div>
          </div>
        )}

        <div style={{ marginBottom: "24px" }}>
          <div
            style={{
              color: "#fff",
              fontSize: "18px",
              fontWeight: 600,
              marginBottom: "12px"
            }}
          >
            Премиум включает:
          </div>
          <ul
            style={{
              color: "#d1d5db",
              fontSize: "14px",
              lineHeight: "1.8",
              paddingLeft: "20px"
            }}
          >
            <li>Неограниченное время использования</li>
            <li>Приоритетная поддержка</li>
            <li>Все функции приложения</li>
            <li>Регулярные обновления</li>
          </ul>
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={handleClose}
            style={{
              flex: 1,
              padding: "12px 24px",
              backgroundColor: "#374151",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontSize: "16px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.2s"
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.backgroundColor = "#4b5563")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.backgroundColor = "#374151")
            }
          >
            Закрыть
          </button>
          <button
            onClick={handlePurchase}
            style={{
              flex: 1,
              padding: "12px 24px",
              background:
                "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
              color: "#000",
              border: "none",
              borderRadius: "8px",
              fontSize: "16px",
              fontWeight: 700,
              cursor: "pointer",
              transition: "transform 0.2s",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.3)"
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.transform = "scale(1.02)")
            }
            onMouseOut={(e) =>
              (e.currentTarget.style.transform = "scale(1)")
            }
          >
            Купить премиум
          </button>
        </div>
      </div>
    </div>
  )
}
  