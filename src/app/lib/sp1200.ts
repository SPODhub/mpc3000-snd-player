// SP-1200 File Format Constants
export const SP1200_MAGIC = 0x1200 // Magic number for .sp12 files
export const SP1200_SAMPLE_RATE = 26040
export const SP1200_MAX_SECONDS = 2.5
export const SP1200_MAX_SAMPLES = Math.floor(SP1200_SAMPLE_RATE * SP1200_MAX_SECONDS)
export const SP1200_DISK_SIZE = 824576 // 805.25KB
export const SP1200_HEADER_SIZE = 256
export const SP1200_PAD_TABLE_OFFSET = 0x800
export const SP1200_PAD_ENTRY_SIZE = 32
export const SP1200_SAMPLE_DATA_OFFSET = 0x1000
export const SP1200_SAMPLE_ALIGN = 256
export const SP1200_END_MARKER = 0x8000
export const SP1200_MAX_PADS = 32 // 8 pads per bank, 4 banks
export const SP1200_MIN_DISK_SIZE = 0x1000
export const SP1200_DEFAULT_TEMPO = 100
export const SP1200_VOLUME_MAX = 255
export const SP1200_BLOCK_SIZE = 256 // Memory block size in bytes

// New constants from firmware analysis
export const SP1200_SEQUENCE_DATA_OFFSET = 0x4000 // Sequences start after samples
export const SP1200_MAX_SEQUENCE_LENGTH = 100 // Maximum steps per sequence
export const SP1200_SEQUENCE_ENTRY_SIZE = 32
export const SP1200_MAX_SEQUENCES = 100

// Sample tuning constants (from firmware analysis)
export const SP1200_BASE_FREQUENCY = 26040
export const SP1200_PITCH_TABLE = new Uint16Array([
  24000, 24260, 24520, 24790, 25060, 25330, 
  25610, 25890, 26170, 26460, 26750, 27040
])

interface SP1200SampleMetadata {
  tuning?: number
  volume?: number
  loop?: boolean
  loopStart?: number
  loopEnd?: number
  truncStart?: number
  truncEnd?: number
}

export interface SP1200Sample {
  name: string
  bank: 'A' | 'B' | 'C' | 'D'
  padNumber: number // 1-8
  data: Uint8Array
  sampleRate: number
  bitsPerSample: number
  length: number
  metadata?: SP1200SampleMetadata
}

export interface SP1200Sequence {
  name: string
  tempo: number
  steps: number[][]
}

export interface SP1200Disk {
  samples: SP1200Sample[]
  sequences: SP1200Sequence[]
}

// Update bank type to include all 4 banks
export type SP1200Bank = 'A' | 'B' | 'C' | 'D'

// Bank and pad validation
export const isValidBank = (bank: string): bank is SP1200Bank => 
  bank === 'A' || bank === 'B' || bank === 'C' || bank === 'D'
export const isValidPad = (pad: number): boolean => pad >= 1 && pad <= 8

export interface SP1200PadAssignment {
  bank: SP1200Bank
  padNumber: number
  name: string
  data: Uint8Array
  metadata?: SP1200SampleMetadata
}

export interface SP1200DiskBuilder {
  addSample(assignment: SP1200PadAssignment): void
  removeSample(bank: SP1200Bank, padNumber: number): void
  getSample(bank: SP1200Bank, padNumber: number): SP1200PadAssignment | undefined
  getPadAssignments(): SP1200PadAssignment[]
  createDiskImage(): ArrayBuffer
  clear(): void
}

export class SP1200DiskBuilderImpl implements SP1200DiskBuilder {
  private padAssignments: Map<string, SP1200PadAssignment> = new Map()

