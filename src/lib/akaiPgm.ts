export interface PgmPad {
  padNumber: number;
  sampleName: string;
  tuning: number;
  volume: number;
  pan: number;
  // Add any additional parameters as needed
}

export interface PgmProgram {
  name: string;
  pads: PgmPad[];
}

// Parse an Akai MPC 3000 program file (.PGM) and return a PgmProgram object
export function parsePgmFile(buffer: ArrayBuffer): PgmProgram {
  const decoder = new TextDecoder('ascii');
  const bytes = new Uint8Array(buffer);

  // The first two bytes may be a header/version, then pad sample names start
  let offset = 0;
  if (bytes[0] < 0x20 && bytes[1] < 0x20) {
    // Likely a header/version, skip first 2 bytes
    offset = 2;
  }

  // There are 32 pads in MPC3000 OS, but most programs use 16. We'll parse 32 for future-proofing.
  const padCount = 32;
  const pads: PgmPad[] = [];

  for (let i = 0; i < padCount; i++) {
    // Each sample name is up to 12 bytes, padded with spaces, and may be prefixed by a null byte
    let nameStart = offset + i * 16;
    let nameBytes = bytes.slice(nameStart, nameStart + 16);
    // Remove leading null or space
    while (nameBytes.length && (nameBytes[0] === 0x00 || nameBytes[0] === 0x20)) nameBytes = nameBytes.slice(1);
    // Remove trailing null or space
    while (nameBytes.length && (nameBytes[nameBytes.length - 1] === 0x00 || nameBytes[nameBytes.length - 1] === 0x20)) nameBytes = nameBytes.slice(0, -1);
    const sampleName = decoder.decode(nameBytes);

    // Extract tuning, volume, and pan from the PGM file
    // Assuming these parameters are stored after the sample names
    const tuningOffset = offset + padCount * 16 + i * 4; // Adjust based on actual file structure
    const volumeOffset = tuningOffset + 1;
    const panOffset = volumeOffset + 1;

    const tuning = bytes[tuningOffset];
    const volume = bytes[volumeOffset];
    const pan = bytes[panOffset];

    pads.push({ padNumber: i + 1, sampleName, tuning, volume, pan });
  }

  // Program name is not always present in the same place, so we use the filename or a placeholder
  const programName = 'MPC3000 Program';

  return {
    name: programName,
    pads: pads.filter(pad => pad.sampleName.length > 0),
  };
} 