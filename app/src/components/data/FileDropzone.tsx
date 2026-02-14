import { useCallback, useState, useRef } from 'react'

interface FileDropzoneProps {
  onFileSelected: (file: File) => void
  uploading: boolean
}

export function FileDropzone({ onFileSelected, uploading }: FileDropzoneProps) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file && file.name.toLowerCase().endsWith('.csv')) {
        onFileSelected(file)
      }
    },
    [onFileSelected]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) onFileSelected(file)
    },
    [onFileSelected]
  )

  return (
    <div
      className={`
        border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
        transition-colors duration-150
        ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-white hover:border-gray-400'}
        ${uploading ? 'opacity-50 pointer-events-none' : ''}
      `}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleChange}
      />

      <div className="text-4xl mb-4 text-gray-300">
        {uploading ? (
          <svg className="animate-spin h-10 w-10 mx-auto text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="h-10 w-10 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
        )}
      </div>

      <p className="text-sm font-medium text-text-primary">
        {uploading ? 'Uploading...' : 'Drop a CSV file here, or click to browse'}
      </p>
      <p className="text-xs mt-1 text-text-muted">
        CSV files only
      </p>
    </div>
  )
}
