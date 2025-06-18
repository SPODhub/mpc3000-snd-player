'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

interface PadProps {
  index: number;
  onFileDrop: (file: File) => void;
}

export default function Pad({ index, onFileDrop }: PadProps) {
  const [fileName, setFileName] = useState<string>('');
  const [isConverting, setIsConverting] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setFileName(file.name);
      setIsConverting(true);
      onFileDrop(file);
      // Reset converting state after a short delay
      setTimeout(() => setIsConverting(false), 1000);
    }
  }, [onFileDrop]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.wav', '.mp3', '.aiff'],
    },
    maxFiles: 1,
  });

  return (
    <div
      {...getRootProps()}
      className={`
        aspect-square rounded-lg border-2 border-dashed
        flex items-center justify-center cursor-pointer
        transition-all duration-200
        ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
        ${isConverting ? 'animate-pulse' : ''}
      `}
    >
      <input {...getInputProps()} />
      <div className="text-center p-2">
        <div className="text-sm font-medium text-gray-500">
          Pad {index + 1}
        </div>
        {fileName && (
          <div className="text-xs text-gray-400 mt-1 truncate">
            {fileName}
          </div>
        )}
        {isConverting && (
          <div className="text-xs text-blue-500 mt-1">
            Converting...
          </div>
        )}
      </div>
    </div>
  );
} 