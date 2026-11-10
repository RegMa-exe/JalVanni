import { useCallback, useEffect, useRef, useState } from 'react'

export type RecorderState = 'idle' | 'recording' | 'stopped' | 'denied' | 'unsupported'

/**
 * Captures microphone audio with MediaRecorder and exposes a live input level
 * (0-1) for waveform visualisation. Recording auto-stops at `maxSeconds`.
 * `blob` is set once the recording has been finalised.
 */
export function useRecorder(maxSeconds: number) {
  const [state, setState] = useState<RecorderState>('idle')
  const [level, setLevel] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [autoStopped, setAutoStopped] = useState(false)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number>(0)
  const timerRef = useRef<number>(0)

  const cleanup = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    void ctxRef.current?.close().catch(() => undefined)
    ctxRef.current = null
    setLevel(0)
  }, [])

  useEffect(() => cleanup, [cleanup])

  const stop = useCallback(
    (auto = false) => {
      const rec = recorderRef.current
      if (!rec) return
      recorderRef.current = null
      if (rec.state !== 'inactive') rec.stop()
      cleanup()
      setAutoStopped(auto)
      setState('stopped')
    },
    [cleanup],
  )

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setState('unsupported')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream

      const ctx = new AudioContext()
      ctxRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      ctx.createMediaStreamSource(stream).connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (const v of data) sum += ((v - 128) / 128) ** 2
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4))
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()

      const chunks: Blob[] = []
      const rec = new MediaRecorder(stream)
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data)
      }
      rec.onstop = () => setBlob(new Blob(chunks, { type: rec.mimeType }))
      rec.start()
      recorderRef.current = rec

      setBlob(null)
      setElapsed(0)
      setAutoStopped(false)
      const startedAt = Date.now()
      timerRef.current = window.setInterval(() => {
        const secs = (Date.now() - startedAt) / 1000
        setElapsed(Math.min(maxSeconds, Math.floor(secs)))
        if (secs >= maxSeconds) stop(true)
      }, 200)
      setState('recording')
    } catch {
      cleanup()
      setState('denied')
    }
  }, [cleanup, maxSeconds, stop])

  const reset = useCallback(() => {
    const rec = recorderRef.current
    if (rec) {
      rec.onstop = null // discard the in-flight recording
      if (rec.state !== 'inactive') rec.stop()
    }
    recorderRef.current = null
    cleanup()
    setBlob(null)
    setElapsed(0)
    setAutoStopped(false)
    setState('idle')
  }, [cleanup])

  return { state, level, elapsed, blob, autoStopped, start, stop: () => stop(false), reset }
}
