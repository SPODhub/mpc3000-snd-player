/**
 * SND Player component for MPC3000/S3000 SND files.
 * 
 * Format specification based on "Akai sampler disk and file formats" documentation:
 * - 192-byte header
 * - First byte: 3
 * - Second byte: 1 for 44.1kHz, 0 for 22.05kHz
 * - Third byte: MIDI root note (C3=60)
 * - Bytes 3-14: Filename (12 bytes, AKAII format)
 * - Byte 15: Always 128
 * - Byte 16: Number of active loops
 * - Byte 17: First active loop
 * - Byte 18: Always 0
 * - Byte 19: Loop mode (2=none)
 * - Byte 20: Cents tune
 * - Byte 21: Semi tune
 * - Bytes 22-25: Fixed values (0,8,2,0)
 * - Bytes 26-29: Number of sample words
 * - Bytes 30-33: Start marker
 * - Bytes 34-37: End marker
 * - Bytes 38-181: Loop markers (7 loops)
 * - Bytes 182-185: End markers (0,0,255,255)
 * - Bytes 186-187: Sampling frequency
 * - Byte 188: Loop tune offset
 * - Bytes 189-191: Reserved (0)
 * 
 * Followed by 16-bit PCM data
 */
'use client'

import { useState, useRef, useEffect } from 'react'

interface SndPlayerProps {
  sndFile: Blob
}

