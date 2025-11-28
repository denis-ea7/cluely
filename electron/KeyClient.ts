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
    
    // Configurable timeout (default 60 seconds for slow connections)
    const timeoutMs = Number(process.env.KEY_AGENT_TIMEOUT_MS) || 60000
    
    try {
      const { data } = await axios.get<KeysResponse>(`${this.url}/keys`, { 
        headers, 
        timeout: timeoutMs,
        validateStatus: (status) => status < 500 // Don't throw on 4xx errors
      })
      this.cache = data || {}
      this.cacheAt = now
      return this.cache
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        throw new Error(`Не удалось подключиться к key-agent по адресу ${this.url}. Проверьте, что сервер запущен и доступен.`)
      } else if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
        throw new Error(`Превышено время ожидания подключения к key-agent (${timeoutMs/1000} сек). Проверьте подключение к интернету и доступность сервера ${this.url}.`)
      } else if (error.response) {
        throw new Error(`Key-agent вернул ошибку: ${error.response.status} ${error.response.statusText}`)
      }
      throw error
    }
  }
}


