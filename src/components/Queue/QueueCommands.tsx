import React, { useState, useEffect, useRef } from "react"
import { IoLogOutOutline } from "react-icons/io5"
import { Dialog, DialogContent, DialogClose } from "../ui/dialog"

interface QueueCommandsProps {
  onTooltipVisibilityChange: (visible: boolean, height: number) => void
  screenshots: Array<{ path: string; preview: string }>
  onChatToggle: () => void
  onSettingsToggle: () => void
  onAudioTranscript?: (text: string) => void
  transcribeProvider?: 'gemini'|'openai-whisper'|'openai-realtime'
}

const QueueCommands: React.FC<QueueCommandsProps> = ({
  onTooltipVisibilityChange,
  screenshots,
  onChatToggle,
  onSettingsToggle,
  onAudioTranscript,
  transcribeProvider = 'gemini'
}) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordingActiveRef = useRef<boolean>(false)
  const [audioResult, setAudioResult] = useState<string | null>(null)
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedInputId, setSelectedInputId] = useState<string>('')
  const [inputLevel, setInputLevel] = useState<number>(0)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const chunks = useRef<Blob[]>([])
  const vadState = useRef<{level: number; silentStart: number; lastVoice: number; buffered: Blob[]; recordingStart: number}>({level: 0, silentStart: 0, lastVoice: 0, buffered: [], recordingStart: 0})
  const vadAnalyserRef = useRef<AnalyserNode | null>(null)
  const vadIntervalRef = useRef<number | null>(null)
  // Realtime GPT (WebRTC)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const realtimeActiveRef = useRef<boolean>(false)
  const realtimeBufferRef = useRef<string>("")
  const openaiCfgRef = useRef<{apiKey: string; model: string} | null>(null)
  // Remove all chat-related state, handlers, and the Dialog overlay from this file.

  useEffect(() => {
    let tooltipHeight = 0
    if (tooltipRef.current && isTooltipVisible) {
      tooltipHeight = tooltipRef.current.offsetHeight + 10
    }
    onTooltipVisibilityChange(isTooltipVisible, tooltipHeight)
  }, [isTooltipVisible])

  const handleMouseEnter = () => {
    setIsTooltipVisible(true)
  }

  const handleMouseLeave = () => {
    setIsTooltipVisible(false)
  }

  // Persist selected input
  useEffect(() => {
    if (selectedInputId) {
      try { localStorage.setItem('audioInputId', selectedInputId) } catch {}
    }
  }, [selectedInputId])

  // Enumerate audio input devices
  useEffect(() => {
    let mounted = true
    const loadDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => undefined)
        const list = await navigator.mediaDevices.enumerateDevices()
        const inputs = list.filter(d => d.kind === 'audioinput')
        if (!mounted) return
        setAudioDevices(inputs)
        // Decide default: previously saved → else deviceId 'default' → else first
        if (!selectedInputId) {
          const saved = (() => { try { return localStorage.getItem('audioInputId') || '' } catch { return '' } })()
          const foundSaved = inputs.find(d => d.deviceId === saved)
          const def = inputs.find(d => d.deviceId === 'default') || inputs[0]
          setSelectedInputId(foundSaved ? foundSaved.deviceId : (def?.deviceId || ''))
        }
      } catch (e) {
        // ignore
      }
    }
    loadDevices()
    const onChange = () => loadDevices()
    navigator.mediaDevices.addEventListener?.('devicechange', onChange)
    return () => {
      mounted = false
      navigator.mediaDevices.removeEventListener?.('devicechange', onChange)
    }
  }, [])

  const stopRealtime = () => {
    try { dcRef.current?.close() } catch {}
    try { pcRef.current?.close() } catch {}
    dcRef.current = null
    pcRef.current = null
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null }
    realtimeActiveRef.current = false
  }

  const startRealtime = async () => {
    try {
      const cfg = openaiCfgRef.current || await window.electronAPI.getOpenAIConfig()
      openaiCfgRef.current = cfg
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      const pc = new RTCPeerConnection()
      pcRef.current = pc
      stream.getTracks().forEach(track => pc.addTrack(track, stream))
      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc
      dc.onmessage = (ev) => {
        try {
          const evt = JSON.parse(ev.data)
          if (evt.type === 'transcript.delta' && typeof evt.delta === 'string') {
            realtimeBufferRef.current += evt.delta
          }
          if (evt.type === 'transcript.completed') {
            const text = realtimeBufferRef.current.trim()
            realtimeBufferRef.current = ''
            if (text) onAudioTranscript?.(text)
          }
        } catch {}
      }
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const resp = await fetch(`https://api.openai.com/v1/realtime?model=${encodeURIComponent(cfg.model || 'gpt-4o-realtime-preview-2024-12-17')}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/sdp',
          'OpenAI-Beta': 'realtime=v1'
        },
        body: offer.sdp || ''
      })
      const answer = await resp.text()
      await pc.setRemoteDescription({ type: 'answer', sdp: answer })
      setIsRecording(true)
      realtimeActiveRef.current = true
    } catch (e) {
      setAudioResult('Failed to start GPT Realtime')
      stopRealtime()
    }
  }

  const handleRecordClick = async () => {
    if (!isRecording) {
      // Start recording
      if (transcribeProvider === 'openai-realtime') {
        await startRealtime()
        return
      }
      try {
        const constraints: MediaStreamConstraints = {
          audio: selectedInputId
            ? {
                deviceId: { exact: selectedInputId } as any,
                echoCancellation: false as any,
                noiseSuppression: false as any,
                autoGainControl: false as any,
                channelCount: 2 as any
              }
            : true
        }
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        mediaStreamRef.current = stream

        // Level meter + VAD
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
          const source = ctx.createMediaStreamSource(stream)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 512
          source.connect(analyser)
          vadAnalyserRef.current = analyser
          const data = new Uint8Array(analyser.frequencyBinCount)
          const tick = () => {
            analyser.getByteTimeDomainData(data)
            let sum = 0
            for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v }
            const rms = Math.sqrt(sum / data.length)
            setInputLevel(rms)
            vadState.current.level = rms
            const now = Date.now()
            // Порог для обнаружения голоса: если RMS выше порога - есть речь, иначе - тишина
            // Обычно RMS для тишины: 0.01-0.05, для речи: 0.1-0.5+
            if (rms > 0.02) {
              vadState.current.lastVoice = now
              vadState.current.silentStart = 0
            } else {
              if (!vadState.current.silentStart) vadState.current.silentStart = now
            }
            rafRef.current = requestAnimationFrame(tick)
          }
          rafRef.current = requestAnimationFrame(tick)
        } catch {}

        const baseHandler = async () => {
          const blob = new Blob(vadState.current.buffered, { type: 'audio/webm' })
          vadState.current.buffered = []
          const reader = new FileReader()
          reader.onloadend = async () => {
            const base64Data = (reader.result as string).split(',')[1]
            try {
              const result = await window.electronAPI.analyzeAudioFromBase64(base64Data, blob.type)
              setAudioResult(result.text)
              onAudioTranscript?.(result.text)
            } catch (err) {
              setAudioResult('Audio analysis failed.')
            }
          }
          reader.readAsDataURL(blob)
        }

        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
        recorder.ondataavailable = (e) => { if (e.data.size > 0) vadState.current.buffered.push(e.data) }
        recorder.onstop = baseHandler
        recorderRef.current = recorder
        setMediaRecorder(recorder)
        recorder.start(100)
        setIsRecording(true)
        recordingActiveRef.current = true
        vadState.current.recordingStart = Date.now()

        // VAD interval: on silence send & restart
        vadIntervalRef.current = window.setInterval(() => {
          if (!recordingActiveRef.current) return
          const s = vadState.current.silentStart
          const lastVoice = vadState.current.lastVoice
          const recordingStart = vadState.current.recordingStart
          
          if (s && lastVoice > recordingStart) {
            // Проверяем: была ли речь в этой записи (lastVoice > recordingStart)
            const silentDuration = Date.now() - s
            const recordingDuration = Date.now() - recordingStart
            // Минимальная длительность записи: 300ms, время тишины: 1200ms
            if (silentDuration > 1500 && recordingDuration > 300) {
              vadState.current.silentStart = 0
              recorderRef.current?.stop()
              setTimeout(() => {
                if (!recordingActiveRef.current || !mediaStreamRef.current) return
                const nr = new MediaRecorder(mediaStreamRef.current, { mimeType: 'audio/webm;codecs=opus' })
                nr.ondataavailable = (e) => { if (e.data.size > 0) vadState.current.buffered.push(e.data) }
                nr.onstop = baseHandler
                recorderRef.current = nr
                setMediaRecorder(nr)
                nr.start(100)
                vadState.current.recordingStart = Date.now()
                vadState.current.lastVoice = 0
              }, 50)
            }
          }
        }, 150)
      } catch (err) {
        setAudioResult('Could not start recording.')
      }
    } else {
      // Stop recording
      if (transcribeProvider === 'openai-realtime') {
        stopRealtime()
        setIsRecording(false)
        return
      }
      recorderRef.current?.stop()
      if (vadIntervalRef.current) clearInterval(vadIntervalRef.current)
      setIsRecording(false)
      recordingActiveRef.current = false
      setMediaRecorder(null)
      if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null }
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      setInputLevel(0)
      vadState.current = { level: 0, silentStart: 0, lastVoice: 0, buffered: [], recordingStart: 0 }
      vadAnalyserRef.current = null
    }
  }

  // Remove handleChatSend function

  return (
    <div className="w-full">
      <div className="text-xs text-white/90 py-1 px-2 flex items-center justify-start gap-4 border-b border-white/10">
        <div className="draggable-area" style={{ width: 24, height: 20 }} />
        {/* Show/Hide */}
        <div className="flex items-center gap-2 interactive">
          <span className="text-[11px] leading-none">Show/Hide</span>
          <div className="flex gap-1">
            <button className="bg-white/10 hover:bg-white/20 transition-colors rounded-md px-1.5 py-1 text-[11px] leading-none text-white/70">⌘</button>
            <button className="bg-white/10 hover:bg-white/20 transition-colors rounded-md px-1.5 py-1 text-[11px] leading-none text-white/70">B</button>
          </div>
        </div>

        {/* Solve Command */}
        {screenshots.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] leading-none">Solve</span>
            <div className="flex gap-1">
              <button className="bg-white/10 hover:bg-white/20 transition-colors rounded-md px-1.5 py-1 text-[11px] leading-none text-white/70">⌘</button>
              <button className="bg-white/10 hover:bg-white/20 transition-colors rounded-md px-1.5 py-1 text-[11px] leading-none text-white/70">↵</button>
            </div>
          </div>
        )}

        {/* Voice Recording Button */}
        <div className="flex items-center gap-2">
          <button
            className={`interactive bg-white/10 hover:bg-white/20 transition-colors rounded-md px-2 py-1 text-[11px] leading-none text-white/70 flex items-center gap-1 ${isRecording ? 'bg-red-500/70 hover:bg-red-500/90' : ''}`}
            onClick={handleRecordClick}
            type="button"
          >
            {isRecording ? (<span className="animate-pulse">● Stop Recording</span>) : (<span>🎤 Record Voice</span>)}
          </button>
          <div className="flex items-center gap-1 interactive">
            <label className="opacity-70">Источник:</label>
            <select
              className="interactive text-[11px] bg-white/10 hover:bg-white/20 border border-white/20 rounded px-2 py-1 text-white/80"
              value={selectedInputId}
              onChange={(e) => setSelectedInputId(e.target.value)}
            >
              {audioDevices.length === 0 && (<option value="">По умолчанию</option>)}
              {audioDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || 'Микрофон'}</option>
              ))}
            </select>
            <button
              type="button"
              title="Обновить список устройств"
              className="interactive bg-white/10 hover:bg-white/20 transition-colors rounded-md px-2 py-1 text-[11px] leading-none text-white/70"
              onClick={async () => {
                try {
                  const list = await navigator.mediaDevices.enumerateDevices()
                  setAudioDevices(list.filter(d => d.kind === 'audioinput'))
                } catch {}
              }}
            >↻</button>
            <div className="ml-2 w-20 h-2 bg-white/10 rounded overflow-hidden">
              <div className="h-full bg-green-400/80 transition-[width]" style={{ width: `${Math.min(100, Math.round(inputLevel * 140))}%` }} title="Уровень сигнала" />
            </div>
          </div>
        </div>

        {/* Chat Button */}
        <div className="flex items-center gap-2 interactive">
          <button className="interactive bg-white/10 hover:bg-white/20 transition-colors rounded-md px-2 py-1 text-[11px] leading-none text-white/70 flex items-center gap-1" onClick={onChatToggle} type="button">💬 Chat</button>
        </div>

        {/* Settings Button */}
        <div className="flex items-center gap-2 interactive">
          <button className="interactive bg-white/10 hover:bg-white/20 transition-colors rounded-md px-2 py-1 text-[11px] leading-none text-white/70 flex items-center gap-1" onClick={onSettingsToggle} type="button">⚙️ Models</button>
        </div>

        {/* Question mark with tooltip */}
        <div className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
          <div className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-colors flex items-center justify-center cursor-help z-10">
            <span className="text-xs text-white/70">?</span>
          </div>
          {isTooltipVisible && (
            <div ref={tooltipRef} className="absolute top-full right-0 mt-2 w-80">
              <div className="p-3 text-xs bg-black/80 backdrop-blur-md rounded-lg border border-white/10 text-white/90 shadow-lg">
                <div className="space-y-4">
                  <h3 className="font-medium truncate">Keyboard Shortcuts</h3>
                  {/* content omitted for brevity */}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mx-2 h-4 w-px bg-white/20" />
        <button className="text-red-500/70 hover:text-red-500/90 transition-colors hover:cursor-pointer" title="Sign Out" onClick={() => window.electronAPI.quitApp()}>
          <IoLogOutOutline className="w-4 h-4" />
        </button>
      </div>
      {/* Audio result now piped into chat via onAudioTranscript; no separate block here */}
    </div>
  )
}

export default QueueCommands