export default function SndPlayer({ sndFile }: SndPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [pitch, setPitch] = useState(0) // Pitch in semitones (-12 to +12)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const bufferRef = useRef<AudioBuffer | null>(null)
  const startTimeRef = useRef<number>(0)
  const pauseTimeRef = useRef<number>(0)
  const animationFrameRef = useRef<number>()

  useEffect(() => {
    // Initialize audio context
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    
    // Load SND file
    const loadSndFile = async () => {
      try {
        const arrayBuffer = await sndFile.arrayBuffer()
        const view = new DataView(arrayBuffer)
        
        // Parse S3000/MPC3000 header
        const format = view.getUint8(0)
        const sampleRateFlag = view.getUint8(1)
        const midiRootNote = view.getUint8(2)
        const filenameBytes = new Uint8Array(arrayBuffer.slice(3, 15))
        const filename = String.fromCharCode(...Array.from(filenameBytes)).replace(/\0/g, '')
        const numSamples = view.getUint32(26, true)
        const sampleRate = sampleRateFlag === 1 ? 44100 : 22050 // Use sample rate flag to determine sample rate
        
        // Debug output
        console.log('SND Header Debug:')
        console.log('Format byte:', format)
        console.log('Sample rate flag:', sampleRateFlag)
        console.log('MIDI root note:', midiRootNote)
        console.log('Filename:', filename)
        console.log('Num samples:', numSamples)
        console.log('Sample rate:', sampleRate)
        
        // Debug: log raw bytes at offsets 26 and 186
        console.log('Raw bytes at offset 26 (num samples):', Array.from(new Uint8Array(arrayBuffer.slice(26, 30))))
        console.log('Raw bytes at offset 186 (sample rate):', Array.from(new Uint8Array(arrayBuffer.slice(186, 188))))
        
        // Read PCM data (skip 192-byte header)
        const pcmData = new Int16Array(arrayBuffer.slice(192))
        // Log first 10 PCM values (raw)
        console.log('First 10 PCM (raw, little-endian):', Array.from(pcmData.slice(0, 10)))
        // Log first 10 PCM (big-endian swap)
        const swapped = Array.from(pcmData.slice(0, 10)).map(sample => ((sample & 0xFF) << 8) | ((sample >> 8) & 0xFF))
        console.log('First 10 PCM (big-endian swap):', swapped)
        
        // Create audio buffer
        const audioBuffer = audioContextRef.current!.createBuffer(
          1, // Mono
          numSamples,
          sampleRate
        )
        
        // Read PCM data (skip 192-byte header)
        const floatData = new Float32Array(pcmData.length)
        
        // Convert 16-bit PCM to float32 (no byte swap, just signed conversion)
        for (let i = 0; i < pcmData.length; i++) {
          floatData[i] = Math.max(-1, Math.min(1, pcmData[i] / 32768));
        }
        
        // Debug: log first 10 float values
        console.log('First 10 floatData values:', Array.from(floatData.slice(0, 10)))
        
        // Copy to audio buffer
        audioBuffer.copyToChannel(floatData, 0)
        
        // Debug: log audio buffer info
        console.log('AudioBuffer duration:', audioBuffer.duration)
        console.log('AudioBuffer sampleRate:', audioBuffer.sampleRate)
        console.log('AudioBuffer length:', audioBuffer.length)
        
        bufferRef.current = audioBuffer
        setDuration(audioBuffer.duration)
      } catch (error) {
        console.error('Error loading SND file:', error)
      }
    }
    
    loadSndFile()
    
    return () => {
      if (sourceRef.current) {
        sourceRef.current.stop()
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [sndFile])

  const play = () => {
    console.log('DEBUG: play() function called');
    if (!audioContextRef.current || !bufferRef.current) return
    
    // Resume audio context if suspended
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume()
    }
    
    // Create new source
    const source = audioContextRef.current.createBufferSource()
    source.buffer = bufferRef.current
    
    // Set playback rate based on pitch (2^(pitch/12))
    const playbackRate = Math.pow(2, pitch / 12)
    source.playbackRate.value = playbackRate
    
    // Create gain node for volume control
    const gainNode = audioContextRef.current.createGain()
    gainNode.gain.value = 1.0
    
    // Connect nodes
    source.connect(gainNode)
    gainNode.connect(audioContextRef.current.destination)
    
    // Start playback
    if (isPaused) {
      // Resume from pause position
      source.start(0, pauseTimeRef.current)
      startTimeRef.current = audioContextRef.current.currentTime - pauseTimeRef.current
    } else {
      // Start from beginning
      source.start(0)
      startTimeRef.current = audioContextRef.current.currentTime
    }
    
    sourceRef.current = source
    setIsPlaying(true)
    setIsPaused(false)
    
    // Debug output
    console.log('Playback started:', { isPaused, startTime: startTimeRef.current, pitch, playbackRate })
    
    // Update progress
    const updateProgress = () => {
      if (!audioContextRef.current || !sourceRef.current) return
      
      const currentTime = audioContextRef.current.currentTime - startTimeRef.current
      setCurrentTime(currentTime)
      
      if (currentTime < bufferRef.current!.duration) {
        animationFrameRef.current = requestAnimationFrame(updateProgress)
      } else {
        setIsPlaying(false)
        setIsPaused(false)
        setCurrentTime(0)
      }
    }
    
    animationFrameRef.current = requestAnimationFrame(updateProgress)
    
    // Handle end of playback
    source.onended = () => {
      setIsPlaying(false)
      setIsPaused(false)
      setCurrentTime(0)
      sourceRef.current = null
    }
  }

  const pause = () => {
    if (!audioContextRef.current || !sourceRef.current) return
    
    // Stop current playback
    sourceRef.current.stop()
    sourceRef.current = null
    
    // Store current position
    pauseTimeRef.current = currentTime
    setIsPlaying(false)
    setIsPaused(true)
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
  }

  const stop = () => {
    if (sourceRef.current) {
      sourceRef.current.stop()
      sourceRef.current = null
    }
    setIsPlaying(false)
    setIsPaused(false)
    setCurrentTime(0)
    pauseTimeRef.current = 0
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
  }

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <div className="flex flex-col gap-4">
        {/* Transport Controls */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={stop}
            className="p-2 bg-gray-200 rounded-full hover:bg-gray-300 transition-colors"
            title="Stop"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" />
            </svg>
          </button>
          
          {!isPlaying ? (
            <button
              onClick={play}
              className="p-2 bg-blue-500 rounded-full hover:bg-blue-600 transition-colors"
              title="Play"
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M5 3l14 9-14 9V3z" />
              </svg>
            </button>
          ) : (
            <button
              onClick={pause}
              className="p-2 bg-blue-500 rounded-full hover:bg-blue-600 transition-colors"
              title="Pause"
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            </button>
          )}
        </div>

        {/* Pitch Control */}
        <div className="flex flex-col items-center gap-2">
          <label htmlFor="pitch" className="text-sm font-medium text-gray-700">
            Pitch: {pitch > 0 ? '+' : ''}{pitch} semitones
          </label>
          <input
            type="range"
            id="pitch"
            min="-12"
            max="12"
            value={pitch}
            onChange={(e) => setPitch(parseInt(e.target.value))}
            className="w-full max-w-xs"
          />
        </div>

        {/* Progress Bar */}
        <div className="flex-1">
          <div className="h-2 bg-gray-200 rounded-full">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
          </div>
        </div>

        {/* Time Display */}
        <div className="text-sm text-gray-600 text-center">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>
    </div>
  )
} 