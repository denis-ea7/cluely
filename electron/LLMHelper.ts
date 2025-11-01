import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai"
import fs from "fs"

interface OllamaResponse {
  response: string
  done: boolean
}

export class LLMHelper {
  private model: GenerativeModel | null = null
  private geminiKeys: string[] = []
  private keyIndex: number = -1
  private modelCache: Map<string, GenerativeModel> = new Map()
  private openaiKeys: string[] = []
  private openaiKeyIndex: number = -1
  private openaiModel: string = "gpt-4o-mini"
  private useOpenAI: boolean = false
  private readonly systemPrompt = `Ты Wingman AI — полезный, проактивный помощник для любых задач (не только кодинг). Отвечай кратко и по делу. Если запрос подразумевает перечисление (напр. "какие типы данных в JavaScript"), верни только список пунктов, без вводных и пояснений. По умолчанию отвечай на русском языке. Если требуется вернуть JSON, строго следуй формату из запроса: ключи и структура — на английском, как в инструкции; значения-тексты — на русском. Если пользователь пишет на другом языке, всё равно отвечай на русском, пока явно не попросят иначе.`
  private useOllama: boolean = false
  private ollamaModel: string = "llama3.2"
  private ollamaUrl: string = "http://localhost:11434"

  constructor(apiKey?: string | string[], useOllama: boolean = false, ollamaModel?: string, ollamaUrl?: string) {
    this.useOllama = useOllama
    
    if (useOllama) {
      this.ollamaUrl = ollamaUrl || "http://localhost:11434"
      this.ollamaModel = ollamaModel || "gemma:latest" // Default fallback
      console.log(`[LLMHelper] Using Ollama with model: ${this.ollamaModel}`)
      
      // Auto-detect and use first available model if specified model doesn't exist
      this.initializeOllamaModel()
    } else if (apiKey) {
      this.geminiKeys = Array.isArray(apiKey) ? apiKey.filter(Boolean) : [apiKey]
      if (this.geminiKeys.length === 0) {
        throw new Error("No Gemini API keys provided")
      }
      // Pre-create model for the first key
      const first = this.getNextGeminiModel(true)
      this.model = first
      console.log(`[LLMHelper] Using Google Gemini with ${this.geminiKeys.length} key(s) (round-robin)`)    
    } else {
      throw new Error("Either provide Gemini API key or enable Ollama mode")
    }

    // Initialize optional OpenAI keys for transcription (and future chat)
    const openaiEnvKeys: string[] = []
    const combined = (process.env.OPENAI_API_KEYS || "")
      .split(/[\s,]+/)
      .map(s => s.trim())
      .filter(Boolean)
    openaiEnvKeys.push(...combined)
    const single = process.env.OPENAI_API_KEY
    if (single) openaiEnvKeys.push(single)
    for (let i = 1; i <= 10; i++) {
      const v = process.env[`OPENAI_API_KEY_${i}`]
      if (v) openaiEnvKeys.push(v)
    }
    const seen = new Set<string>()
    this.openaiKeys = openaiEnvKeys.filter(k => (seen.has(k) ? false : (seen.add(k), true)))
  }

