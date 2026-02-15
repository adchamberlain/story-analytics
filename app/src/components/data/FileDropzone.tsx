import { useCallback, useState, useRef } from 'react'

interface FileDropzoneProps {
  onFileSelected: (file: File) => void
  uploading: boolean
}

export function FileDropzone({ onFileSelected, uploading }: FileDropzoneProps) {
  const [dragOver, setDragOver] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      setHint(null)

      const files = Array.from(e.dataTransfer.files)
      const csvFiles = files.filter((f) => f.name.toLowerCase().endsWith('.csv'))

      if (csvFiles.length === 0) {
        setHint(files.length === 1
          ? `"${files[0].name}" is not a CSV file.`
          : 'None of the dropped files are CSVs.')
        return
      }

      if (csvFiles.length > 1) {
        setHint(`Uploading "${csvFiles[0].name}" — only one file at a time is supported.`)
      }

      onFileSelected(csvFiles[0])
    },
    [onFileSelected]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setHint(null)
      const file = e.target.files?.[0]
      if (file) onFileSelected(file)
    },
    [onFileSelected]
  )

  return (
    <div
      className={`
        border-2 border-dashed rounded-2xl text-center cursor-pointer
        transition-colors duration-150
        ${dragOver ? 'border-blue-400' : 'border-border-strong bg-surface hover:border-text-icon'}
        ${uploading ? 'opacity-50 pointer-events-none' : ''}
      `}
      style={{
        padding: '40px 32px',
        backgroundColor: dragOver ? 'rgba(59,130,246,0.06)' : undefined,
      }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        onChange={handleChange}
      />

      <div style={{ marginBottom: '16px' }}>
        {uploading ? (
          <svg className="animate-spin h-10 w-10 mx-auto text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="h-10 w-10 mx-auto text-text-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
        )}
      </div>

      <p className="text-[15px] font-medium text-text-primary">
        {uploading ? 'Uploading...' : 'Drop a CSV file here, or click to browse'}
      </p>
      <p className="text-[13px] text-text-muted" style={{ marginTop: '6px' }}>
        CSV files only
      </p>

      {hint && (
        <p className="text-[13px] text-amber-500" style={{ marginTop: '10px' }}>
          {hint}
        </p>
      )}
    </div>
  )
}
