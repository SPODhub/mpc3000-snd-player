'use client'

import { useState, useRef, useEffect } from 'react'
import SndPlayer from '@/components/SndPlayer'
import { convertToSnd } from '@/lib/audioConverter'

export default function Home() {
  const [loadedSndFile, setLoadedSndFile] = useState<{ file: Blob, name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const playerInputRef = useRef<HTMLInputElement>(null)

  // Prevent default drag-and-drop behavior globally
  useEffect(() => {
    const preventDefault = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('dragover', preventDefault);
    window.addEventListener('drop', preventDefault);
    return () => {
      window.removeEventListener('dragover', preventDefault);
      window.removeEventListener('drop', preventDefault);
    };
  }, []);

  const handleFile = async (file: File) => {
    setError(null)
    setIsConverting(false)

    try {
      if (file.name.toLowerCase().endsWith('.snd')) {
        setLoadedSndFile({ file, name: file.name })
      } else if (file.name.toLowerCase().endsWith('.wav')) {
        setIsConverting(true)
        const sndBlob = await convertToSnd(file)
        setLoadedSndFile({ 
          file: sndBlob, 
          name: file.name.replace(/\.wav$/i, '.snd') 
        })
      } else {
        setError('Please select a WAV or SND file.')
      }
    } catch (err) {
      console.error('Error processing file:', err)
      setError(err instanceof Error ? err.message : 'Error processing file')
    } finally {
      setIsConverting(false)
    }
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">MPC3000 SND Player</h1>
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">SND Player</h2>
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              playerInputRef.current?.click();
            }}
          >
            <input
              type="file"
              ref={playerInputRef}
              onChange={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
              accept=".snd,.wav"
              className="hidden"
            />
            <p className="text-gray-600">
              {isConverting ? (
                'Converting WAV to SND...'
              ) : (
                'Drop a WAV or SND file here or click to select'
              )}
            </p>
          </div>
          {error && (
            <p className="mt-4 text-red-600">{error}</p>
          )}
          {loadedSndFile && (
            <div className="mt-4">
              <h3 className="font-semibold mb-2">Currently Playing:</h3>
              <p className="text-sm text-gray-600 mb-4">{loadedSndFile.name}</p>
              <SndPlayer sndFile={loadedSndFile.file} />
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
