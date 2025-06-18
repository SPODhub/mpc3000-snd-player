'use client'

import { useState, useRef, useEffect } from 'react'
import { SP1200Player } from '@/app/lib/sp1200Player'
import { SP1200Bank } from '@/app/lib/sp1200'

export default function SP1200PlayerComponent() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const playerRef = useRef<SP1200Player | null>(null)
  const [padInfo, setPadInfo] = useState<{[key: string]: {
    name: string,
    hasSample: boolean
  }}>({})

  useEffect(() => {
    playerRef.current = new SP1200Player()
    updatePadInfo() // Initialize empty pads
  }, [])

  const updatePadInfo = () => {
    if (!playerRef.current) return

    const info: {[key: string]: {name: string, hasSample: boolean}} = {}
    const banks: SP1200Bank[] = ['A', 'B', 'C', 'D']
    
    for (const bank of banks) {
      for (let pad = 1; pad <= 8; pad++) {
        const sampleInfo = playerRef.current.getSampleInfo(bank, pad)
        if (sampleInfo) {
          info[`${bank}${pad}`] = {
            name: sampleInfo.name,
            hasSample: sampleInfo.hasSample
          }
        }
      }
    }
    
    setPadInfo(info)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !playerRef.current) return

    setSelectedFile(file)
    
    try {
      const buffer = await file.arrayBuffer()
      await playerRef.current.loadDiskImage(buffer)
      updatePadInfo()
    } catch (error) {
      console.error('Error loading disk image:', error)
    }
  }

  const handlePadClick = async (bank: SP1200Bank, pad: number) => {
    if (!playerRef.current) return
    
    try {
      await playerRef.current.resume()
      await playerRef.current.playSample(bank, pad)
    } catch (error) {
      console.error('Error playing sample:', error)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">SP-1200 Disk Player</h3>
        <input
          type="file"
          accept=".sp12"
          onChange={handleFileSelect}
          className="text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-zinc-700 file:text-white hover:file:bg-zinc-600"
        />
      </div>

      {selectedFile && (
        <p className="text-sm text-gray-400">
          Loaded: {selectedFile.name}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6">
        {(['A', 'B', 'C', 'D'] as SP1200Bank[]).map(bank => (
          <div key={bank} className="space-y-4">
            <h4 className="font-semibold">Bank {bank}</h4>
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 8 }, (_, i) => i + 1).map(pad => {
                const key = `${bank}${pad}`
                const info = padInfo[key]
                
                return (
                  <button
                    key={key}
                    onClick={() => handlePadClick(bank, pad)}
                    className={`
                      h-24 flex flex-col items-center justify-center
                      rounded-lg p-4 transition-colors duration-200
                      ${info?.hasSample 
                        ? 'bg-zinc-700 hover:bg-zinc-600' 
                        : 'bg-zinc-800 border-2 border-dashed border-zinc-700'}
                    `}
                  >
                    <span className="text-lg font-bold mb-1">
                      {bank}{pad}
                    </span>
                    <span className="text-xs text-gray-400 truncate w-full text-center">
                      {info?.hasSample ? info.name : 'Empty'}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
} 