  private getPadKey(bank: SP1200Bank, padNumber: number): string {
    return `${bank}${padNumber}`
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

  addSample(assignment: SP1200PadAssignment): void {
    if (!isValidBank(assignment.bank)) {
      throw new Error('Invalid bank. Must be A, B, C, or D')
    }
    if (!isValidPad(assignment.padNumber)) {
      throw new Error('Invalid pad number. Must be between 1 and 8')
    }

    const key = this.getPadKey(assignment.bank, assignment.padNumber)
    this.padAssignments.set(key, {
      ...assignment,
      name: assignment.name.slice(0, 12) // Ensure name fits in 12 bytes
    })
  }

  removeSample(bank: SP1200Bank, padNumber: number): void {
    const key = this.getPadKey(bank, padNumber)
    this.padAssignments.delete(key)
  }

  getSample(bank: SP1200Bank, padNumber: number): SP1200PadAssignment | undefined {
    const key = this.getPadKey(bank, padNumber)
    return this.padAssignments.get(key)
  }

  getPadAssignments(): SP1200PadAssignment[] {
    return Array.from(this.padAssignments.values())
  }

  clear(): void {
    this.padAssignments.clear()
  }

  createDiskImage(): ArrayBuffer {
    const buffer = new ArrayBuffer(SP1200_DISK_SIZE)
    const view = new DataView(buffer)
    const bytes = new Uint8Array(buffer)
    
    // Initialize disk with zeros
    bytes.fill(0)
    
    // Write disk header (first 256 bytes)
    // Magic number (0x1200)
    view.setUint16(0, SP1200_MAGIC, true)
    
    // Number of samples and sequences
    const numSamples = this.padAssignments.size
    view.setUint16(2, numSamples, true)
    view.setUint16(4, 0, true) // No sequences for now
    
    // Pad table starts at 0x800 (2048 bytes)
    // Each pad entry is 32 bytes
    // Initialize pad table with zeros
    bytes.fill(0, SP1200_PAD_TABLE_OFFSET, SP1200_PAD_TABLE_OFFSET + (SP1200_MAX_PADS * SP1200_PAD_ENTRY_SIZE))
    
    // Sort assignments by bank and pad number for consistent ordering
    const sortedAssignments = this.getPadAssignments().sort((a, b) => {
      const bankCompare = a.bank.localeCompare(b.bank)
      if (bankCompare !== 0) return bankCompare
      return a.padNumber - b.padNumber
    })
    
    // Sample data starts at 0x1000 (4096 bytes)
    let currentDataOffset = SP1200_SAMPLE_DATA_OFFSET
    
    for (const sample of sortedAssignments) {
      const padIndex = this.getPadIndex(sample.bank, sample.padNumber)
      const padEntryOffset = SP1200_PAD_TABLE_OFFSET + (padIndex * SP1200_PAD_ENTRY_SIZE)
      
      // Write pad entry (32 bytes)
      // 1. Sample name (12 bytes)
      const nameBytes = new TextEncoder().encode(sample.name.slice(0, 12))
      bytes.set(nameBytes, padEntryOffset)
      
      // 2. Sample length in words (4 bytes)
      const numWords = Math.floor(sample.data.length / 2)
      view.setUint32(padEntryOffset + 0x0C, numWords, true)
      
      // 3. Sample data offset (4 bytes)
      view.setUint32(padEntryOffset + 0x10, currentDataOffset, true)
      
      // 4. Bank and pad info (2 bytes)
      const bankIndex = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 }[sample.bank]
      view.setUint8(padEntryOffset + 0x14, bankIndex)
      view.setUint8(padEntryOffset + 0x15, sample.padNumber - 1)
      
      // 5. Sample metadata (8 bytes)
      if (sample.metadata) {
        // Tuning (-12 to +12 semitones)
        const tuningValue = sample.metadata.tuning ?? 0
        view.setUint8(padEntryOffset + 0x18, (tuningValue + 12) & 0xFF)
        // Volume (0-255)
        view.setUint8(padEntryOffset + 0x19, sample.metadata.volume || SP1200_VOLUME_MAX)
        // Loop flag
        view.setUint8(padEntryOffset + 0x1A, sample.metadata.loop ? 1 : 0)
        // Loop points (in samples)
        view.setUint16(padEntryOffset + 0x1B, sample.metadata.loopStart || 0, true)
        view.setUint16(padEntryOffset + 0x1D, sample.metadata.loopEnd || 0, true)
        // Truncate points (in samples)
        view.setUint16(padEntryOffset + 0x1F, sample.metadata.truncStart || 0, true)
        view.setUint16(padEntryOffset + 0x21, sample.metadata.truncEnd || 0, true)
      } else {
        // Default metadata
        view.setUint8(padEntryOffset + 0x19, SP1200_VOLUME_MAX)
      }
      
      // Write sample data
      // Ensure sample data is properly aligned to 256-byte boundary
      if (currentDataOffset % SP1200_SAMPLE_ALIGN !== 0) {
        currentDataOffset = (currentDataOffset + SP1200_SAMPLE_ALIGN - 1) & ~(SP1200_SAMPLE_ALIGN - 1)
      }
      
      // Write the actual sample data
      bytes.set(sample.data, currentDataOffset)
      
      // Add end marker (0x8000) after sample data
      const endMarkerOffset = currentDataOffset + sample.data.length
      view.setUint16(endMarkerOffset, SP1200_END_MARKER, true)
      
      // Move to next 256-byte boundary for next sample
      currentDataOffset = (endMarkerOffset + SP1200_SAMPLE_ALIGN - 1) & ~(SP1200_SAMPLE_ALIGN - 1)
    }
    
    // Validate final disk size
    if (currentDataOffset > SP1200_DISK_SIZE) {
      throw new Error('Disk image exceeds maximum size')
    }
    
    return buffer
  }
}

