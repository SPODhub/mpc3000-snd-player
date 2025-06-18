// WAV format validation and conversion
async function validateAndConvertWav(file: File): Promise<AudioBuffer> {
  // Create an audio context
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  // Read the file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  
  // Check if it's a valid WAV file
  const view = new DataView(arrayBuffer);
  const riff = new TextDecoder().decode(new Uint8Array(arrayBuffer.slice(0, 4)));
  const wave = new TextDecoder().decode(new Uint8Array(arrayBuffer.slice(8, 12)));
  
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new Error('Invalid WAV file: missing RIFF or WAVE header');
  }
  
  // Find the format chunk
  let offset = 12;
  let formatChunk: { format: number; channels: number; sampleRate: number; bitsPerSample: number } | null = null;
  
  while (offset < view.byteLength) {
    const chunkId = new TextDecoder().decode(new Uint8Array(arrayBuffer.slice(offset, offset + 4)));
    const chunkSize = view.getUint32(offset + 4, true);
    
    if (chunkId === 'fmt ') {
      formatChunk = {
        format: view.getUint16(offset + 8, true),
        channels: view.getUint16(offset + 10, true),
        sampleRate: view.getUint32(offset + 12, true),
        bitsPerSample: view.getUint16(offset + 22, true)
      };
      break;
    }
    
    offset += 8 + chunkSize;
  }
  
  if (!formatChunk) {
    throw new Error('Invalid WAV file: missing format chunk');
  }
  
  // Validate format
  if (formatChunk.format !== 1) {
    throw new Error('Only PCM WAV files are supported');
  }
  
  if (formatChunk.bitsPerSample !== 16) {
    throw new Error('Only 16-bit WAV files are supported');
  }
  
  // Decode the audio data
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  // Convert to mono if stereo
  if (audioBuffer.numberOfChannels > 1) {
    const monoData = new Float32Array(audioBuffer.length);
    const leftChannel = audioBuffer.getChannelData(0);
    const rightChannel = audioBuffer.getChannelData(1);
    
    for (let i = 0; i < audioBuffer.length; i++) {
      monoData[i] = (leftChannel[i] + rightChannel[i]) / 2;
    }
    
    const monoBuffer = audioContext.createBuffer(1, audioBuffer.length, audioBuffer.sampleRate);
    monoBuffer.copyToChannel(monoData, 0);
    return monoBuffer;
  }
  
  return audioBuffer;
}

/**
 * Converts a WAV file to MPC3000/S3000 SND format.
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
export async function convertToSnd(file: File): Promise<Blob> {
  // Create audio context
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
  
  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    
    // Decode audio data
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    
    // Convert to mono if stereo
    let monoData: Float32Array
    if (audioBuffer.numberOfChannels === 2) {
      const left = audioBuffer.getChannelData(0)
      const right = audioBuffer.getChannelData(1)
      monoData = new Float32Array(left.length)
      for (let i = 0; i < left.length; i++) {
        monoData[i] = (left[i] + right[i]) / 2
      }
    } else {
      monoData = audioBuffer.getChannelData(0)
    }
    
    // Convert to 16-bit PCM
    const pcmData = new Int16Array(monoData.length)
    for (let i = 0; i < monoData.length; i++) {
      const s = Math.max(-1, Math.min(1, monoData[i]))
      pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }
    
    // Create S3000/MPC3000 header (192 bytes)
    const header = new ArrayBuffer(192)
    const view = new DataView(header)
    
    // First byte: 3
    view.setUint8(0, 3)
    
    // Second byte: 1 for 44.1kHz, 0 for 22.05kHz
    view.setUint8(1, audioBuffer.sampleRate === 44100 ? 1 : 0)
    
    // Third byte: MIDI root note (C3=60)
    view.setUint8(2, 60)
    
    // Filename (12 bytes, AKAII format)
    const filename = file.name.replace(/\.[^/.]+$/, '').slice(0, 12).padEnd(12, ' ')
    for (let i = 0; i < 12; i++) {
      view.setUint8(3 + i, filename.charCodeAt(i))
    }
    
    // Loop settings
    view.setUint8(15, 128) // Always 128
    view.setUint8(16, 0)   // Number of active loops
    view.setUint8(17, 0)   // First active loop
    view.setUint8(18, 0)   // Always 0
    view.setUint8(19, 2)   // Loop mode: 2=none
    
    // Tuning
    view.setInt8(20, 0)    // Cents tune
    view.setInt8(21, 0)    // Semi tune
    
    // Fixed values
    view.setUint8(22, 0)
    view.setUint8(23, 8)
    view.setUint8(24, 2)
    view.setUint8(25, 0)
    
    // Sample length and markers
    view.setUint32(26, pcmData.length, false)  // Number of sample words (big-endian)
    view.setUint32(30, 0, false)               // Start marker (big-endian)
    view.setUint32(34, pcmData.length, false)  // End marker (big-endian)
    
    // Loop 1 (and others) set to 0
    for (let i = 0; i < 7; i++) {
      const offset = 38 + (i * 12)
      view.setUint32(offset, 0, false)     // Loop marker (big-endian)
      view.setUint16(offset + 4, 0, false) // Fine length (big-endian)
      view.setUint32(offset + 6, 0, false) // Coarse length (big-endian)
      view.setUint16(offset + 10, 0, false) // Time (big-endian)
    }
    
    // End markers
    view.setUint8(182, 0)
    view.setUint8(183, 0)
    view.setUint8(184, 255)
    view.setUint8(185, 255)
    
    // Sampling frequency (big-endian)
    view.setUint16(186, audioBuffer.sampleRate, false)
    
    // Loop tune offset
    view.setInt8(188, 0)
    
    // Remaining bytes set to 0
    for (let i = 189; i < 192; i++) {
      view.setUint8(i, 0)
    }
    
    // Combine header and PCM data
    const sndFile = new Blob([header, pcmData.buffer], { type: 'audio/snd' })
    
    return sndFile
  } finally {
    audioContext.close()
  }
} 