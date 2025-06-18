import { NextRequest, NextResponse } from 'next/server'
import { convertWavToSP1200Format, diskBuilder, SP1200PadAssignment } from '@/app/lib/sp1200'

// SP-1200 constants
const SP1200_HEADER_SIZE = 128
const SP1200_MAGIC = 0x1200 // Correct magic number for SP-1200
const SP1200_SAMPLE_RATE = 26040
const SP1200_MAX_SAMPLES = Math.floor(SP1200_SAMPLE_RATE * 2.5) // 2.5 seconds max

function createSP1200Header(sampleName: string, sampleLength: number): Uint8Array {
  const header = new Uint8Array(SP1200_HEADER_SIZE).fill(0) // Initialize with zeros
  const view = new DataView(header.buffer)
  
  // Write magic number at offset 0 (0x1200)
  view.setUint16(0, SP1200_MAGIC, true)
  
  // Write sample length in bytes at offset 2
  view.setUint32(2, sampleLength, true)
  
  // Write sample name (padded with zeros) at offset 6
  const nameBytes = new TextEncoder().encode(sampleName.slice(0, 12))
  header.set(nameBytes, 6)
  
  // Set sample rate at offset 20
  view.setUint32(20, SP1200_SAMPLE_RATE, true)
  
  // Set bits per sample at offset 24 (12-bit = 12)
  view.setUint16(24, 12, true)
  
  // Set number of channels at offset 26 (mono = 1)
  view.setUint16(26, 1, true)
  
  return header
}

function createWavHeader(dataLength: number, sampleRate = 26040, bitsPerSample = 16): ArrayBuffer {
  const headerLength = 44;
  const buffer = new ArrayBuffer(headerLength);
  const view = new DataView(buffer);

  // RIFF chunk
  view.setUint8(0, 0x52); // 'R'
  view.setUint8(1, 0x49); // 'I'
  view.setUint8(2, 0x46); // 'F'
  view.setUint8(3, 0x46); // 'F'
  view.setUint32(4, dataLength + 36, true); // Chunk size
  view.setUint8(8, 0x57); // 'W'
  view.setUint8(9, 0x41); // 'A'
  view.setUint8(10, 0x56); // 'V'
  view.setUint8(11, 0x45); // 'E'

  // fmt chunk
  view.setUint8(12, 0x66); // 'f'
  view.setUint8(13, 0x6D); // 'm'
  view.setUint8(14, 0x74); // 't'
  view.setUint8(15, 0x20); // ' '
  view.setUint32(16, 16, true); // Chunk size
  view.setUint16(20, 1, true); // Audio format (PCM)
  view.setUint16(22, 1, true); // Number of channels
  view.setUint32(24, sampleRate, true); // Sample rate
  view.setUint32(28, sampleRate * (bitsPerSample / 8), true); // Byte rate
  view.setUint16(32, bitsPerSample / 8, true); // Block align
  view.setUint16(34, bitsPerSample, true); // Bits per sample

  // data chunk
  view.setUint8(36, 0x64); // 'd'
  view.setUint8(37, 0x61); // 'a'
  view.setUint8(38, 0x74); // 't'
  view.setUint8(39, 0x61); // 'a'
  view.setUint32(40, dataLength, true); // Chunk size

  return buffer;
}

function findWavDataChunk(buffer: ArrayBuffer): { dataOffset: number, dataLength: number } {
  const view = new DataView(buffer)
  let offset = 12 // Skip RIFF header
  
  while (offset < buffer.byteLength) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    )
    const chunkSize = view.getUint32(offset + 4, true)
    
    if (chunkId === 'data') {
      return {
        dataOffset: offset + 8,
        dataLength: chunkSize
      }
    }
    
    offset += 8 + chunkSize
    // Ensure word alignment
    if (offset % 2) offset++
  }
  
  throw new Error('No data chunk found in WAV file')
}