// Create a singleton instance for the application
export const diskBuilder = new SP1200DiskBuilderImpl()

// Helper function to parse WAV header - more flexible implementation
export function parseWavHeader(buffer: ArrayBuffer): {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
} {
  const view = new DataView(buffer)
  
  // Check minimum buffer size
  if (buffer.byteLength < 44) {
    throw new Error('Invalid WAV: file too small')
  }
  
  // Check RIFF header
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
  if (riff !== 'RIFF') {
    throw new Error('Invalid WAV: RIFF header not found')
  }
  
  // Check WAVE format
  const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))
  if (wave !== 'WAVE') {
    throw new Error('Invalid WAV: WAVE format not found')
  }
  
  // Search for fmt and data chunks
  let offset = 12
  let foundFmt = false
  let audioFormat = 0
  let channels = 0
  let sampleRate = 0
  let bitsPerSample = 0
  let dataOffset = 0
  let dataLength = 0
  
  try {
    while (offset < buffer.byteLength - 8) {
      // Get chunk ID (4 bytes)
      const chunkId = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
      )
      
      // Get chunk size (4 bytes)
      const chunkSize = view.getUint32(offset + 4, true)
      
      console.log(`Found chunk: ${chunkId}, size: ${chunkSize}, at offset: ${offset}`)
      
      if (chunkId === 'fmt ') {
        foundFmt = true
        
        // Parse fmt chunk (basic PCM format)
        audioFormat = view.getUint16(offset + 8, true)
        channels = view.getUint16(offset + 10, true)
        sampleRate = view.getUint32(offset + 12, true)
        
        // For most WAV files, bits per sample is at offset 22 from the start of the fmt chunk
        if (offset + 22 + 2 <= buffer.byteLength) {
          bitsPerSample = view.getUint16(offset + 22, true)
        } else {
          // Default to 16-bit if we can't read it
          bitsPerSample = 16
          console.warn('Could not read bits per sample, defaulting to 16-bit')
        }
        
        console.log(`WAV format: ${audioFormat}, channels: ${channels}, rate: ${sampleRate}, bits: ${bitsPerSample}`)
      } else if (chunkId === 'data') {
        dataOffset = offset + 8  // Skip chunk ID and size
        dataLength = chunkSize
        console.log(`Found data chunk: offset ${dataOffset}, length ${dataLength}`)
      }
      
      // Move to next chunk (chunk ID + chunk size + chunk data)
      offset += 8 + chunkSize
      
      // Handle padding byte if chunk size is odd
      if (chunkSize % 2 !== 0) {
        offset += 1
      }
    }
  } catch (error) {
    console.error('Error parsing WAV header:', error)
    throw new Error('Invalid WAV: error parsing header')
  }
  
  if (!foundFmt) {
    throw new Error('Invalid WAV: fmt chunk not found')
  }
  
  if (dataOffset === 0) {
    throw new Error('Invalid WAV: data chunk not found')
  }
  
  return {
    audioFormat,
    channels,
    sampleRate,
    bitsPerSample,
    dataOffset,
    dataLength
  }
}

