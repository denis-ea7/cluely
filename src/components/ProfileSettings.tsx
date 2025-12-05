import React, { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import { Button } from "./ui/button"
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
  meetingTemplate: string
  onMeetingTemplateChange: (value: string) => void
  useDeepgram: boolean
  onUseDeepgramChange: (value: boolean) => void
}

export const ProfileSettings: React.FC<ProfileSettingsProps> = ({
  open,
  onOpenChange,
  voiceDevices,
  selectedDeviceId,
  onSelectDevice,
  onRefreshDevices,
  meetingTemplate,
  onMeetingTemplateChange,
  useDeepgram,
  onUseDeepgramChange
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

  const microphoneOptions =
    voiceDevices.length > 0
      ? voiceDevices.map((device, index) => ({
          deviceId: device.deviceId || `device-${index}`,
          label: device.label || `Микрофон ${index + 1}`
        }))
      : []

  const hasMicrophones = microphoneOptions.length > 0

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
                {token ? (
                  <Button
                    onClick={handleLogout}
                    variant="outline"
                    size="sm"
                    className="border-red-500/50 text-red-400 hover:bg-red-500/20 hover:text-red-300"
                  >
                    Выйти
                  </Button>
                ) : (
                  <Button
                    onClick={async () => {
                      try {
                        await (window as any).electronAPI.openAuth?.()
                      } catch (e) {
                        console.error("[ProfileSettings] Error opening auth:", e)
                      }
                    }}
                    variant="outline"
                    size="sm"
                    className="border-blue-500/50 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300"
                  >
                    Войти
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
                <Select
                  value={hasMicrophones ? selectedDeviceId : ""}
                  onValueChange={onSelectDevice}
                  disabled={!hasMicrophones}
                >
                  <SelectTrigger className="bg-black/20 border-white/10 text-white flex-1">
                    <SelectValue
                      placeholder={
                        hasMicrophones ? "Выберите микрофон" : "Нет доступных устройств"
                      }
                    />
                  </SelectTrigger>
                  {hasMicrophones && (
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
                  )}
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onRefreshDevices}
                  className="text-white hover:text-white/80 "
                >
                  ↻
                </Button>
              </div>
              <CardDescription className="text-white/50 text-xs mt-2">
                Выберите устройство, которое будет использоваться для записи голоса.
              </CardDescription>
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={useDeepgram}
                  onChange={(e) => onUseDeepgramChange(e.target.checked)}
                  className="h-4 w-4 rounded-sm border-white/40 bg-black/40"
                />
                <span className="text-white/80 text-xs">
                  Использовать Deepgram (микрофон + системный звук)
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-sm">Шаблон встречи</CardTitle>
              <CardDescription className="text-white/70 text-xs">
                Опишите формат и цель ваших встреч, стиль ответов и важные нюансы. ИИ будет учитывать
                этот текст как дополнительный контекст при ответах и составлении резюме.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <textarea
                value={meetingTemplate}
                onChange={(e) => onMeetingTemplateChange(e.target.value)}
                placeholder="Например: Техническое собеседование на позицию Senior React-разработчика, важно подробно объяснять решения, уделять внимание архитектуре и качеству кода..."
                className="w-full min-h-[120px] resize-y rounded-md bg-black/40 border border-white/15 px-3 py-2 text-sm text-white placeholder:text-white/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              />
              <CardDescription className="text-white/50 text-xs mt-2">
                Шаблон сохраняется локально и будет автоматически применяться ко всем новым сессиям.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}
