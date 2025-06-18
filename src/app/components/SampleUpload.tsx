'use client'

import { useCallback, useState } from 'react'
import { useDropzone, FileRejection } from 'react-dropzone'
import { diskBuilder, convertWavToSP1200Format, SP1200Bank, SP1200_MAX_SECONDS } from '@/app/lib/sp1200'
import { Upload, X, Grip, Play, Pause, Download, Save, AlertCircle, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface SampleUploadProps {
  onAssignmentsChange?: () => void
}

const SampleUpload = ({ onAssignmentsChange }: SampleUploadProps) => {
  const [selectedBank, setSelectedBank] = useState<SP1200Bank>('A')
  const [selectedPad, setSelectedPad] = useState(1)
  const [tuning, setTuning] = useState(0)
  const [dragOverPad, setDragOverPad] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isTruncated, setIsTruncated] = useState(false)
  const [showWavHelp, setShowWavHelp] = useState(false)

  const onDrop = useCallback(async (acceptedFiles: File[], fileRejections: FileRejection[]) => {
    // Clear previous messages
    setError(null)
    setIsTruncated(false)
    
    if (fileRejections.length > 0) {
      setError(`File rejected: ${fileRejections[0].errors[0].message}`);
      return;
    }

    for (const file of acceptedFiles) {
      try {
        // Verify file MIME type
        if (!file.type.includes('audio/wav') && !file.type.includes('audio/x-wav')) {
          setError(`Invalid file type: ${file.type}. Only WAV files are supported.`);
          continue;
        }
        
        // Estimate if the file might be too long (assuming 16-bit stereo)
        const estimatedDuration = file.size / (44100 * 4); // Size / (sample rate * bytes per sample * channels)
        const willBeTruncated = estimatedDuration > SP1200_MAX_SECONDS;
        
        console.log('Processing WAV file:', {
          name: file.name,
          size: file.size,
          type: file.type,
          estimatedDuration
        });
        
        // Convert the file
        const buffer = await file.arrayBuffer()
        
        // Check buffer size
        if (buffer.byteLength < 44) { // Minimum WAV header size
          setError(`File "${file.name}" is too small to be a valid WAV file (${buffer.byteLength} bytes)`);
          continue;
        }
        
        try {
          const convertedData = convertWavToSP1200Format(buffer, tuning)
          
          // Add sample to disk builder
          diskBuilder.addSample({
            bank: selectedBank,
            padNumber: selectedPad,
            name: file.name.slice(0, 12),
            data: convertedData,
            metadata: {
              tuning,
              volume: 255,
              loop: false,
              loopStart: 0,
              loopEnd: 0,
              truncStart: 0,
              truncEnd: 0
            }
          })
          
          // Notify if truncated
          if (willBeTruncated) {
            setIsTruncated(true);
          }
          
          onAssignmentsChange?.()
        } catch (conversionError: any) {
          console.error('Error converting WAV file:', conversionError);
          setError(`Error processing "${file.name}": ${conversionError.message}`);
        }
      } catch (error: any) {
        console.error('Error processing file:', error)
        setError(error.message || 'Error processing WAV file')
      }
    }
  }, [selectedBank, selectedPad, tuning, onAssignmentsChange])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/wav': ['.wav']
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    multiple: true
  })

  const handlePadDrop = useCallback((e: React.DragEvent, bank: SP1200Bank, pad: number) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedBank(bank)
    setSelectedPad(pad)
    setDragOverPad(null)
  }, [])

  const handlePadDragOver = useCallback((e: React.DragEvent, bank: SP1200Bank, pad: number) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverPad(`${bank}${pad}`)
  }, [])

  const handlePadDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverPad(null)
  }, [])

  const handleRemoveSample = useCallback((bank: SP1200Bank, pad: number) => {
    diskBuilder.removeSample(bank, pad)
    onAssignmentsChange?.()
  }, [onAssignmentsChange])

  const toggleWavHelp = useCallback(() => {
    setShowWavHelp(prev => !prev)
  }, [])

  const handleCreateDiskImage = async () => {
    const diskImage = diskBuilder.createDiskImage()
    const blob = new Blob([diskImage], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sp1200_disk.sp12'
    document.body.appendChild(a)
    a.click()
    URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  const padAssignments = diskBuilder.getPadAssignments()

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Sample Upload</h3>
        <Button
          onClick={handleCreateDiskImage}
          disabled={padAssignments.length === 0}
          className="bg-zinc-700 hover:bg-zinc-600"
        >
          <Save className="mr-2 h-4 w-4" />
          Create Disk Image
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-2">Bank</label>
          <select
            value={selectedBank}
            onChange={(e) => setSelectedBank(e.target.value as SP1200Bank)}
            className="w-full bg-zinc-800 rounded-md border-zinc-700 text-white"
          >
            <option value="A">Bank A</option>
            <option value="B">Bank B</option>
            <option value="C">Bank C</option>
            <option value="D">Bank D</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium mb-2">Pad</label>
          <select
            value={selectedPad}
            onChange={(e) => setSelectedPad(Number(e.target.value))}
            className="w-full bg-zinc-800 rounded-md border-zinc-700 text-white"
          >
            {Array.from({ length: 8 }, (_, i) => i + 1).map(pad => (
              <option key={pad} value={pad}>Pad {pad}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium mb-2">Tuning</label>
          <select
            value={tuning}
            onChange={(e) => setTuning(Number(e.target.value))}
            className="w-full bg-zinc-800 rounded-md border-zinc-700 text-white"
          >
            {Array.from({ length: 25 }, (_, i) => i - 12).map(semitones => (
              <option key={semitones} value={semitones}>
                {semitones > 0 ? `+${semitones}` : semitones} semitones
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Upload WAV Samples</h3>
        <button 
          onClick={toggleWavHelp}
          className="text-xs flex items-center text-blue-400 hover:text-blue-300"
        >
          <Info size={14} className="mr-1" />
          WAV File Help
        </button>
      </div>

      {showWavHelp && (
        <div className="bg-zinc-900/60 border border-zinc-700 rounded-md p-4 text-sm">
          <h4 className="font-semibold mb-2">WAV File Requirements</h4>
          <ul className="list-disc pl-5 space-y-1 text-xs text-gray-300">
            <li>Files must be standard <strong>uncompressed PCM WAV</strong> format</li>
            <li>Supported bit depths: 8-bit, 16-bit, or 24-bit</li>
            <li>Supported channels: mono or stereo (stereo will be mixed down)</li>
            <li>Maximum length: {SP1200_MAX_SECONDS} seconds (longer files will be truncated)</li>
            <li>Sample rate will be converted to 26.04kHz (the SP-1200's native rate)</li>
          </ul>
          <h4 className="font-semibold mt-3 mb-2">Troubleshooting</h4>
          <ul className="list-disc pl-5 space-y-1 text-xs text-gray-300">
            <li>If you see <em>"fmt chunk not found"</em>, your file may use a non-standard format or compression</li>
            <li>Try re-exporting from your DAW as 16-bit PCM WAV</li>
            <li>Ensure your file has a proper WAV header (some editors create non-standard files)</li>
            <li>MP3s, AAC, FLAC or other compressed formats converted to WAV may not work</li>
          </ul>
        </div>
      )}

      <div {...getRootProps()} className={`
        border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
        transition-colors duration-200
        ${isDragActive ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-700 hover:border-zinc-600'}
      `}>
        <input {...getInputProps()} />
        <p className="text-sm text-gray-400">
          Drag & drop WAV files here, or click to select files
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Files longer than {SP1200_MAX_SECONDS} seconds will be truncated
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Supports uncompressed PCM WAV files (8/16/24-bit, mono/stereo)
        </p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-md p-3 flex items-start gap-2">
          <AlertCircle size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
      
      {isTruncated && !error && (
        <div className="bg-yellow-900/30 border border-yellow-800 rounded-md p-3 flex items-start gap-2">
          <AlertCircle size={18} className="text-yellow-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-yellow-400">
            Sample was longer than {SP1200_MAX_SECONDS} seconds and has been truncated to match SP-1200 limits.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        {(['A', 'B', 'C', 'D'] as SP1200Bank[]).map(bank => (
          <div key={bank} className="space-y-4">
            <h3 className="text-lg font-semibold">Bank {bank}</h3>
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 8 }, (_, i) => i + 1).map(pad => {
                const assignment = padAssignments.find(
                  a => a.bank === bank && a.padNumber === pad
                )
                
                return (
                  <div
                    key={`${bank}${pad}`}
                    onDrop={(e) => handlePadDrop(e, bank, pad)}
                    onDragOver={(e) => handlePadDragOver(e, bank, pad)}
                    onDragLeave={handlePadDragLeave}
                    className={`
                      h-24 flex flex-col items-center justify-center
                      rounded-lg p-4 transition-colors duration-200
                      ${dragOverPad === `${bank}${pad}` 
                        ? 'border-2 border-blue-500 bg-blue-500/10' 
                        : assignment
                          ? 'bg-zinc-700'
                          : 'bg-zinc-800 border-2 border-dashed border-zinc-700'}
                    `}
                  >
                    <span className="text-lg font-bold mb-1">
                      {bank}{pad}
                    </span>
                    {assignment ? (
                      <>
                        <span className="text-xs text-gray-400 truncate w-full text-center">
                          {assignment.name}
                        </span>
                        <button
                          onClick={() => handleRemoveSample(bank, pad)}
                          className="mt-2 text-xs text-red-500 hover:text-red-400"
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-gray-500">
                        Empty
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default SampleUpload 