import { TokenManager } from "./TokenManager"

export interface PremiumInfo {
  isPremium: boolean
  premiumUntil: string | null
  timeRemaining: number | null
}

export class PremiumManager {
  private tokenManager: TokenManager
  private apiUrl: string
  private freeTrialMinutes: number = 1
  private sessionStartTime: number | null = null
  private premiumInfo: PremiumInfo | null = null
  private checkInterval: NodeJS.Timeout | null = null

  constructor(tokenManager: TokenManager, apiUrl: string = "http://109.61.108.37:4000") {
    this.tokenManager = tokenManager
    this.apiUrl = apiUrl
  }

  public async startSession(): Promise<PremiumInfo> {
    const token = this.tokenManager.load()
    if (!token) {
      this.premiumInfo = {
        isPremium: false,
        premiumUntil: null,
        timeRemaining: null
      }
      return this.premiumInfo
    }

    try {
      const response = await fetch(`${this.apiUrl}/user/info`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`)
      }

      const data = await response.json()
      const isPremium = data.premium === true && data.premiumUntil && new Date(data.premiumUntil) > new Date()

      if (isPremium) {
        this.premiumInfo = {
          isPremium: true,
          premiumUntil: data.premiumUntil,
          timeRemaining: null
        }
        this.sessionStartTime = null
      } else {
        this.sessionStartTime = Date.now()
        const freeTrialMs = this.freeTrialMinutes * 60 * 1000
        this.premiumInfo = {
          isPremium: false,
          premiumUntil: null,
          timeRemaining: freeTrialMs
        }

        this.startTimer()
      }

      return this.premiumInfo
    } catch (e) {
      console.error("[PremiumManager] Error fetching premium info:", e)
      this.sessionStartTime = Date.now()
      const freeTrialMs = this.freeTrialMinutes * 60 * 1000
      this.premiumInfo = {
        isPremium: false,
        premiumUntil: null,
        timeRemaining: freeTrialMs
      }
      this.startTimer()
      return this.premiumInfo
    }
  }

  private startTimer(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
    }

    this.checkInterval = setInterval(() => {
      if (!this.sessionStartTime || !this.premiumInfo) {
        return
      }

      const elapsed = Date.now() - this.sessionStartTime
      const freeTrialMs = this.freeTrialMinutes * 60 * 1000
      const remaining = Math.max(0, freeTrialMs - elapsed)

      if (this.premiumInfo) {
        this.premiumInfo.timeRemaining = remaining
      }

      if (remaining === 0) {
        this.stopTimer()
        if (typeof process !== "undefined" && process.emit) {
          process.emit("premium-time-expired" as any)
        }
      }
    }, 1000)
  }

  private stopTimer(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
  }

  public getPremiumInfo(): PremiumInfo | null {
    if (!this.premiumInfo) {
      return null
    }

    if (!this.premiumInfo.isPremium && this.sessionStartTime) {
      const elapsed = Date.now() - this.sessionStartTime
      const freeTrialMs = this.freeTrialMinutes * 60 * 1000
      this.premiumInfo.timeRemaining = Math.max(0, freeTrialMs - elapsed)
    }

    return this.premiumInfo
  }

  public canUseApp(): boolean {
    const info = this.getPremiumInfo()
    if (!info) {
      return false
    }

    if (info.isPremium) {
      return true
    }

    return info.timeRemaining !== null && info.timeRemaining > 0
  }

  public getTimeRemainingFormatted(): string {
    const info = this.getPremiumInfo()
    if (!info || info.isPremium || info.timeRemaining === null) {
      return ""
    }

    const seconds = Math.ceil(info.timeRemaining / 1000)
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60

    return `${minutes}:${secs.toString().padStart(2, "0")}`
  }

  public stopSession(): void {
    this.stopTimer()
    this.sessionStartTime = null
    this.premiumInfo = null
  }

  public async refreshPremiumInfo(): Promise<PremiumInfo> {
    this.stopSession()
    return await this.startSession()
  }
}