  private getModelForKey(key: string): GenerativeModel {
    const cached = this.modelCache.get(key)
    if (cached) return cached
    const genAI = new GoogleGenerativeAI(key)
    const mdl = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })
    this.modelCache.set(key, mdl)
    return mdl
  }

  private getNextGeminiModel(initial: boolean = false): GenerativeModel {
    if (this.geminiKeys.length === 0) {
      if (this.model) return this.model
      throw new Error("Gemini not configured")
    }
    if (initial && this.keyIndex === -1) {
      this.keyIndex = 0
    } else {
      this.keyIndex = (this.keyIndex + 1) % this.geminiKeys.length
    }
    const key = this.geminiKeys[this.keyIndex]
    return this.getModelForKey(key)
  }

  private shouldRotateOnError(err: any): boolean {
    const msg = String(err?.message || err)
    return /429|Too\s*Many\s*Requests|Resource\s*exhausted/i.test(msg)
  }

  private async withGeminiRetry<T>(op: (m: GenerativeModel) => Promise<T>): Promise<T> {
    if (this.useOllama) throw new Error("Gemini not active")
    const attempts = Math.max(1, this.geminiKeys.length)
    let lastErr: any
    for (let i = 0; i < attempts; i++) {
      const model = this.getNextGeminiModel(i === 0)
      try {
        return await op(model)
      } catch (err) {
        lastErr = err
        if (this.geminiKeys.length > 1 && this.shouldRotateOnError(err)) {
          // try next key
          continue
        }
        break
      }
    }
    throw lastErr
  }

  private getNextOpenAIKey(initial: boolean = false): string {
    if (this.openaiKeys.length === 0) {
      throw new Error("OpenAI not configured")
    }
    if (initial && this.openaiKeyIndex === -1) {
      this.openaiKeyIndex = 0
    } else {
      this.openaiKeyIndex = (this.openaiKeyIndex + 1) % this.openaiKeys.length
    }
    return this.openaiKeys[this.openaiKeyIndex]
  }

  private shouldUseOpenAITranscribe(): boolean {
    const provider = (process.env.TRANSCRIBE_PROVIDER || "").toLowerCase()
    const flag = String(process.env.USE_OPENAI_TRANSCRIBE || "").toLowerCase()
    return provider === "openai" || flag === "true" || this.openaiKeys.length > 0
  }

  private async transcribeWithOpenAI(buffer: Buffer, mimeType: string): Promise<string> {
    if (this.openaiKeys.length === 0) {
      throw new Error("No OpenAI API key(s) found")
    }
    const attempts = Math.max(1, this.openaiKeys.length)
    let lastErr: any
    for (let i = 0; i < attempts; i++) {
      const apiKey = this.getNextOpenAIKey(i === 0)
      try {
        // Use native undici FormData/Blob so fetch sets boundary automatically
        const form = new FormData()
        const baseType = (mimeType || 'audio/webm').split(';')[0]
        const ext = (baseType.split('/')[1] || 'webm').replace(/[^a-z0-9]/gi, '')
        const safeType = baseType || 'audio/webm'
        const bytes: Uint8Array = new Uint8Array(buffer as any)
        const file = new Blob([bytes as any], { type: safeType })
        form.append("file", file, `audio.${ext || 'webm'}`)
        form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1")
        const extraHeaders: Record<string,string> = {}
        if (process.env.OPENAI_ORG_ID) extraHeaders['OpenAI-Organization'] = process.env.OPENAI_ORG_ID
        if (process.env.OPENAI_PROJECT_ID) extraHeaders['OpenAI-Project'] = process.env.OPENAI_PROJECT_ID
        const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, ...extraHeaders },
          body: form
        })
        if (resp.status === 429) {
          lastErr = new Error(`OpenAI 429 rate limited`)
          continue
        }
        if (!resp.ok) {
          const t = await resp.text()
          throw new Error(`OpenAI transcribe failed: ${resp.status} ${t}`)
        }
        const data: any = await resp.json()
        return String(data.text || "")
      } catch (err) {
        lastErr = err
        continue
      }
    }
    throw lastErr
  }

  private async fileToGenerativePart(imagePath: string) {
    const imageData = await fs.promises.readFile(imagePath)
    return {
      inlineData: {
        data: imageData.toString("base64"),
        mimeType: "image/png"
      }
    }
  }

  private cleanJsonResponse(text: string): string {
    // Remove markdown code block syntax if present
    text = text.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');
    // Remove any leading/trailing whitespace
    text = text.trim();
    return text;
  }

  private async callOllama(prompt: string): Promise<string> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.ollamaModel,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
          }
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
      }

      const data: OllamaResponse = await response.json()
      return data.response
    } catch (error) {
      console.error("[LLMHelper] Error calling Ollama:", error)
      throw new Error(`Failed to connect to Ollama: ${error.message}. Make sure Ollama is running on ${this.ollamaUrl}`)
    }
  }

  private async checkOllamaAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`)
      return response.ok
    } catch {
      return false
    }
  }

  private async initializeOllamaModel(): Promise<void> {
    try {
      const availableModels = await this.getOllamaModels()
      if (availableModels.length === 0) {
        console.warn("[LLMHelper] No Ollama models found")
        return
      }

      // Check if current model exists, if not use the first available
      if (!availableModels.includes(this.ollamaModel)) {
        this.ollamaModel = availableModels[0]
        console.log(`[LLMHelper] Auto-selected first available model: ${this.ollamaModel}`)
      }

      // Test the selected model works
      const testResult = await this.callOllama("Hello")
      console.log(`[LLMHelper] Successfully initialized with model: ${this.ollamaModel}`)
    } catch (error) {
      console.error(`[LLMHelper] Failed to initialize Ollama model: ${error.message}`)
      // Try to use first available model as fallback
      try {
        const models = await this.getOllamaModels()
        if (models.length > 0) {
          this.ollamaModel = models[0]
          console.log(`[LLMHelper] Fallback to: ${this.ollamaModel}`)
        }
      } catch (fallbackError) {
        console.error(`[LLMHelper] Fallback also failed: ${fallbackError.message}`)
      }
    }
  }

  public async extractProblemFromImages(imagePaths: string[]) {
    try {
      const imageParts = await Promise.all(imagePaths.map(path => this.fileToGenerativePart(path)))
      
      const prompt = `${this.systemPrompt}\n\nYou are a wingman. Please analyze these images and extract the following information in JSON format:\n{
  "problem_statement": "A clear statement of the problem or situation depicted in the images.",
  "context": "Relevant background or context from the images.",
  "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
  "reasoning": "Explanation of why these suggestions are appropriate."
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

      const result = await this.withGeminiRetry(m => m.generateContent([prompt, ...imageParts]))
      const response = await result.response
      const text = this.cleanJsonResponse(response.text())
      return JSON.parse(text)
    } catch (error) {
      console.error("Error extracting problem from images:", error)
      throw error
    }
  }

  public async generateSolution(problemInfo: any) {
    const prompt = `${this.systemPrompt}\n\nGiven this problem or situation:\n${JSON.stringify(problemInfo, null, 2)}\n\nPlease provide your response in the following JSON format:\n{
  "solution": {
    "code": "The code or main answer here.",
    "problem_statement": "Restate the problem or situation.",
    "context": "Relevant background/context.",
    "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
    "reasoning": "Explanation of why these suggestions are appropriate."
  }
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

    console.log("[LLMHelper] Calling Gemini LLM for solution...");
    try {
      const result = await this.withGeminiRetry(m => m.generateContent(prompt))
      console.log("[LLMHelper] Gemini LLM returned result.");
      const response = await result.response
      const text = this.cleanJsonResponse(response.text())
      const parsed = JSON.parse(text)
      console.log("[LLMHelper] Parsed LLM response:", parsed)
      return parsed
    } catch (error) {
      console.error("[LLMHelper] Error in generateSolution:", error);
      throw error;
    }
  }

  public async debugSolutionWithImages(problemInfo: any, currentCode: string, debugImagePaths: string[]) {
    try {
      const imageParts = await Promise.all(debugImagePaths.map(path => this.fileToGenerativePart(path)))
      
      const prompt = `${this.systemPrompt}\n\nYou are a wingman. Given:\n1. The original problem or situation: ${JSON.stringify(problemInfo, null, 2)}\n2. The current response or approach: ${currentCode}\n3. The debug information in the provided images\n\nPlease analyze the debug information and provide feedback in this JSON format:\n{
  "solution": {
    "code": "The code or main answer here.",
    "problem_statement": "Restate the problem or situation.",
    "context": "Relevant background/context.",
    "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
    "reasoning": "Explanation of why these suggestions are appropriate."
  }
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

      const result = await this.withGeminiRetry(m => m.generateContent([prompt, ...imageParts]))
      const response = await result.response
      const text = this.cleanJsonResponse(response.text())
      const parsed = JSON.parse(text)
      console.log("[LLMHelper] Parsed debug LLM response:", parsed)
      return parsed
    } catch (error) {
      console.error("Error debugging solution with images:", error)
      throw error
    }
  }

  public async analyzeAudioFile(audioPath: string) {
    try {
      const audioData = await fs.promises.readFile(audioPath);
      const mimeType = audioPath.endsWith('.wav') ? 'audio/wav' : audioPath.endsWith('.mp3') ? 'audio/mpeg' : 'audio/webm'
      if (this.shouldUseOpenAITranscribe()) {
        const text = await this.transcribeWithOpenAI(audioData, mimeType)
        return { text, timestamp: Date.now() }
      }
      const audioPart = {
        inlineData: {
          data: audioData.toString("base64"),
          mimeType
        }
      };
      // Step 1: get transcript only
      const transcriptPrompt = `Транскрибируй речь точно. Верни ТОЛЬКО текст вопроса/реплики пользователя без пояснений.`;
      const trResult = await this.withGeminiRetry(m => m.generateContent([transcriptPrompt, audioPart]));
      const trText = (await trResult.response).text();
      return { text: trText, timestamp: Date.now() };
    } catch (error) {
      console.error("Error analyzing audio file:", error);
      throw error;
    }
  }

  public async analyzeAudioFromBase64(data: string, mimeType: string) {
    try {
      if (this.shouldUseOpenAITranscribe()) {
        const buffer = Buffer.from(data, 'base64')
        const text = await this.transcribeWithOpenAI(buffer, mimeType || 'audio/webm')
        return { text, timestamp: Date.now() }
      }
      const audioPart = {
        inlineData: {
          data,
          mimeType
        }
      };
      // Step 1: get transcript only
      const transcriptPrompt = `Транскрибируй речь точно. Верни ТОЛЬКО текст вопроса/реплики пользователя без пояснений.`;
      const trResult = await this.withGeminiRetry(m => m.generateContent([transcriptPrompt, audioPart]));
      const trText = (await trResult.response).text();
      return { text: trText, timestamp: Date.now() };
    } catch (error) {
      console.error("Error analyzing audio from base64:", error);
      throw error;
    }
  }

  public async analyzeImageFile(imagePath: string) {
    try {
      const imageData = await fs.promises.readFile(imagePath);
      const imagePart = {
        inlineData: {
          data: imageData.toString("base64"),
          mimeType: "image/png"
        }
      };
      const prompt = `${this.systemPrompt}\n\nDescribe the content of this image in a short, concise answer. In addition to your main answer, suggest several possible actions or responses the user could take next based on the image. Do not return a structured JSON object, just answer naturally as you would to a user. Be concise and brief.`;
      const result = await this.withGeminiRetry(m => m.generateContent([prompt, imagePart]));
      const response = await result.response;
      const text = response.text();
      return { text, timestamp: Date.now() };
    } catch (error) {
      console.error("Error analyzing image file:", error);
      throw error;
    }
  }

  public async chatWithGemini(message: string): Promise<string> {
    try {
      const composedPrompt = `${this.systemPrompt}\n\n${message}`;
      if (this.useOllama) {
        return this.callOllama(composedPrompt);
      } else if (this.geminiKeys.length > 0 || this.model) {
        try {
          const result = await this.withGeminiRetry(m => m.generateContent(composedPrompt));
          const response = await result.response;
          return response.text();
        } catch (err: any) {
          const msg = String(err?.message || err);
          // Region restriction fallback
          if (msg.includes("User location is not supported")) {
            console.warn("[LLMHelper] Gemini blocked by region; attempting Ollama fallback...");
            try {
              const available = await this.checkOllamaAvailable();
              if (!available) {
                throw new Error(
                  "Gemini недоступен в вашем регионе. Запустите Ollama (ollama serve) и установите модель: 'ollama pull llama3.2', затем попробуйте снова."
                );
              }
              // Ensure model exists
              const models = await this.getOllamaModels();
              if (models.length > 0 && !models.includes(this.ollamaModel)) {
                this.ollamaModel = models[0];
              }
              this.useOllama = true;
              return await this.callOllama(composedPrompt);
            } catch (fallbackError: any) {
              throw fallbackError;
            }
          }
          throw err;
        }
      } else {
        throw new Error("No LLM provider configured");
      }
    } catch (error) {
      console.error("[LLMHelper] Error in chatWithGemini:", error);
      throw error;
    }
  }

  public async chat(message: string): Promise<string> {
    if (this.useOllama) return this.callOllama(`${this.systemPrompt}\n\n${message}`)
    if (this.useOpenAI) return this.chatWithOpenAI(message)
    return this.chatWithGemini(message);
  }

  public isUsingOllama(): boolean {
    return this.useOllama;
  }

  public async getOllamaModels(): Promise<string[]> {
    if (!this.useOllama) return [];
    
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`);
      if (!response.ok) throw new Error('Failed to fetch models');
      
      const data = await response.json();
      return data.models?.map((model: any) => model.name) || [];
    } catch (error) {
      console.error("[LLMHelper] Error fetching Ollama models:", error);
      return [];
    }
  }

  public getCurrentProvider(): "ollama" | "gemini" | "openai" {
    return this.useOllama ? "ollama" : (this.useOpenAI ? "openai" : "gemini");
  }

  public getCurrentModel(): string {
    if (this.useOllama) return this.ollamaModel
    if (this.useOpenAI) return this.openaiModel
    return "gemini-2.0-flash";
  }

  public async switchToOllama(model?: string, url?: string): Promise<void> {
    this.useOllama = true;
    this.useOpenAI = false;
    if (url) this.ollamaUrl = url;
    
    if (model) {
      this.ollamaModel = model;
    } else {
      // Auto-detect first available model
      await this.initializeOllamaModel();
    }
    
    console.log(`[LLMHelper] Switched to Ollama: ${this.ollamaModel} at ${this.ollamaUrl}`);
  }

  public async switchToGemini(apiKey?: string): Promise<void> {
    if (apiKey) {
      // Switch to a single provided key
      this.geminiKeys = [apiKey]
      this.keyIndex = -1
      this.modelCache.clear()
      this.model = this.getNextGeminiModel(true)
    }

    if (this.geminiKeys.length === 0 && !this.model) {
      throw new Error("No Gemini API key provided and no existing model instance")
    }

    this.useOllama = false
    this.useOpenAI = false
    console.log("[LLMHelper] Switched to Gemini")
  }

  public async switchToOpenAI(apiKey?: string, model?: string): Promise<void> {
    if (apiKey) {
      this.openaiKeys = [apiKey]
      this.openaiKeyIndex = -1
    }
    if (model) this.openaiModel = model
    if (this.openaiKeys.length === 0) {
      // Try to read from env if not provided explicitly
      const keys: string[] = []
      const combined = (process.env.OPENAI_API_KEYS || "").split(/[\s,]+/).map(s=>s.trim()).filter(Boolean)
      keys.push(...combined)
      if (process.env.OPENAI_API_KEY) keys.push(process.env.OPENAI_API_KEY)
      for (let i=1;i<=10;i++){ const v=(process.env as any)[`OPENAI_API_KEY_${i}`]; if (v) keys.push(v) }
      this.openaiKeys = Array.from(new Set(keys))
    }
    if (this.openaiKeys.length === 0) throw new Error("No OpenAI API key(s) configured")
    this.useOllama = false
    this.useOpenAI = true
    console.log(`[LLMHelper] Switched to OpenAI (${this.openaiModel})`)
  }

  private async chatWithOpenAI(message: string): Promise<string> {
    const attempts = Math.max(1, this.openaiKeys.length)
    let lastErr: any
    for (let i = 0; i < attempts; i++) {
      const apiKey = this.getNextOpenAIKey(i === 0)
      try {
        const extraHeaders: Record<string,string> = {}
        if (process.env.OPENAI_ORG_ID) extraHeaders['OpenAI-Organization'] = process.env.OPENAI_ORG_ID
        if (process.env.OPENAI_PROJECT_ID) extraHeaders['OpenAI-Project'] = process.env.OPENAI_PROJECT_ID
        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            ...extraHeaders
          },
          body: JSON.stringify({
            model: this.openaiModel,
            messages: [
              { role: 'system', content: this.systemPrompt },
              { role: 'user', content: message }
            ],
            temperature: 0.7
          })
        })
        if (resp.status === 429) { lastErr = new Error('OpenAI rate limited'); continue }
        if (!resp.ok) {
          const t = await resp.text()
          throw new Error(`OpenAI chat failed: ${resp.status} ${t}`)
        }
        const data: any = await resp.json()
        const text = data.choices?.[0]?.message?.content || ''
        return String(text)
      } catch (err) { lastErr = err; continue }
    }
    throw lastErr
  }

  public async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.useOllama) {
        const available = await this.checkOllamaAvailable();
        if (!available) {
          return { success: false, error: `Ollama not available at ${this.ollamaUrl}` };
        }
        // Test with a simple prompt
        await this.callOllama("Hello");
        return { success: true };
      } else {
        if (this.geminiKeys.length === 0 && !this.model) {
          // If OpenAI is active, test it instead
          if (this.useOpenAI && this.openaiKeys.length > 0) {
            try {
              const txt = await this.chatWithOpenAI("Hello")
              return { success: !!txt }
            } catch (e: any) {
              return { success: false, error: e.message }
            }
          }
          return { success: false, error: "No Gemini model configured" };
        }
        // Test with a simple prompt
        const result = await this.withGeminiRetry(m => m.generateContent("Hello"));
        const response = await result.response;
        const text = response.text(); // Ensure the response is valid
        if (text) {
          return { success: true };
        } else {
          return { success: false, error: "Empty response from Gemini" };
        }
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
} 