import axios from "axios"

export interface PrimaryConfig {
  token: string
  wsUrl: string
  chatUrl: string
  model?: string
}

export interface KeysResponse {
  primary?: PrimaryConfig
  gemini?: { apiKeys?: string[] }
  ollama?: { url?: string; model?: string }
}

export class KeyClient {
  private url: string
  private clientToken?: string
  private cache: KeysResponse | null = null
  private cacheAt = 0
  private ttlMs: number

  constructor(url: string, clientToken?: string, ttlMs: number = 5 * 60 * 1000) {
    this.url = url.replace(/\/+$/, "")
    this.clientToken = clientToken
    this.ttlMs = ttlMs
  }

  public async getKeys(force = false): Promise<KeysResponse> {
    const now = Date.now()
    if (!force && this.cache && now - this.cacheAt < this.ttlMs) {
      return this.cache
    }
    const headers: Record<string, string> = {}
    if (this.clientToken) headers["X-Client-Token"] = this.clientToken
    const { data } = await axios.get<KeysResponse>(`${this.url}/keys`, { headers, timeout: 15000 })
    this.cache = data || {}
    this.cacheAt = now
    return this.cache
  }
}