function convert12BitTo16Bit(data: Uint8Array): Uint8Array {
  const numSamples = Math.floor(data.length * 2 / 3)
  const output = new Uint8Array(numSamples * 2)
  
  for (let i = 0; i < data.length - 2; i += 3) {
    // Extract two 12-bit samples from three bytes
    const byte1 = data[i]
    const byte2 = data[i + 1]
    const byte3 = data[i + 2]
    
    // First 12-bit sample: byte1 + lower 4 bits of byte2
    const sample1 = ((byte2 & 0x0F) << 8) | byte1
    
    // Second 12-bit sample: byte3 + upper 4 bits of byte2
    const sample2 = (byte3 << 4) | (byte2 >> 4)
    
    // Convert to 16-bit signed values (SP-1200 uses unsigned 12-bit)
    const sample1_16bit = Math.floor((sample1 - 2048) * (32768 / 2048))
    const sample2_16bit = Math.floor((sample2 - 2048) * (32768 / 2048))
    
    // Write samples in little-endian format
    const j = (i / 3) * 4
    output[j] = sample1_16bit & 0xFF
    output[j + 1] = (sample1_16bit >> 8) & 0xFF
    output[j + 2] = sample2_16bit & 0xFF
    output[j + 3] = (sample2_16bit >> 8) & 0xFF
  }
  
  return output
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const bank = formData.get('bank') as string | null
    const padNumber = formData.get('padNumber') ? parseInt(formData.get('padNumber') as string) : null
    const tuning = parseInt(formData.get('tuning') as string || '0')
    const createDisk = formData.get('createDisk') === 'true'

    // If createDisk is true and no file is provided, create disk image from existing samples
    if (createDisk && !file) {
      const diskImage = diskBuilder.createDiskImage()
      return new NextResponse(diskImage, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment; filename="sp1200_disk.sp12"'
        }
      })
    }

    // Otherwise, we need a file, bank, and pad number for sample upload
    if (!file || !bank || !padNumber) {
      return new NextResponse('Missing required fields', { status: 400 })
    }

    console.log('Processing file:', file.name, 'Size:', file.size, 'Type:', file.type)
    
    const buffer = await file.arrayBuffer()
    console.log('Buffer size:', buffer.byteLength)
    
    // Convert WAV to SP-1200 format
    const sp1200Data = convertWavToSP1200Format(buffer, tuning)
    console.log('SP-1200 data size:', sp1200Data.length)
    
    // Add to disk builder
    diskBuilder.addSample({
      name: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
      bank: bank as 'A' | 'B',
      padNumber,
      data: sp1200Data,
      metadata: {
        tuning,
        volume: 255, // Default to max volume
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        truncStart: 0,
        truncEnd: 0
      }
    })
    
    if (createDisk) {
      // Create disk image with all samples
      const diskImage = diskBuilder.createDiskImage()
      
      return new NextResponse(diskImage, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment; filename="sp1200_disk.sp12"'
        }
      })
    } else {
      // Return just the converted sample
      return new NextResponse(sp1200Data, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${file.name}.sp12"`
        }
      })
    }
  } catch (error) {
    console.error('Error processing file:', error)
    return new NextResponse(error instanceof Error ? error.message : 'Unknown error', { 
      status: 500 
    })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { bank, padNumber } = await req.json()
    
    if (!bank || !padNumber) {
      return new NextResponse('Missing bank or pad number', { status: 400 })
    }
    
    diskBuilder.removeSample(bank, padNumber)
    return new NextResponse('Sample removed', { status: 200 })
  } catch (error) {
    return new NextResponse(error instanceof Error ? error.message : 'Unknown error', { 
      status: 500 
    })
  }
}

export async function GET(req: NextRequest) {
  try {
    const assignments = diskBuilder.getPadAssignments()
    return NextResponse.json(assignments.map((a: SP1200PadAssignment) => ({
      name: a.name,
      bank: a.bank,
      padNumber: a.padNumber,
      metadata: a.metadata
    })))
  } catch (error) {
    return new NextResponse(error instanceof Error ? error.message : 'Unknown error', { 
      status: 500 
    })
  }
} 