// Helper function to validate WAV format
function validateWavFormat(wav: any): { isValid: boolean; error?: string } {
  // Debug information to console for troubleshooting
  console.log('WAV validation:', {
    audioFormat: wav.audioFormat,
    channels: wav.channels,
    sampleRate: wav.sampleRate,
    bitsPerSample: wav.bitsPerSample,
    dataLength: wav.dataLength
  })

  // Check audio format (1 = PCM)
  if (wav.audioFormat !== 1) {
    return { 
      isValid: false, 
      error: `Unsupported audio format: ${wav.audioFormat}. Only PCM (type 1) is supported. This may be a compressed format like MP3 or AAC.` 
    }
  }
  
  // Check sample rate (should be between 8kHz and 192kHz)
  if (wav.sampleRate < 8000 || wav.sampleRate > 192000) {
    return { 
      isValid: false, 
      error: `Invalid sample rate: ${wav.sampleRate} Hz. Must be between 8kHz and 192kHz.` 
    }
  }

  // Check bits per sample (support 8, 16, or 24 bit)
  if (![8, 16, 24].includes(wav.bitsPerSample)) {
    return { 
      isValid: false, 
      error: `Unsupported bits per sample: ${wav.bitsPerSample}. Only 8, 16, and 24-bit are supported.` 
    }
  }

  // Check channels (mono or stereo only)
  if (wav.channels < 1 || wav.channels > 2) {
    return { 
      isValid: false, 
      error: `Unsupported channel count: ${wav.channels}. Only mono and stereo are supported.` 
    }
  }

  // Check data length
  const minSamples = 100 // At least 100 samples
  const bytesPerSample = wav.bitsPerSample / 8
  const numSamples = wav.dataLength / bytesPerSample / wav.channels
  
  if (numSamples < minSamples) {
    return { 
      isValid: false, 
      error: `Sample too short: ${numSamples} samples. Minimum is ${minSamples} samples.` 
    }
  }

  return { isValid: true }
}

// Sample conversion with validation and truncation
export function convertWavToSP1200Format(
  wavBuffer: ArrayBuffer, 
  tuning: number = 0
): Uint8Array {
  // Parse and validate WAV header
  const wav = parseWavHeader(wavBuffer)
  console.log('WAV format:', wav)
  
  // Validate WAV format
  const validation = validateWavFormat(wav)
  if (!validation.isValid) {
    throw new Error(`Invalid WAV file: ${validation.error}`)
  }
  
  // Calculate pitch-adjusted sample rate for drop-sample resampling
  const pitchRatio = Math.pow(2, tuning / 12)
  const targetSampleRate = SP1200_SAMPLE_RATE * pitchRatio
  
  const view = new DataView(wavBuffer)
  const numInputSamples = Math.floor(wav.dataLength / (wav.bitsPerSample / 8) / wav.channels)
  
  // Calculate output samples with truncation to SP1200's max length
  const maxSeconds = SP1200_MAX_SECONDS
  const maxSamples = Math.floor(SP1200_SAMPLE_RATE * maxSeconds)
  const numOutputSamples = Math.min(
    Math.floor(numInputSamples * (targetSampleRate / wav.sampleRate)),
    maxSamples
  )
  
  if (numOutputSamples >= maxSamples) {
    console.warn(`Sample truncated to ${maxSeconds} seconds (${maxSamples} samples)`)
  }
  
  // Calculate required number of blocks (round up to block size)
  // SP-1200 data must be aligned to 256-byte blocks
  const numBytes = numOutputSamples * 2  // 2 bytes per sample
  const numBlocks = Math.ceil(numBytes / SP1200_BLOCK_SIZE)
  const outputBytes = numBlocks * SP1200_BLOCK_SIZE
  
  // Create output buffer
  const output = new Uint8Array(outputBytes)
  const outputView = new DataView(output.buffer)
  
  // Extract input samples
  const inputSamples: number[] = []
  for (let i = 0; i < numInputSamples; i++) {
    inputSamples.push(getSample(i, view, wav))
  }
  
  // Find peak value for normalization
  const peakValue = Math.max(...inputSamples.map(Math.abs))
  const normalizationFactor = peakValue > 0 ? 4095 / peakValue : 1
  
  // Resample to SP1200 format
  for (let i = 0; i < numOutputSamples; i++) {
    // Simple drop-sample resampling (same method used by SP-1200)
    const inputIndex = Math.floor(i * wav.sampleRate / targetSampleRate)
    const sample = inputSamples[Math.min(inputIndex, numInputSamples - 1)]
    
    // Convert to 12-bit unsigned (0-4095)
    // SP-1200 uses 12-bit unsigned samples with a bias of 2048
    const sample12bit = Math.min(4095, Math.max(0, 
      Math.round((sample + 32768) * normalizationFactor / 16)
    )) & 0x0FFF
    
    // Calculate position in output buffer (2 bytes per sample)
    const position = i * 2
    
    // Store as 16-bit word (only lower 12 bits used)
    outputView.setUint16(position, sample12bit, true)
  }
  
  // Fill remaining space with end markers
  for (let i = numOutputSamples * 2; i < outputBytes; i += 2) {
    outputView.setUint16(i, SP1200_END_MARKER, true)
  }
  
  return output
}

