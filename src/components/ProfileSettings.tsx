import React, { useEffect, useMemo, useState } from "react"

interface ProfileSettingsProps {
  voiceDevices: Array<{ deviceId: string; label: string }>
  selectedDeviceId: string
  onSelectDevice: (id: string) => void
  onRefreshDevices: () => void
}

export const ProfileSettings: React.FC<ProfileSettingsProps> = ({
  voiceDevices,
  selectedDeviceId,
  onSelectDevice,
  onRefreshDevices
}) => {
  const [token, setToken] = useState<string | null>(null)
  const [premium, setPremium] = useState<{ isPremium: boolean; premiumUntil: string | null } | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const t = await (window as any).electronAPI.getToken?.()
        setToken(t || null)
      } catch {}
      try {
        const info = await (window as any).electronAPI.getPremiumInfo?.()
        if (info) setPremium({ isPremium: !!info.isPremium, premiumUntil: info.premiumUntil })
      } catch {}
    })()
  }, [])

  const microphoneOptions = useMemo(() => {
    if (!voiceDevices.length) {
      return [{ deviceId: "", label: "Стандартный микрофон" }]
    }
    return voiceDevices.map((device, index) => ({
      deviceId: device.deviceId || `device-${index}`,
      label: device.label || `Микрофон ${index + 1}`
    }))
  }, [voiceDevices])

  return (
    <div
      style={{
        width: 780,
        maxWidth: "94vw",
        background: "rgba(17,24,39,0.95)",
        color: "#e5e7eb",
        borderRadius: 14,
        padding: 20,
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 14px 34px rgba(0,0,0,0.5)",
        margin: "60px auto"
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Профиль и настройки</div>
      <div style={{ display: "grid", gap: 12 }}>
        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            padding: 12,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.12)"
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Статус</div>
          <div style={{ fontSize: 13, opacity: 0.9 }}>
            {token ? (
              <span>Авторизован • токен {token.substring(0, 16)}…</span>
            ) : (
              <span>Не авторизован</span>
            )}
          </div>
        </div>
        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            padding: 12,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.12)"
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Подписка</div>
          <div style={{ fontSize: 13, opacity: 0.9 }}>
            {premium?.isPremium ? (
              <span>Премиум до: {premium.premiumUntil || "—"}</span>
            ) : (
              <span>Free</span>
            )}
          </div>
          {!premium?.isPremium && (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => (window as any).electronAPI.openPremiumPurchase?.()}
                style={{
                  background: "#f59e0b",
                  color: "#000",
                  border: "none",
                  padding: "8px 12px",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontWeight: 700
                }}
              >
                Купить премиум
              </button>
            </div>
          )}
        </div>
        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            padding: 12,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.12)"
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Микрофон</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <select
              value={selectedDeviceId}
              onChange={(e) => onSelectDevice(e.target.value)}
              style={{
                background: "rgba(0,0,0,0.25)",
                color: "#fff",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.2)",
                padding: "8px 10px",
                flex: 1,
                fontSize: 13
              }}
            >
              {microphoneOptions.map((option) => (
                <option key={option.deviceId || option.label} value={option.deviceId}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              onClick={onRefreshDevices}
              style={{
                background: "rgba(255,255,255,0.12)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 12px",
                cursor: "pointer",
                fontWeight: 600
              }}
            >
              ↻
            </button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
            Выберите устройство, которое будет использоваться для записи голоса.
          </div>
        </div>
      </div>
    </div>
  )
}

