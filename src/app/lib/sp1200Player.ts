'use client'

import { SP1200Bank } from '@/app/lib/sp1200'

// Define all constants locally to avoid import issues
const SP1200_MAGIC = 0x1200 // Magic number for .sp12 files
const SP1200_SAMPLE_RATE = 26040
const SP1200_MAX_SECONDS = 2.5
const SP1200_MAX_SAMPLES = Math.floor(SP1200_SAMPLE_RATE * SP1200_MAX_SECONDS)
const SP1200_DISK_SIZE = 824576 // 805.25KB
const SP1200_HEADER_SIZE = 256
const SP1200_PAD_TABLE_OFFSET = 0x800
const SP1200_PAD_ENTRY_SIZE = 32
const SP1200_SAMPLE_DATA_OFFSET = 0x1000
const SP1200_SAMPLE_ALIGN = 256
const SP1200_END_MARKER = 0x8000
const SP1200_MAX_PADS = 32 // 8 pads per bank, 4 banks
const SP1200_MIN_DISK_SIZE = 0x1000
const SP1200_DEFAULT_TEMPO = 100
const SP1200_VOLUME_MAX = 255

export interface SP1200SampleInfo {
  name: string
  volume: number
  hasSample: boolean
}

export class SP1200Player {
  private audioContext: AudioContext | null = null
  private samples: Map<string, Float32Array> = new Map()
  private sampleInfo: Map<string, SP1200SampleInfo> = new Map()
  
  constructor() {
    this.initializeEmptyPads()
    if (typeof window !== 'undefined') {
      this.audioContext = new AudioContext({ sampleRate: SP1200_SAMPLE_RATE })
    }
  }

  private initializeEmptyPads() {
    const banks: SP1200Bank[] = ['A', 'B', 'C', 'D']
    for (const bank of banks) {
      for (let pad = 1; pad <= 8; pad++) {
        const padKey = this.getPadKey(bank, pad)
        this.sampleInfo.set(padKey, {
          name: '',
          volume: 1.0,
          hasSample: false
        })
      }
    }
  }
  
  private getPadKey(bank: SP1200Bank, padNumber: number): string {
    return `${bank}${padNumber}`
  }
  
  async loadDiskImage(buffer: ArrayBuffer) {
    console.log('Loading disk image, size:', buffer.byteLength)
    
    if (buffer.byteLength < SP1200_MIN_DISK_SIZE) {
      throw new Error('Invalid disk image: file too small')
    }
    
    const view = new DataView(buffer)
    
    // Check magic number (first 2 bytes)
    const magic = view.getUint16(0, true)
    console.log('Magic number:', magic.toString(16), 'Expected:', (SP1200_MAGIC & 0xFFFF).toString(16))
    if (magic !== (SP1200_MAGIC & 0xFFFF)) {
      throw new Error('Invalid disk image: wrong magic number')
    }
    
    // Clear existing samples but reinitialize empty pads
    this.samples.clear()
    this.initializeEmptyPads()
    
    // Read pad table for all 4 banks
    const banks: SP1200Bank[] = ['A', 'B', 'C', 'D']
    for (const bank of banks) {
      for (let pad = 1; pad <= 8; pad++) {
        const padKey = this.getPadKey(bank, pad)
        const padIndex = this.getPadIndex(bank, pad)
        const entryOffset = SP1200_PAD_TABLE_OFFSET + (padIndex * SP1200_PAD_ENTRY_SIZE)
        
        // Read pad entry
        // First 12 bytes: name
        let name = ''
        for (let i = 0; i < 12; i++) {
          const char = view.getUint8(entryOffset + i)
          if (char === 0) break
          name += String.fromCharCode(char)
        }
        
        // Next 4 bytes (0x0C): number of words
        const numWords = view.getUint32(entryOffset + 0x0C, true)
        // Next 4 bytes (0x10): sample offset
        const sampleOffset = view.getUint32(entryOffset + 0x10, true)
        // 0x19: volume
        const volume = view.getUint8(entryOffset + 0x19) / SP1200_VOLUME_MAX
        
        // Skip empty pads
        if (numWords === 0 || sampleOffset === 0) {
          continue
        }
        
        // Validate sample bounds
        const sampleLength = numWords * 2 // Convert words to bytes
        if (sampleOffset + sampleLength > buffer.byteLength) {
          console.warn(`Sample data for pad ${padKey} outside buffer bounds`)
          continue
        }
        
        // Read sample data
        const sampleData = new Float32Array(numWords)
        for (let i = 0; i < numWords; i++) {
          // Each sample is 12 bits (stored in 16-bit words)
          const value = view.getUint16(sampleOffset + (i * 2), true) & 0x0FFF
          // Convert 12-bit unsigned to float (-1.0 to 1.0)
          sampleData[i] = (value - 2048) / 2048
        }
        
        this.samples.set(padKey, sampleData)
        this.sampleInfo.set(padKey, {
          name: name.trim() || `Sample ${bank}${pad}`,
          volume,
          hasSample: true
        })
      }
    }
  }
  
  private getPadIndex(bank: SP1200Bank, pad: number): number {
    const bankOffset = {
      'A': 0,
      'B': 8,
      'C': 16,
      'D': 24
    }
    return bankOffset[bank] + (pad - 1)
  }
  
  getSampleInfo(bank: SP1200Bank, padNumber: number): SP1200SampleInfo | null {
    const padKey = this.getPadKey(bank, padNumber)
    return this.sampleInfo.get(padKey) || null
  }
  
  async resume() {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume()
    }
  }
  
  async playSample(bank: SP1200Bank, padNumber: number) {
    if (!this.audioContext) return
    
    const padKey = this.getPadKey(bank, padNumber)
    const sampleData = this.samples.get(padKey)
    const info = this.sampleInfo.get(padKey)
    
    if (!sampleData || !info || !info.hasSample) {
      console.log(`No sample data for pad ${padKey}`)
      return
    }
    
    // Create buffer at SP-1200's native sample rate
    const buffer = this.audioContext.createBuffer(1, sampleData.length, SP1200_SAMPLE_RATE)
    buffer.copyToChannel(sampleData, 0)
    
    // Create source and connect with volume
    const source = this.audioContext.createBufferSource()
    source.buffer = buffer
    
    const gainNode = this.audioContext.createGain()
    gainNode.gain.value = info.volume
    
    source.connect(gainNode)
    gainNode.connect(this.audioContext.destination)
    source.start()
  }
} 