// Helper function to get sample value with proper channel handling
function getSample(index: number, view: DataView, wav: any): number {
  // Calculate sample offset in bytes
  const bytesPerSample = wav.bitsPerSample / 8
  const sampleOffset = wav.dataOffset + index * bytesPerSample * wav.channels
  
  // Ensure we don't read past the end of the buffer
  if (sampleOffset >= view.byteLength) {
    console.warn(`Sample index ${index} is out of bounds`)
    return 0
  }

  try {
    let sample = 0
    
    // Handle different bit depths
    if (wav.bitsPerSample === 8) {
      // 8-bit unsigned (0-255)
      sample = (view.getUint8(sampleOffset) - 128) / 128
    } else if (wav.bitsPerSample === 16) {
      // 16-bit signed (-32768 to 32767)
      sample = view.getInt16(sampleOffset, true) / 32768
    } else if (wav.bitsPerSample === 24) {
      // 24-bit signed (-8388608 to 8388607)
      const b1 = view.getUint8(sampleOffset)
      const b2 = view.getUint8(sampleOffset + 1)
      const b3 = view.getUint8(sampleOffset + 2)
      const value = (b1 | (b2 << 8) | (b3 << 16)) << 8 >> 8 // Sign extend
      sample = value / 8388608
    }
    
    // Handle stereo by mixing down to mono
    if (wav.channels === 2) {
      const rightSampleOffset = sampleOffset + bytesPerSample
      let rightSample = 0
      
      if (wav.bitsPerSample === 8) {
        rightSample = (view.getUint8(rightSampleOffset) - 128) / 128
      } else if (wav.bitsPerSample === 16) {
        rightSample = view.getInt16(rightSampleOffset, true) / 32768
      } else if (wav.bitsPerSample === 24) {
        const b1 = view.getUint8(rightSampleOffset)
        const b2 = view.getUint8(rightSampleOffset + 1)
        const b3 = view.getUint8(rightSampleOffset + 2)
        const value = (b1 | (b2 << 8) | (b3 << 16)) << 8 >> 8
        rightSample = value / 8388608
      }
      
      // Mix down to mono (average of left and right)
      sample = (sample + rightSample) / 2
    }
    
    return sample
  } catch (error) {
    console.error('Error reading sample:', error)
    return 0
  }
}

// Helper function to convert 12-bit SP-1200 samples to 16-bit
function convert12BitTo16Bit(data: Uint8Array): Int16Array {
  const numSamples = data.length / 2
  const output = new Int16Array(numSamples)
  const view = new DataView(data.buffer)
  
  for (let i = 0; i < numSamples; i++) {
    // Read 12-bit value (stored in 16-bit word)
    const value = view.getUint16(i * 2, true) & 0x0FFF
    
    // Convert to 16-bit signed (-32768 to 32767)
    // SP-1200 uses 12-bit unsigned (0-4095) with a bias of 2048
    output[i] = ((value - 2048) * 16) & 0xFFFF
  }
  
  return output
}

