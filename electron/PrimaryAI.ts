import fs from "fs"
import https from "https"
import WebSocket from "ws"
import { Reader as WavReader } from "wav"

export type PrimaryAIConfig = {
  token: string
  wsUrl: string
  chatUrl: string
  model?: string
  language?: string
}

export class PrimaryAI {
  private readonly token: string
  private readonly wsUrl: string
  private readonly chatUrl: string
  private readonly model: string
  private readonly language: string

  constructor(cfg: PrimaryAIConfig) {
    if (!cfg?.token || !cfg?.wsUrl || !cfg?.chatUrl) {
      throw new Error("PrimaryAI: token, wsUrl and chatUrl are required")
    }
    this.token = cfg.token
    this.wsUrl = cfg.wsUrl
    this.chatUrl = cfg.chatUrl
    this.model = cfg.model || "gpt-4.1"
    this.language = cfg.language || "ru"
  }

  public async chat(message: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let full = ""
      const payload = JSON.stringify({
        model: this.model,
        stream: true,
        messages: [{ role: "user", content: message }]
      })

      const req = https.request(
        this.chatUrl,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload)
          },
          timeout: 30000
        },
        (res) => {
          res.setEncoding("utf8")
          res.on("data", (chunk: string) => {
            const lines = String(chunk).split("\n")
            for (const line of lines) {
              if (!line.startsWith("data:")) continue
              const data = line.replace("data:", "").trim()
              if (data === "[DONE]") {
                resolve(full)
                return
              }
              try {
                const json = JSON.parse(data)
                const delta: string | undefined = json?.choices?.[0]?.delta?.content
                if (delta) {
                  full += delta
                }
              } catch {
              }
            }
          })
          res.on("error", (e) => reject(e))
          res.on("end", () => resolve(full))
        }
      )
      req.on("error", (err) => reject(err))
      req.write(payload)
      req.end()
    })
  }

  
  public async chatStream(message: string, onDelta: (delta: string) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      let full = ""
      const payload = JSON.stringify({
        model: this.model,
        stream: true,
        messages: [{ role: "user", content: message }]
      })
      const req = https.request(
        this.chatUrl,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload)
          },
          timeout: 30000
        },
        (res) => {
          res.setEncoding("utf8")
          res.on("data", (chunk: string) => {
            const lines = String(chunk).split("\n")
            for (const line of lines) {
              if (!line.startsWith("data:")) continue
              const data = line.replace("data:", "").trim()
              if (data === "[DONE]") {
                resolve(full)
                return
              }
              try {
                const json = JSON.parse(data)
                const delta: string | undefined = json?.choices?.[0]?.delta?.content
                if (delta) {
                  full += delta
                  try { onDelta(delta) } catch {}
                }
              } catch {
              }
            }
          })
          res.on("error", (e) => reject(e))
          res.on("end", () => resolve(full))
        }
      )
      req.on("error", (err) => reject(err))
      req.write(payload)
      req.end()
    })
  }

  public async transcribeWavPcm16File(filePath: string): Promise<string> {
    if (!fs.existsSync(filePath)) {
      throw new Error("File not found: " + filePath)
    }
    const wavStream = fs.createReadStream(filePath)
    const reader = new WavReader()

    let audioFormat: number | null = null
    let sampleRate: number | null = null
    let channels: number | null = null
    let bitDepth: number | null = null
    let collected: Buffer[] = []

    return new Promise<string>((resolve, reject) => {
      reader.on("format", (format: { audioFormat: number; sampleRate: number; channels: number; bitDepth: number }) => {
        audioFormat = format.audioFormat 
        sampleRate = format.sampleRate
        channels = format.channels
        bitDepth = format.bitDepth
      })
      reader.on("data", (chunk: Buffer) => {
        collected.push(Buffer.from(chunk))
      })
      reader.on("error", (e: Error) => reject(e))
      reader.on("end", async () => {
        try {
          if (audioFormat !== 1 || sampleRate !== 16000 || channels !== 1 || bitDepth !== 16) {
            reject(
              new Error(
                `Unsupported WAV format. Expected PCM(1ch,16kHz,16-bit). Got format=${audioFormat}, sr=${sampleRate}, ch=${channels}, bit=${bitDepth}`
              )
            )
            return
          }
          const pcm = Buffer.concat(collected)
          const text = await this.transcribePcm16Buffer(pcm, 16000)
          resolve(text)
        } catch (e) {
          reject(e)
        }
      })
      wavStream.pipe(reader)
    })
  }

  public async transcribePcm16Buffer(pcm: Buffer, sampleRateHertz = 16000): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let lastText = ""
      const ws = new WebSocket(this.wsUrl, {
        headers: { Authorization: `Bearer ${this.token}` }
      })
      let closed = false
      const cleanup = () => {
        if (closed) return
        closed = true
        try {
          ws.close(1000, "done")
        } catch {}
      }

      const finish = () => {
        cleanup()
        resolve(lastText || "")
      }

      ws.on("open", () => {
        ws.send(
          JSON.stringify({
            type: "start",
            intent: "transcription",
            language: this.language,
            encoding: "LINEAR16",
            sampleRateHertz
          })
        )
        ws.send(pcm)
        setTimeout(finish, 600)
      })
      ws.on("message", (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg?.type === "interim" && msg?.text) {
            lastText = msg.text
          }
        } catch {
        }
      })
      ws.on("error", (e: Error) => {
        cleanup()
        reject(e)
      })
      ws.on("close", () => {
        finish()
      })
      setTimeout(() => {
        finish()
      }, 15000)
    })
  }

  public createTranscriptionStream(
    onInterim: (text: string) => void,
    onError?: (error: Error) => void
  ): {
    ws: WebSocket
    sendChunk: (pcmChunk: Buffer) => void
    close: () => Promise<void>
  } {
    const ws = new WebSocket(this.wsUrl, {
      headers: { Authorization: `Bearer ${this.token}` }
    })
  
    let isOpen = false
    let pendingChunks: Buffer[] = []
    let lastText = ""
    let isClosing = false
  
    ws.on("open", () => {
      if (isClosing) {
        ws.close(1000, "done")
        return
      }
      isOpen = true
      ws.send(
        JSON.stringify({
          type: "start",
          intent: "transcription",
          language: this.language,
          encoding: "LINEAR16",
          sampleRateHertz: 16000
        })
      )
  
      for (const chunk of pendingChunks) {
        ws.send(chunk)
      }
      pendingChunks = []
    })
  
    ws.on("message", (data: WebSocket.Data) => {
      if (isClosing) return
      try {
        const msg = JSON.parse(data.toString())
  
        // сервер шлёт полный текст, а не дельты — обновляем, не конкатенируем
        if (msg?.type === "interim" && msg?.text) {
          lastText = msg.text
          onInterim(lastText)
        }
  
        // при финальном сообщении завершаем
        if (msg?.type === "final" && msg?.text) {
          lastText = msg.text
          onInterim(lastText)
          ws.close(1000, "done")
        }
      } catch (err) {
        if (onError) onError(err as Error)
      }
    })
  
    ws.on("error", (e: Error) => {
      if (onError && !isClosing) onError(e)
    })
  
    const sendChunk = (pcmChunk: Buffer) => {
      if (isClosing) return
      
      if (isOpen && ws.readyState === WebSocket.OPEN) {
        try {
          if (ws.bufferedAmount > 1024 * 1024) {
            if (pendingChunks.length < 50) {
              pendingChunks.push(pcmChunk)
            }
            return
          }
        ws.send(pcmChunk)
        } catch (err) {
          if (pendingChunks.length < 50) {
            pendingChunks.push(pcmChunk)
          }
        }
      } else {
        if (pendingChunks.length < 100) {
        pendingChunks.push(pcmChunk)
        }
      }
    }
  
    const close = (): Promise<void> => {
      return new Promise((resolve) => {
        if (isClosing) {
          resolve()
          return
        }
        
        isClosing = true
        isOpen = false
        pendingChunks = []
        
        const state = ws.readyState
        if (state === WebSocket.CLOSED || state === WebSocket.CLOSING) {
          resolve()
          return
        }
        
        if (state === WebSocket.CONNECTING) {
          // Если WebSocket еще подключается, ждем открытия или ошибки, затем закрываем
          const timeout = setTimeout(() => {
            try {
              if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) {
        ws.close(1000, "done")
      }
            } catch {}
            resolve()
          }, 1000)
          
          const onOpen = () => {
            clearTimeout(timeout)
            ws.removeListener("open", onOpen)
            ws.removeListener("error", onError)
            ws.removeListener("close", onClose)
            try {
              ws.close(1000, "done")
            } catch {}
            resolve()
          }
          
          const onError = () => {
            clearTimeout(timeout)
            ws.removeListener("open", onOpen)
            ws.removeListener("error", onError)
            ws.removeListener("close", onClose)
            resolve()
          }
          
          const onClose = () => {
            clearTimeout(timeout)
            ws.removeListener("open", onOpen)
            ws.removeListener("error", onError)
            ws.removeListener("close", onClose)
            resolve()
          }
          
          ws.once("open", onOpen)
          ws.once("error", onError)
          ws.once("close", onClose)
        } else if (state === WebSocket.OPEN) {
          // Если WebSocket открыт, просто закрываем и ждем события close
          const onClose = () => {
            ws.removeListener("close", onClose)
            resolve()
          }
          ws.once("close", onClose)
          try {
            ws.close(1000, "done")
          } catch (err) {
            resolve()
          }
        } else {
          resolve()
        }
      })
    }
  
    return { ws, sendChunk, close }
  }
}