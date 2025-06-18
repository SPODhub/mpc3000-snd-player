'use client'

import { useState, useEffect } from 'react'
import { diskBuilder, SP1200Bank } from '@/app/lib/sp1200'
import { Button } from '@/components/ui/button'
import { Save } from 'lucide-react'

export default function SP1200Pads() {
  const [assignments, setAssignments] = useState<Array<{
    bank: SP1200Bank
    padNumber: number
    name: string
  }>>([])

  useEffect(() => {
    updateAssignments()
  }, [])

  const updateAssignments = () => {
    setAssignments(diskBuilder.getPadAssignments().map(a => ({
      bank: a.bank,
      padNumber: a.padNumber,
      name: a.name
    })))
  }

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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Assigned Samples</h3>
        <Button
          onClick={handleCreateDiskImage}
          disabled={assignments.length === 0}
          className="bg-zinc-700 hover:bg-zinc-600"
        >
          <Save className="mr-2 h-4 w-4" />
          Create Disk Image
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {(['A', 'B', 'C', 'D'] as SP1200Bank[]).map(bank => (
          <div key={bank} className="space-y-4">
            <h4 className="font-semibold">Bank {bank}</h4>
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 8 }, (_, i) => i + 1).map(pad => {
                const assignment = assignments.find(
                  a => a.bank === bank && a.padNumber === pad
                )
                
                return (
                  <div
                    key={`${bank}${pad}`}
                    className={`
                      h-24 flex flex-col items-center justify-center
                      rounded-lg p-4 transition-colors duration-200
                      ${assignment 
                        ? 'bg-zinc-700' 
                        : 'bg-zinc-800 border-2 border-dashed border-zinc-700'}
                    `}
                  >
                    <span className="text-lg font-bold mb-1">
                      {bank}{pad}
                    </span>
                    <span className="text-xs text-gray-400 truncate w-full text-center">
                      {assignment ? assignment.name : 'Empty'}
                    </span>
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