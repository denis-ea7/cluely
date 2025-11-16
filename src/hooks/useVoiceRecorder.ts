import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type RecorderResult = {
  text: string
  timestamp?: number
  isResponse?: boolean
  transcript?: string
}

interface UseVoiceRecorderOptions {
  onResult: (data: RecorderResult) => void
  getChatHistory?: () => string | undefined | null
}

const STORAGE_KEY = "voiceRecorderInputId"

interface VadState {
  level: number
  silentStart: number
  lastVoice: number
  buffered: Blob[]
  recordingStart: number
}

const createInitialVadState = (): VadState => ({
  level: 0,
  silentStart: 0,
  lastVoice: 0,
  buffered: [],
  recordingStart: 0
})

export const useVoiceRecorder = ({ onResult, getChatHistory }: UseVoiceRecorderOptions) => {
  const [isRecording, setIsRecording] = useState(false)
  const [inputLevel, setInputLevel] = useState(0)
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("")
  const [error, setError] = useState<string | null>(null)

  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recordingActiveRef = useRef(false)
  const vadStateRef = useRef<VadState>(createInitialVadState())
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)
  const vadIntervalRef = useRef<number | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const transcriptionCleanupRef = useRef<(() => void) | null>(null)

  const persistDeviceId = useCallback((id: string) => {
    try {
      if (id) {
        localStorage.setItem(STORAGE_KEY, id)
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      
    }
  }, [])

  const loadSavedDeviceId = useCallback(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || ""
    } catch {
      return ""
    }
  }, [])

  useEffect(() => {
    if (!selectedDeviceId) return
    persistDeviceId(selectedDeviceId)
  }, [selectedDeviceId, persistDeviceId])

  const resetStream = useCallback(() => {
    if (vadIntervalRef.current) {
      console.log("[VoiceRecorder] resetStream: clearing vadInterval")
      window.clearInterval(vadIntervalRef.current)
      vadIntervalRef.current = null
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close()
      } catch {
        
      }
      audioContextRef.current = null
    }
    try {
      (processorRef.current as any)?.disconnect?.()
    } catch {}
    processorRef.current = null as any
    if (transcriptionCleanupRef.current) {
      transcriptionCleanupRef.current()
      transcriptionCleanupRef.current = null
    }
    
    if ((window as any)?.electronAPI?.stopTranscriptionStream) {
      ;(window as any).electronAPI.stopTranscriptionStream().catch(() => {})
    }
    analyserRef.current = null
    vadStateRef.current = createInitialVadState()
    setInputLevel(0)
  }, [])

  
  const sendPcmChunk = useCallback(async (audioData: Float32Array, sampleRate: number) => {
    try {
      
      const dstRate = 16000
      const ratio = sampleRate / dstRate
      const outLen = Math.max(1, Math.floor(audioData.length / ratio))
      const resampled = new Float32Array(outLen)
      for (let i = 0; i < outLen; i++) {
        const s = i * ratio
        const i0 = Math.floor(s)
        const i1 = Math.min(i0 + 1, audioData.length - 1)
        const t = s - i0
        resampled[i] = audioData[i0] * (1 - t) + audioData[i1] * t
      }
      
      const pcm = new Int16Array(resampled.length)
      for (let i = 0; i < resampled.length; i++) {
        const x = Math.max(-1, Math.min(1, resampled[i]))
        pcm[i] = x < 0 ? x * 0x8000 : x * 0x7fff
      }
      
      const bytes = new Uint8Array(pcm.buffer)
      let binary = ""
      const CHUNK = 0x8000
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[])
      }
      const base64 = btoa(binary)
      
      if ((window as any)?.electronAPI?.sendTranscriptionChunk) {
        await (window as any).electronAPI.sendTranscriptionChunk(base64)
      }
    } catch (err) {
      console.error("[VoiceRecorder] sendPcmChunk error:", err)
    }
  }, [])

  const refreshDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      
    }
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      const inputs = list.filter((d) => d.kind === "audioinput")
      setAudioDevices(inputs)
      if (!inputs.length) {
        setSelectedDeviceId("")
        return
      }
      if (!selectedDeviceId) {
        const saved = loadSavedDeviceId()
        const fromSaved = inputs.find((d) => d.deviceId === saved)
        const fallback = inputs.find((d) => d.deviceId === "default") || inputs[0]
        setSelectedDeviceId(fromSaved ? fromSaved.deviceId : fallback?.deviceId || inputs[0].deviceId)
      } else {
        const exists = inputs.some((d) => d.deviceId === selectedDeviceId)
        if (!exists) {
          const fallback = inputs.find((d) => d.deviceId === "default") || inputs[0]
          setSelectedDeviceId(fallback?.deviceId || "")
        }
      }
    } catch (err) {
      console.error("[VoiceRecorder] enumerate devices failed:", err)
    }
  }, [loadSavedDeviceId, selectedDeviceId])

  useEffect(() => {
    refreshDevices()
    const handler = () => refreshDevices()
    navigator.mediaDevices?.addEventListener?.("devicechange", handler)
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", handler)
    }
  }, [refreshDevices])

  const startLevelTracking = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) return
    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    const tick = () => {
      if (!recordingActiveRef.current) return
      analyser.getByteTimeDomainData(dataArray)
      let sum = 0
      for (let i = 0; i < dataArray.length; i += 1) {
        const value = (dataArray[i] - 128) / 128
        sum += value * value
      }
      const rms = Math.sqrt(sum / dataArray.length)
      setInputLevel(rms)
      vadStateRef.current.level = rms
      const now = Date.now()
      if (rms > 0.02) {
        vadStateRef.current.lastVoice = now
        vadStateRef.current.silentStart = 0
      } else if (!vadStateRef.current.silentStart) {
        vadStateRef.current.silentStart = now
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const startRecording = useCallback(async () => {
    if (isRecording) return
    if (typeof navigator === "undefined" || !(navigator.mediaDevices?.getUserMedia)) {
      setError("Микрофон не поддерживается в этой среде.")
      return
    }
    setError(null)
    try {
      const constraints: MediaStreamConstraints =
        selectedDeviceId && selectedDeviceId !== "default"
          ? {
              audio: {
                deviceId: { exact: selectedDeviceId } as any,
                echoCancellation: false as any,
                noiseSuppression: false as any,
                autoGainControl: false as any,
                channelCount: 2 as any
              }
            }
          : { audio: true }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      mediaStreamRef.current = stream
      recordingActiveRef.current = true
      setIsRecording(true)
      
      try {
        const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined
        if (AudioCtx) {
          
          const ctx = new AudioCtx({ sampleRate: 16000 } as any)
          audioContextRef.current = ctx
          const source = ctx.createMediaStreamSource(stream)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 512
          source.connect(analyser)
          analyserRef.current = analyser
          
          const bufferSize = 4096
          const processor = ctx.createScriptProcessor(bufferSize, 1, 1)
          processor.onaudioprocess = (e: AudioProcessingEvent) => {
            if (!recordingActiveRef.current) return
            const ch0 = e.inputBuffer.getChannelData(0)
            
            let mono: Float32Array
            if (e.inputBuffer.numberOfChannels > 1) {
              const ch1 = e.inputBuffer.getChannelData(1)
              mono = new Float32Array(ch0.length)
              for (let i = 0; i < ch0.length; i++) {
                mono[i] = (ch0[i] + ch1[i]) / 2
              }
            } else {
              mono = new Float32Array(ch0)
            }
            
            sendPcmChunk(mono, ctx.sampleRate).catch((err) => {
              console.error("[VoiceRecorder] sendPcmChunk failed:", err)
            })
          }
          source.connect(processor)
          processor.connect(ctx.destination) 
          processorRef.current = processor as any
          startLevelTracking()
        }
      } catch (err) {
        console.warn("[VoiceRecorder] audio context init failed:", err)
      }
      vadStateRef.current = createInitialVadState()
      
      
      if ((window as any)?.electronAPI?.startTranscriptionStream) {
        await (window as any).electronAPI.startTranscriptionStream()
        
        if ((window as any)?.electronAPI?.onTranscriptionInterim) {
          const cleanup = (window as any).electronAPI.onTranscriptionInterim((data: { text: string }) => {
            if (data?.text) {
              onResult({ text: data.text, timestamp: Date.now(), isResponse: false })
            }
          })
          transcriptionCleanupRef.current = cleanup
        }
        
        if ((window as any)?.electronAPI?.onTranscriptionError) {
          (window as any).electronAPI.onTranscriptionError((data: { error: string }) => {
            console.error("[VoiceRecorder] transcription error:", data.error)
            setError(data.error)
          })
        }
      }
      
      vadIntervalRef.current = window.setInterval(() => {
        if (!recordingActiveRef.current) return
        const { silentStart, lastVoice, recordingStart } = vadStateRef.current
        if (silentStart && lastVoice > recordingStart) {
          const silentDuration = Date.now() - silentStart
          const recordingDuration = Date.now() - recordingStart
          
          if (silentDuration > 1500 && recordingDuration > 300) {
            vadStateRef.current.silentStart = 0
          }
        }
      }, 160)
    } catch (err) {
      console.error("[VoiceRecorder] start error:", err)
      setError(err instanceof Error ? err.message : String(err))
      recordingActiveRef.current = false
      resetStream()
      setIsRecording(false)
      throw err
    }
  }, [isRecording, resetStream, selectedDeviceId, sendPcmChunk, startLevelTracking, onResult])

  const stopRecording = useCallback(() => {
    recordingActiveRef.current = false
    resetStream()
    setIsRecording(false)
  }, [resetStream])

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      stopRecording()
      return
    }
    await startRecording()
  }, [isRecording, startRecording, stopRecording])

  useEffect(() => {
    return () => {
      recordingActiveRef.current = false
      resetStream()
    }
  }, [resetStream])

  const deviceMap = useMemo(
    () =>
      audioDevices.map((device) => ({
        deviceId: device.deviceId,
        label: device.label || "Микрофон"
      })),
    [audioDevices]
  )

  return {
    isRecording,
    inputLevel,
    devices: deviceMap,
    selectedDeviceId,
    setSelectedDeviceId,
    refreshDevices,
    startRecording,
    stopRecording,
    toggleRecording,
    error
  }
}

export type UseVoiceRecorderReturn = ReturnType<typeof useVoiceRecorder>


