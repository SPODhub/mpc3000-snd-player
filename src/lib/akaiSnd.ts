import { WaveFile } from 'wavefile';

export interface SndSample {
  name: string;
  sampleRate: number;
  bitDepth: number;
  channels: number;
  data: Int16Array;
}

// Parse Akai SND file to SndSample
export function parseSndFile(buffer: ArrayBuffer): SndSample {
  const view = new DataView(buffer);
  // SND header is 16 bytes:
  // - 4 bytes: magic number (0x2E736E64)
  // - 4 bytes: header size (usually 24)
  // - 4 bytes: data size
  // - 4 bytes: format (0 = 8-bit, 1 = 16-bit, 2 = 24-bit, 3 = 32-bit)
  // - 4 bytes: sample rate
  // - 4 bytes: channels
  const magic = view.getUint32(0, false);
  if (magic !== 0x2E736E64) {
    throw new Error('Invalid SND file: wrong magic number');
  }
  const headerSize = view.getUint32(4, false);
  const dataSize = view.getUint32(8, false);
  const format = view.getUint32(12, false);
  const sampleRate = view.getUint32(16, false);
  const channels = view.getUint32(20, false);
  // Read sample data starting at headerSize
  const data = new Int16Array(buffer.slice(headerSize, headerSize + dataSize));
  return {
    name: 'sample',
    sampleRate,
    bitDepth: format === 1 ? 16 : 8,
    channels,
    data,
  };
}

// Create Akai SND file from SndSample
export function createSndFile(sample: SndSample): ArrayBuffer {
  const headerSize = 24;
  const dataSize = sample.data.byteLength;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);
  // Write SND header
  view.setUint32(0, 0x2E736E64, false); // magic
  view.setUint32(4, headerSize, false); // header size
  view.setUint32(8, dataSize, false);   // data size
  view.setUint32(12, sample.bitDepth === 16 ? 1 : 0, false); // format
  view.setUint32(16, sample.sampleRate, false); // sample rate
  view.setUint32(20, sample.channels, false);   // channels
  // Write sample data
  const dataView = new Int16Array(buffer, headerSize);
  dataView.set(sample.data);
  return buffer;
}

// Convert SND to WAV (returns a WaveFile instance)
export function sndToWav(snd: SndSample): WaveFile {
  const wav = new WaveFile();
  wav.fromScratch(
    snd.channels,
    snd.sampleRate,
    '16',
    snd.data as unknown as Int16Array
  );
  return wav;
}

// Convert WAV (WaveFile) to SndSample
export function wavToSnd(wav: WaveFile): SndSample {
  const samples = wav.getSamples()[0] as Int16Array;
  const fmt = wav.fmt as any;
  return {
    name: fmt?.str || 'sample',
    sampleRate: fmt?.sampleRate || 44100,
    bitDepth: 16,
    channels: fmt?.numChannels || 1,
    data: samples,
  };
} 