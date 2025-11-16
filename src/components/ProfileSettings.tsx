import React, { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import { Button } from "./ui/button"
import { Separator } from "./ui/separator"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { useQueryClient } from "react-query"

interface ProfileSettingsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  voiceDevices: Array<{ deviceId: string; label: string }>
  selectedDeviceId: string
  onSelectDevice: (id: string) => void
  onRefreshDevices: () => void
}

export const ProfileSettings: React.FC<ProfileSettingsProps> = ({
  open,
  onOpenChange,
  voiceDevices,
  selectedDeviceId,
  onSelectDevice,
  onRefreshDevices
}) => {
  const [token, setToken] = useState<string | null>(null)
  const [premium, setPremium] = useState<{ isPremium: boolean; premiumUntil: string | null } | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!open) return
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
  }, [open])

  const handleLogout = async () => {
    if (confirm("Вы уверены, что хотите выйти?")) {
      try {
        await (
          (window as any).electronAPI.clearToken?.() ||
          (window as any).electronAPI.invoke("clear-token")
        )
        queryClient.setQueryData(["auth_token"], null)
        setToken(null)
        console.log("[ProfileSettings] Token cleared")
      } catch (e) {
        console.error("[ProfileSettings] Error clearing token:", e)
      }
    }
  }

  const microphoneOptions = voiceDevices.length
    ? voiceDevices.map((device, index) => ({
        deviceId: device.deviceId || `device-${index}`,
        label: device.label || `Микрофон ${index + 1}`
      }))
    : [{ deviceId: "", label: "Стандартный микрофон" }]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-black/80 backdrop-blur-md border-white/10">
        <DialogHeader>
          <DialogTitle className="text-white">Профиль и настройки</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-sm">Статус</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <CardDescription className="text-white/70">
                  {token ? (
                    <span>Авторизован • токен {token.substring(0, 16)}…</span>
                  ) : (
                    <span>Не авторизован</span>
                  )}
                </CardDescription>
                {token && (
                  <Button
                    onClick={handleLogout}
                    variant="outline"
                    size="sm"
                    className="border-red-500/50 text-red-400 hover:bg-red-500/20 hover:text-red-300"
                  >
                    Выйти
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-sm">Подписка</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-white/70 mb-4">
                {premium?.isPremium ? (
                  <span>Премиум до: {premium.premiumUntil || "—"}</span>
                ) : (
                  <span>Free</span>
                )}
              </CardDescription>
              {!premium?.isPremium && (
                <Button
                  onClick={() => (window as any).electronAPI.openPremiumPurchase?.()}
                  className="bg-amber-600 hover:bg-amber-700 text-black"
                >
                  Купить премиум
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-sm">Микрофон</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Select value={selectedDeviceId} onValueChange={onSelectDevice}>
                  <SelectTrigger className="bg-black/20 border-white/10 text-white flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-black/90 border-white/10">
                    {microphoneOptions.map((option) => (
                      <SelectItem
                        key={option.deviceId || option.label}
                        value={option.deviceId}
                        className="text-white"
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onRefreshDevices}
                  className="border-white/10 text-white hover:bg-white/10"
                >
                  ↻
                </Button>
              </div>
              <CardDescription className="text-white/50 text-xs mt-2">
                Выберите устройство, которое будет использоваться для записи голоса.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}
