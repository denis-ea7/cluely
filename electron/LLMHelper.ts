import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai"
import fs from "fs"
import { PrimaryAI, PrimaryAIConfig } from "./PrimaryAI"

interface OllamaResponse {
  response: string
  done: boolean
}

export class LLMHelper {
  private model: GenerativeModel | null = null
  private geminiKeys: string[] = []
  private keyIndex: number = -1
  private modelCache: Map<string, GenerativeModel> = new Map()
  private audioModelCache: Map<string, GenerativeModel> = new Map()
  private audioModelNames: string[] = ["gemini-1.5-flash", "gemini-1.5-flash-8b"]
  private audioModelIndex: number = 0
  private primary: PrimaryAI | null = null
  private readonly systemPrompt = `Ты Wingman AI — полезный, проактивный помощник для любых задач (не только кодинг). Отвечай кратко и по делу. Если запрос подразумевает перечисление (напр. "какие типы данных в JavaScript"), верни только список пунктов, без вводных и пояснений. По умолчанию отвечай на русском языке. Если требуется вернуть JSON, строго следуй формату из запроса: ключи и структура — на английском, как в инструкции; значения-тексты — на русском. Если пользователь пишет на другом языке, всё равно отвечай на русском, пока явно не попросят иначе.`
  private useOllama: boolean = false
  private ollamaModel: string = "llama3.2"
  private ollamaUrl: string = "http://localhost:11434"

  constructor(apiKey?: string | string[], useOllama: boolean = false, ollamaModel?: string, ollamaUrl?: string, primaryConfig?: PrimaryAIConfig) {
    this.useOllama = useOllama
    
    if (useOllama) {
      this.ollamaUrl = ollamaUrl || "http://localhost:11434"
      this.ollamaModel = ollamaModel || "gemma:latest" 
      console.log(`[LLMHelper] Using Ollama with model: ${this.ollamaModel}`)
      
      this.initializeOllamaModel()
    } else if (apiKey) {
      this.geminiKeys = Array.isArray(apiKey) ? apiKey.filter(Boolean) : [apiKey]
      if (this.geminiKeys.length === 0) {
        throw new Error("No Gemini API keys provided")
      }
      const first = this.getNextGeminiModel(true)
      this.model = first
      console.log(`[LLMHelper] Using Google Gemini with ${this.geminiKeys.length} key(s) (round-robin)`)    
    } else {
      throw new Error("Either provide Gemini API key or enable Ollama mode")
    }

    if (primaryConfig?.token && primaryConfig?.wsUrl && primaryConfig?.chatUrl) {
      try {
        this.primary = new PrimaryAI(primaryConfig)
        console.log("[LLMHelper] PrimaryAI configured as main provider (transcription + chat)")
      } catch (e) {
        console.warn("[LLMHelper] Failed to init PrimaryAI:", (e as any)?.message || e)
        this.primary = null
      }
    }
  }

