"use client"
import React, { useState, useRef, useEffect, useCallback } from 'react'

type Size = 'small' | 'large'

export default function SlapButton({
  initial,
  size = 'small',
  label,
}: {
  initial: number
  size?: Size
  label?: string
}) {
  const [count, setCount] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const harderVideoRef = useRef<HTMLVideoElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const sendingRef = useRef(false)
  const actionPendingRef = useRef(false)
  const actionIdRef = useRef<string | null>(null)
  const actionHandledRef = useRef(false)
  const [sessionCount, setSessionCount] = useState(0)
  const [hardActive, setHardActive] = useState(false)
  const [hardPlaying, setHardPlaying] = useState(false)
  // how many session slaps required to unlock "Slap Harder"
  const HARD_THRESHOLD = 5

  // temporary local disable to avoid immediate retries after rate-limit
  const [disabledTemp, setDisabledTemp] = useState(false)

  // desired durations (ms). Use touch detection rather than UA when possible.
  const isTouch = typeof window !== 'undefined' && (('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0))
  const DESKTOP_DURATION = 800
  const MOBILE_DURATION = 1000
  // Use 800ms on desktop and 1000ms on touch/mobile devices
  const getDuration = () => isTouch ? MOBILE_DURATION : DESKTOP_DURATION

  // helper: safe console logging for catches
  const safeLog = useCallback((label: string, err: unknown) => {
    // keep as console.warn for now; replace with monitoring SDK in prod
    try { console.warn('[SlapButton] ' + label, err) } catch {}
  }, [])

  // initialize session-local count from sessionStorage so progress persists across reloads
  useEffect(() => {
    try {
      // start fresh: ensure Slap Harder progress is 0% on initial load
      setSessionCount(0)
      setHardActive(false)
      try { sessionStorage.setItem('sessionCount', '0') } catch {}
    } catch (e) {
      safeLog('session-init', e)
    }
  }, [safeLog])

  async function handleSlap() {
    if (disabledTemp) return
    setLoading(true)
    setMessage(null)
    setDisabledTemp(true)
  // mark that this user action has started and a send is expected
    const actionId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`
    actionIdRef.current = actionId
  actionHandledRef.current = false
    actionPendingRef.current = true
    try { console.debug('[Slap] handleSlap start', actionId) } catch {}
    // play-only on click; session progress and Slap Harder update will happen after successful POST

    const v = videoRef.current
    if (!v) {
      // fallback: no video -> call API immediately
      await sendSlapAndUpdate()
      return
    }

    // ensure start from 0 before playing
    try { v.pause() } catch (e) { safeLog('pause-before-play', e) }
    try { v.currentTime = 0 } catch (e) { safeLog('seek-before-play', e) }

    // play (user initiated - should succeed); attempt muted fallback only if play() rejects
    try {
      const p = v.play()
      if (p && p.catch) {
        p.catch(async (err: any) => {
          safeLog('play-failed, retrying muted', err)
          try { v.muted = true } catch (e) { safeLog('mute-failed', e) }
          try { await v.play() } catch (e) { safeLog('muted-play-failed', e) }
        })
      }
    } catch (e) {
      safeLog('play-call-failed', e)
    }

    const durationMs = getDuration()

    // send when playback crosses durationMs using requestVideoFrameCallback/timeupdate fallback
    let sent = false
    async function doSendOnce() {
      if (sent) return
      // ensure this matches the expected action id (avoid racing onEnded)
      if (actionIdRef.current && actionIdRef.current !== actionId) {
        try { console.debug('[Slap] doSendOnce skipping due to mismatched actionId', actionId, actionIdRef.current) } catch {}
        return
      }
      sent = true
      // mark that the pending action is now being committed and prevent onEnded from duplicating
      try { actionPendingRef.current = false; actionIdRef.current = null; actionHandledRef.current = true; sendingRef.current = true; console.debug('[Slap] doSendOnce commit', actionId) } catch {}
      // reset visual state: pause and seek the video back to the first frame so UI looks stable
      try {
        if (v) {
          try { v.pause() } catch (e) { safeLog('doSendOnce-pause', e) }
          try { v.currentTime = 0.001 } catch (e) { safeLog('doSendOnce-seek-small', e) }
          await new Promise<void>(res => requestAnimationFrame(() => res()))
          try { v.currentTime = 0 } catch (e) { safeLog('doSendOnce-seek-zero', e) }
          try { v.muted = false } catch (e) { safeLog('doSendOnce-unmute', e) }
        }
      } catch (e) { safeLog('doSendOnce-visual-reset', e) }
      sendSlapAndUpdate().catch((err) => safeLog('send-failed', err))
    }

    // try requestVideoFrameCallback if available
    // NOTE: types may not include requestVideoFrameCallback in TS target; use any.
    try {
      const anyV: any = v
      if (anyV.requestVideoFrameCallback) {
        const startMs = performance.now()
        const cb = (now: number, meta: any) => {
          // meta.mediaTime is seconds elapsed in video timeline; prefer wall-clock for consistency
          if ((now - startMs) >= durationMs) {
            doSendOnce()
          } else {
            anyV.requestVideoFrameCallback(cb)
          }
        }
        anyV.requestVideoFrameCallback(cb)
        // Also set a fallback timeout in case rvfc never fires (safety)
        try { if (timerRef.current) clearTimeout(timerRef.current) } catch {}
        timerRef.current = window.setTimeout(() => doSendOnce(), durationMs + 300)
        return
      }
    } catch (e) { safeLog('rvfc-check', e) }

    // fallback to timeupdate event
    const onTime = () => {
      try {
        if ((v.currentTime * 1000) >= durationMs) {
          v.removeEventListener('timeupdate', onTime)
          doSendOnce()
        }
      } catch (e) { safeLog('timeupdate-handler', e) }
    }
    v.addEventListener('timeupdate', onTime)

    // also fallback to setTimeout safety
    try { if (timerRef.current) clearTimeout(timerRef.current) } catch {}
    timerRef.current = window.setTimeout(() => {
      try { v.removeEventListener('timeupdate', onTime) } catch {}
      doSendOnce()
    }, durationMs + 300)
  }

    async function sendSlapAndUpdate() {
        setLoading(true)
        // mark send in-flight
        try { sendingRef.current = true } catch {}
      try {
        const res = await fetch('/api/slap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
        const data = await res.json()
        if (res.ok && data.totalSlaps !== undefined) {
          setCount(data.totalSlaps)
            // increment session-local counter and enable "harder" when reaching threshold
            setSessionCount(prev => {
              const next = prev + 1
              try { sessionStorage.setItem('sessionCount', String(next)) } catch {}
              if (next >= HARD_THRESHOLD) setHardActive(true)
              return next
            })
          setMessage('Slap recorded!')
        } else {
            setMessage(data.error || 'Something went wrong')
        }
      } catch (e) {
          setMessage('Network error')
      } finally {
        setLoading(false)
        setDisabledTemp(false)
        // reset sending flag
        try { sendingRef.current = false } catch {}
      }
    }

    // cleanup timers on unmount
    useEffect(() => {
      return () => {
        try { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null } } catch {}
      }
    }, [])

    

  return (
    <div className="flex flex-col items-center gap-4 pt-2 md:pt-6">
      <div className="mb-2 w-full flex justify-center">
        <div className="slap-animation" style={{ position: 'relative' }}>
          {/* main slap video (hidden while harder clip plays) */}
          <video
            poster="/starting_frame.png"
            ref={videoRef}
            src="/api/slap/video"
            preload="metadata"
            playsInline
            className={`w-full h-full object-cover rounded-md ${hardPlaying ? 'hidden' : ''} z-10`}
            // no onLoadedMetadata actions — do not autoplay or programmatically decode on load
            // do not set muted so audio plays when browser allows (user clicked)
            onEnded={async () => {
              // if the timer already triggered the send, don't send again
              try { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null } } catch {}
              try { console.debug('[Slap] onEnded fired, actionIdRef=', actionIdRef.current, 'sendingRef=', sendingRef.current) } catch {}
              // only send here if there is no send in-flight, no pending action id, and the action has not already been handled
              if (!sendingRef.current && !actionIdRef.current && !actionHandledRef.current) {
                try {
                  if (videoRef.current) {
                    try { videoRef.current.pause() } catch {}
                    try { videoRef.current.currentTime = 0.001 } catch {}
                    await new Promise<void>(res => requestAnimationFrame(() => res()))
                    try { videoRef.current.currentTime = 0 } catch {}
                    try { videoRef.current.muted = false } catch {}
                    // do not call load(); use pause+seek+RAF to reset visual without blanking
                  }
                } catch (e) { safeLog('onEnded-fallback', e) }
                await sendSlapAndUpdate()
              }
            }}
          />

          {/* no placeholder — show the first frame as soon as metadata is available */}

          {/* harder video overlay - visible when playing harder clip */}
          <video
            ref={harderVideoRef}
            src="/api/slap/harder-video"
            preload="auto"
            playsInline
            className={`absolute inset-0 w-full h-full object-cover rounded-md ${hardPlaying ? 'z-30 block' : 'z-10 hidden'}`}
            onEnded={async () => {
              // when harder clip ends, reset state so next 10 slaps are required
              try { if (harderVideoRef.current) { try { harderVideoRef.current.currentTime = 0 } catch {}; try { harderVideoRef.current.pause() } catch {} } } catch {}
              setHardPlaying(false)
              setSessionCount(0)
              setHardActive(false)
            }}
          />
        </div>
      </div>
      {size === 'large' ? (
        <>
          <div className="w-40 h-40 md:w-56 md:h-56 rounded-full bg-[#f7f7f8] flex items-center justify-center text-4xl md:text-5xl font-extrabold shadow-lg">
            {count}
          </div>
          <button
            className="w-full md:w-auto mt-2 md:mt-0 md:ml-4 px-6 py-3 md:px-8 md:py-4 bg-red-600 text-white rounded-full shadow-lg text-xl md:text-2xl disabled:opacity-50"
            onClick={handleSlap}
            disabled={loading || disabledTemp}
          >
            {label ?? 'Slap Hard'}
          </button>
          {/* Slap Harder button with progress fill */}
            <div className="relative mt-2 w-full max-w-[320px]">
            <button
              className={`relative w-full min-w-[240px] md:min-w-[320px] h-12 md:h-14 flex items-center justify-center px-4 py-3 rounded-full text-lg overflow-hidden bg-gray-300`}
              onClick={async () => {
                  if (!hardActive || hardPlaying) return
                  // mark playing and hide main video
                  setHardPlaying(true)
                  setHardActive(false)
                  try {
                    // pause main slap video so it doesn't interfere
                    if (videoRef.current) {
                      try { videoRef.current.pause() } catch {}
                    }
                    // wait for next animation frames so overlay becomes visible and painted
                    await new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res())))
                    if (harderVideoRef.current) {
                      try { harderVideoRef.current.currentTime = 0 } catch {}
                      const p = harderVideoRef.current.play()
                      if (p && p.catch) p.catch(() => {
                        try { if (harderVideoRef.current) { harderVideoRef.current.muted = true; harderVideoRef.current.play() } } catch {}
                      })
                    }
                  } catch (e) {}
                }}
              disabled={!hardActive || hardPlaying}
            >
              <div className="relative z-20 text-gray-700 font-medium">Slap Harder</div>
              {/* progress fill - sits above the button background so green is visible immediately */}
              <div aria-hidden className="absolute left-0 top-0 h-full bg-green-400 z-10" style={{ width: `${Math.min(100, (sessionCount/HARD_THRESHOLD)*100)}%`, transition: 'width 300ms linear' }} />
              {/* overlay to dim when disabled */}
              {!hardActive && <div className="absolute inset-0 bg-white/60" />}
            </button>
            {/* overlay player above is used; no extra hidden player */}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-4">
          <button
            className="px-4 py-2 bg-red-500 text-white rounded shadow disabled:opacity-50"
            onClick={handleSlap}
            disabled={loading || disabledTemp}
          >
            {label ?? '+1 Slap'}
          </button>
          <div className="text-lg">Slaps: <strong>{count}</strong></div>
        </div>
      )}

      {message && <div className="text-sm text-gray-700">{message}</div>}
    </div>
  )
}
