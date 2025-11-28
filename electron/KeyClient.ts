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
      console.log("[KeyClient] Returning cached keys")
      return this.cache
    }
    const headers: Record<string, string> = {}
    if (this.clientToken) headers["X-Client-Token"] = this.clientToken
    
    // Configurable timeout (default 60 seconds for slow connections)
    const timeoutMs = Number(process.env.KEY_AGENT_TIMEOUT_MS) || 60000
    
    const requestUrl = `${this.url}/keys`
    console.log(`[KeyClient] Fetching keys from: ${requestUrl}`)
    console.log(`[KeyClient] Timeout: ${timeoutMs}ms`)
    const startTime = Date.now()
    
    try {
      const { data } = await axios.get<KeysResponse>(requestUrl, { 
        headers, 
        timeout: timeoutMs,
        validateStatus: (status) => status < 500 // Don't throw on 4xx errors
      })
      const duration = Date.now() - startTime
      console.log(`[KeyClient] Successfully fetched keys in ${duration}ms`)
      
      if (!data) {
        throw new Error("Key-agent returned empty response")
      }
      
      this.cache = data || {}
      this.cacheAt = now
      return this.cache
    } catch (error: any) {
      const duration = Date.now() - startTime
      console.error(`[KeyClient] Error after ${duration}ms:`, {
        code: error.code,
        message: error.message,
        response: error.response ? {
          status: error.response.status,
          statusText: error.response.statusText
        } : null,
        stack: error.stack?.split('\n').slice(0, 3).join('\n')
      })
      
      if (error.code === 'ECONNREFUSED') {
        throw new Error(`Не удалось подключиться к key-agent по адресу ${this.url}. Сервер отклоняет соединение. Проверьте:\n1. Сервер key-agent запущен на указанном адресе\n2. Firewall не блокирует порт 8089\n3. Адрес правильный: ${this.url}`)
      } else if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
        throw new Error(`Не удалось найти сервер key-agent по адресу ${this.url}. Проверьте:\n1. Правильность адреса (IP или доменное имя)\n2. Подключение к интернету\n3. DNS настройки`)
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        throw new Error(`Превышено время ожидания подключения к key-agent (${duration/1000} сек из ${timeoutMs/1000} сек). Проверьте:\n1. Подключение к интернету\n2. Доступность сервера ${this.url}\n3. Firewall/антивирус не блокирует соединение\n4. Попробуйте увеличить KEY_AGENT_TIMEOUT_MS в .env файле`)
      } else if (error.response) {
        throw new Error(`Key-agent вернул ошибку: ${error.response.status} ${error.response.statusText}`)
      } else if (error.message) {
        throw new Error(`Ошибка подключения: ${error.message}`)
      }
      throw error
    }
  }
}