// Create a single sample file
export function createSP1200SampleFile(sample: SP1200Sample): ArrayBuffer {
  const buffer = new ArrayBuffer(SP1200_DISK_SIZE)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  
  // Initialize with zeros
  bytes.fill(0)
  
  // Write header
  view.setUint16(0, SP1200_MAGIC, true)
  view.setUint16(2, 1, true) // One sample
  view.setUint16(4, 0, true) // No sequences
  
  // Write pad entry
  const padEntryOffset = SP1200_PAD_TABLE_OFFSET
  const nameBytes = new TextEncoder().encode(sample.name.slice(0, 12))
  bytes.set(nameBytes, padEntryOffset)
  
  const numWords = Math.floor(sample.data.length / 2)
  view.setUint32(padEntryOffset + 0x0C, numWords, true)
  view.setUint32(padEntryOffset + 0x10, SP1200_SAMPLE_DATA_OFFSET, true)
  
  // Write sample data
  bytes.set(sample.data, SP1200_SAMPLE_DATA_OFFSET)
  
  return buffer
}

// Parse a single sample file
export function parseSP1200File(fileData: ArrayBuffer): SP1200Sample {
  const view = new DataView(fileData)
  
  // Check magic number
  const magic = view.getUint16(0, true)
  if (magic !== (SP1200_MAGIC & 0xFFFF)) {
    throw new Error('Invalid SP-1200 file: wrong magic number')
  }
  
  // Read pad entry
  const padEntryOffset = SP1200_PAD_TABLE_OFFSET
  let name = ''
  for (let i = 0; i < 12; i++) {
    const char = view.getUint8(padEntryOffset + i)
    if (char === 0) break
    name += String.fromCharCode(char)
  }
  
  const numWords = view.getUint32(padEntryOffset + 0x0C, true)
  const sampleOffset = view.getUint32(padEntryOffset + 0x10, true)
  
  // Read sample data
  const sampleData = new Uint8Array(numWords * 2)
  for (let i = 0; i < numWords * 2; i++) {
    sampleData[i] = view.getUint8(sampleOffset + i)
  }
  
  return {
    name: name.trim(),
    bank: 'A',
    padNumber: 1,
    data: sampleData,
    sampleRate: SP1200_SAMPLE_RATE,
    bitsPerSample: 12,
    length: numWords
  }
}

// Parse a disk image
export function parseSP1200Disk(diskData: ArrayBuffer): SP1200Disk {
  const view = new DataView(diskData)
  
  // Check magic number
  const magic = view.getUint16(0, true)
  if (magic !== (SP1200_MAGIC & 0xFFFF)) {
    throw new Error('Invalid SP-1200 disk: wrong magic number')
  }
  
  // Read number of samples and sequences
  const numSamples = view.getUint16(2, true)
  const numSequences = view.getUint16(4, true)
  
  const samples: SP1200Sample[] = []
  const sequences: SP1200Sequence[] = []
  
  // Read samples
  for (let i = 0; i < numSamples; i++) {
    const padEntryOffset = SP1200_PAD_TABLE_OFFSET + (i * SP1200_PAD_ENTRY_SIZE)
    
    // Read name
    let name = ''
    for (let j = 0; j < 12; j++) {
      const char = view.getUint8(padEntryOffset + j)
      if (char === 0) break
      name += String.fromCharCode(char)
    }
    
    // Read sample info
    const numWords = view.getUint32(padEntryOffset + 0x0C, true)
    const sampleOffset = view.getUint32(padEntryOffset + 0x10, true)
    const bankIndex = view.getUint8(padEntryOffset + 0x14)
    const padNumber = view.getUint8(padEntryOffset + 0x15) + 1
    
    // Read sample data
    const sampleData = new Uint8Array(numWords * 2)
    for (let j = 0; j < numWords * 2; j++) {
      sampleData[j] = view.getUint8(sampleOffset + j)
    }
    
    samples.push({
      name: name.trim(),
      bank: ['A', 'B', 'C', 'D'][bankIndex] as SP1200Bank,
      padNumber,
      data: sampleData,
      sampleRate: SP1200_SAMPLE_RATE,
      bitsPerSample: 12,
      length: numWords
    })
  }
  
  return { samples, sequences }
}

// Create a disk image
export function createSP1200File(sample: SP1200Sample): ArrayBuffer {
  return createSP1200SampleFile(sample)
} 