  private getModelForKey(key: string): GenerativeModel {
    const cached = this.modelCache.get(key)
    if (cached) return cached
    const genAI = new GoogleGenerativeAI(key)
    const mdl = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })
    this.modelCache.set(key, mdl)
    return mdl
  }

  private getAudioModelForKey(key: string, modelName: string): GenerativeModel {
    const cacheKey = `${key}|${modelName}`
    const cached = this.audioModelCache.get(cacheKey)
    if (cached) return cached
    const genAI = new GoogleGenerativeAI(key)
    const mdl = genAI.getGenerativeModel({ model: modelName })
    this.audioModelCache.set(cacheKey, mdl)
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

  private getNextGeminiAudioModel(initial: boolean = false): { model: GenerativeModel; modelName: string } {
    if (this.geminiKeys.length === 0) {
      if (this.model) return { model: this.model, modelName: "gemini-2.0-flash" }
      throw new Error("Gemini not configured")
    }
    if (initial && this.keyIndex === -1) {
      this.keyIndex = 0
    } else {
      this.keyIndex = (this.keyIndex + 1) % this.geminiKeys.length
    }
    const key = this.geminiKeys[this.keyIndex]
    const name = this.audioModelNames[this.audioModelIndex % this.audioModelNames.length]
    return { model: this.getAudioModelForKey(key, name), modelName: name }
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
          continue
        }
        break
      }
    }
    throw lastErr
  }

  private shouldRotateAudioModelOnError(err: any): boolean {
    const msg = String(err?.message || err)
    return /not\s*found|not\s*supported|404/i.test(msg)
  }

  private async withGeminiRetryAudio<T>(op: (m: GenerativeModel) => Promise<T>): Promise<T> {
    if (this.useOllama) throw new Error("Gemini not active")
    const attempts = Math.max(1, this.geminiKeys.length * this.audioModelNames.length)
    let lastErr: any
    for (let i = 0; i < attempts; i++) {
      const { model, modelName } = this.getNextGeminiAudioModel(i === 0)
      try {
        return await op(model)
      } catch (err) {
        lastErr = err
        if (this.shouldRotateAudioModelOnError(err)) {
          this.audioModelIndex = (this.audioModelIndex + 1) % this.audioModelNames.length
          continue
        } else if (this.geminiKeys.length > 1 && this.shouldRotateOnError(err)) {
          continue
        }
        
        break
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
    text = text.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');
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

      if (!availableModels.includes(this.ollamaModel)) {
        this.ollamaModel = availableModels[0]
        console.log(`[LLMHelper] Auto-selected first available model: ${this.ollamaModel}`)
      }

      const testResult = await this.callOllama("Hello")
      console.log(`[LLMHelper] Successfully initialized with model: ${this.ollamaModel}`)
    } catch (error) {
      console.error(`[LLMHelper] Failed to initialize Ollama model: ${error.message}`)
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
      if (this.primary && /\.wav$/i.test(audioPath)) {
        try {
          const text = await this.primary.transcribeWavPcm16File(audioPath)
          return { text, timestamp: Date.now() }
        } catch (e) {
          console.warn("[LLMHelper] PrimaryAI WAV transcription failed, falling back to Gemini:", (e as any)?.message || e)
        }
      }

      const audioData = await fs.promises.readFile(audioPath);
      const guessedMime: string = (() => {
        const lower = audioPath.toLowerCase()
        if (lower.endsWith(".wav")) return "audio/wav"
        if (lower.endsWith(".mp3")) return "audio/mpeg"
        if (lower.endsWith(".ogg")) return "audio/ogg"
        if (lower.endsWith(".webm")) return "audio/webm"
        return "audio/webm"
      })()
      const audioPart = {
        inlineData: {
          data: audioData.toString("base64"),
          mimeType: guessedMime
        }
      };
      const transcriptPrompt = `Транскрибируй речь точно. Верни ТОЛЬКО текст вопроса/реплики пользователя без пояснений.`;
      const trResult = await this.withGeminiRetryAudio(m => m.generateContent([transcriptPrompt, audioPart]));
      const trText = (await trResult.response).text();
      return { text: trText, timestamp: Date.now() };
    } catch (error) {
      console.error("Error analyzing audio file:", error);
      throw error;
    }
  }

  public async analyzeAudioFromBase64(data: string, mimeType: string, chatHistory?: string) {
    try {
      const mt = (() => {
        if (!mimeType) return "audio/webm"
        const lower = String(mimeType).toLowerCase()
        if (lower.startsWith("audio/webm")) return "audio/webm"
        if (lower.startsWith("audio/ogg")) return "audio/ogg"
        if (lower.startsWith("audio/mp3")) return "audio/mpeg"
        if (lower.startsWith("audio/mpeg")) return "audio/mpeg"
        if (lower.startsWith("audio/wav")) return "audio/wav"
        if (lower.startsWith("audio/x-wav")) return "audio/wav"
        return "audio/webm"
      })();
      const audioPart = {
        inlineData: {
          data,
          mimeType: mt
        }
      };
      
      if (chatHistory) {
        const transcriptPrompt = `Транскрибируй речь точно. Верни ТОЛЬКО текст вопроса/реплики пользователя без пояснений.`;
        const trResult = await this.withGeminiRetryAudio(m => m.generateContent([transcriptPrompt, audioPart]));
        const trText = (await trResult.response).text();
        
        const fullHistory = `${chatHistory}\nUser: ${trText}`;
        const prompt = `${this.systemPrompt}\n\nКонтекст диалога:\n${fullHistory}\n\nОтветь на последний запрос пользователя, учитывая контекст.`;
        const result = await this.withGeminiRetry(m => m.generateContent(prompt));
        const responseText = (await result.response).text();
        
        return { 
          text: responseText, 
          transcript: trText,
          timestamp: Date.now(), 
          isResponse: true 
        };
      } else {
        const transcriptPrompt = `Транскрибируй речь точно. Верни ТОЛЬКО текст вопроса/реплики пользователя без пояснений.`;
        const trResult = await this.withGeminiRetryAudio(m => m.generateContent([transcriptPrompt, audioPart]));
        const trText = (await trResult.response).text();
        return { text: trText, timestamp: Date.now(), isResponse: false };
      }
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

  public async transcribePcm16Base64(pcmBase64: string, sampleRateHertz: number = 16000): Promise<{ text: string; timestamp: number }> {
    if (!this.primary) {
      throw new Error("PrimaryAI is not configured for PCM16 transcription")
    }
    const buf = Buffer.from(pcmBase64, "base64")
    const text = await this.primary.transcribePcm16Buffer(buf, sampleRateHertz)
    return { text, timestamp: Date.now() }
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
          if (msg.includes("User location is not supported")) {
            console.warn("[LLMHelper] Gemini blocked by region; attempting Ollama fallback...");
            try {
              const available = await this.checkOllamaAvailable();
              if (!available) {
                throw new Error(
                  "Gemini недоступен в вашем регионе. Запустите Ollama (ollama serve) и установите модель: 'ollama pull llama3.2', затем попробуйте снова."
                );
              }
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
    if (this.primary) {
      try {
        return await this.primary.chat(message)
      } catch (e) {
        console.warn("[LLMHelper] PrimaryAI chat failed, falling back:", (e as any)?.message || e)
      }
    }
    return this.chatWithGemini(message);
  }

  public async chatStream(message: string, onDelta: (delta: string) => void): Promise<string> {
    if (this.primary) {
      try {
        return await this.primary.chatStream(message, onDelta)
      } catch (e) {
        console.warn("[LLMHelper] PrimaryAI chatStream failed:", (e as any)?.message || e)
      }
    }
    
    const full = await this.chatWithGemini(message)
    try { onDelta(full) } catch {}
    return full
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

  public getCurrentProvider(): "ollama" | "gemini" {
    return this.useOllama ? "ollama" : "gemini";
  }

  public getCurrentModel(): string {
    return this.useOllama ? this.ollamaModel : "gemini-2.0-flash";
  }

  public async switchToOllama(model?: string, url?: string): Promise<void> {
    this.useOllama = true;
    if (url) this.ollamaUrl = url;
    
    if (model) {
      this.ollamaModel = model;
    } else {
      await this.initializeOllamaModel();
    }
    
    console.log(`[LLMHelper] Switched to Ollama: ${this.ollamaModel} at ${this.ollamaUrl}`);
  }

  public async switchToGemini(apiKey?: string): Promise<void> {
    if (apiKey) {
      this.geminiKeys = [apiKey]
      this.keyIndex = -1
      this.modelCache.clear()
      this.model = this.getNextGeminiModel(true)
    }

    if (this.geminiKeys.length === 0 && !this.model) {
      throw new Error("No Gemini API key provided and no existing model instance")
    }

    this.useOllama = false
    console.log("[LLMHelper] Switched to Gemini")
  }

  public async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.useOllama) {
        const available = await this.checkOllamaAvailable();
        if (!available) {
          return { success: false, error: `Ollama not available at ${this.ollamaUrl}` };
        }
        await this.callOllama("Hello");
        return { success: true };
      } else {
        if (this.geminiKeys.length === 0 && !this.model) {
          return { success: false, error: "No Gemini model configured" };
        }
        const result = await this.withGeminiRetry(m => m.generateContent("Hello"));
        const response = await result.response;
        const text = response.text(); 
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