import { useState, useRef, useEffect, useCallback } from 'react'

// -- Curated Google Fonts suitable for data visualization --------------------

export const GOOGLE_FONTS = [
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Source Sans Pro',
  'Nunito', 'Raleway', 'PT Sans', 'Merriweather', 'Playfair Display',
  'Noto Sans', 'Ubuntu', 'Poppins', 'Work Sans', 'DM Sans',
  'IBM Plex Sans', 'IBM Plex Serif', 'IBM Plex Mono', 'Fira Sans',
  'Barlow', 'Libre Franklin', 'Crimson Text', 'Lora', 'Source Serif Pro',
  'Bitter', 'PT Serif', 'Josefin Sans', 'Cabin', 'Archivo',
  'Rubik', 'Karla', 'Inconsolata', 'Fira Code', 'JetBrains Mono',
  'Space Grotesk', 'Space Mono', 'Outfit', 'Sora', 'Manrope',
  'Plus Jakarta Sans', 'Red Hat Display', 'Atkinson Hyperlegible',
  'Literata', 'Commissioner', 'Lexend', 'General Sans', 'Satoshi',
  'Geist', 'Geist Mono',
]

// -- Helpers -----------------------------------------------------------------

/** Generate a Google Fonts CSS URL from a font family name. */
export function googleFontUrl(family: string): string {
  return `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}&display=swap`
}

/** Inject a <link> tag for a Google Font into <head>, deduplicating by href. */
function injectGoogleFontLink(url: string) {
  if (document.querySelector(`link[href="${url}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  document.head.appendChild(link)
}

/** Simple hash for generating unique font-family names from uploaded files. */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < Math.min(str.length, 200); i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

/** Inject a @font-face rule for a base64 font data URL. Returns the generated family name. */
function injectUploadedFont(dataUrl: string): string {
  const familyName = `custom-upload-${simpleHash(dataUrl)}`
  const existingId = `font-face-${familyName}`
  if (document.getElementById(existingId)) return familyName

  const style = document.createElement('style')
  style.id = existingId
  style.textContent = `@font-face { font-family: '${familyName}'; src: url('${dataUrl}'); font-display: swap; }`
  document.head.appendChild(style)
  return familyName
}

// -- Component ---------------------------------------------------------------

interface FontPickerProps {
  value: string
  fontUrl?: string
  onChange: (family: string, fontUrl?: string) => void
}

export function FontPicker({ value, fontUrl, onChange }: FontPickerProps) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Filter fonts by search query
  const filtered = search
    ? GOOGLE_FONTS.filter((f) => f.toLowerCase().includes(search.toLowerCase()))
    : GOOGLE_FONTS

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Preload the font preview links for visible fonts
  useEffect(() => {
    if (!open) return
    for (const font of filtered.slice(0, 20)) {
      injectGoogleFontLink(googleFontUrl(font))
    }
  }, [open, filtered])

  const handleSelect = useCallback((font: string) => {
    const url = googleFontUrl(font)
    injectGoogleFontLink(url)
    onChange(font, url)
    setOpen(false)
    setSearch('')
  }, [onChange])

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const familyName = injectUploadedFont(dataUrl)
      onChange(familyName, dataUrl)
      setOpen(false)
      setSearch('')
    }
    reader.readAsDataURL(file)
    // Reset file input so re-uploading the same file triggers onChange
    e.target.value = ''
  }, [onChange])

  // Inject current font on mount if fontUrl is set
  useEffect(() => {
    if (!fontUrl) return
    if (fontUrl.startsWith('data:')) {
      injectUploadedFont(fontUrl)
    } else if (fontUrl.startsWith('http')) {
      injectGoogleFontLink(fontUrl)
    }
  }, [fontUrl])

  const inputClass = 'w-full px-3 py-2 text-[14px] rounded-lg bg-surface-input border border-border-strong text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/40'

  return (
    <div ref={containerRef} className="relative">
      {/* Current value display + search input */}
      <input
        type="text"
        value={open ? search : value}
        onChange={(e) => { setSearch(e.target.value); if (!open) setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Search fonts..."
        className={inputClass}
        data-testid="font-picker-search"
        style={{ fontFamily: value }}
      />

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-[280px] overflow-y-auto rounded-lg border border-border-default bg-surface-raised shadow-lg">
          {filtered.map((font) => (
            <button
              key={font}
              type="button"
              onClick={() => handleSelect(font)}
              className="w-full text-left px-3 py-2 text-[13px] hover:bg-surface-secondary transition-colors"
              style={{ fontFamily: font }}
              data-testid={`font-option-${font}`}
            >
              {font}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-[13px] text-text-muted">No matching fonts</p>
          )}

          {/* Upload button */}
          <div className="border-t border-border-default">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full text-left px-3 py-2 text-[13px] text-blue-500 hover:bg-surface-secondary transition-colors font-medium"
              data-testid="font-upload-button"
            >
              Upload font (.woff2, .woff, .ttf)
            </button>
          </div>
        </div>
      )}

      {/* Hidden file input for font upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".woff2,.woff,.ttf"
        onChange={handleUpload}
        className="hidden"
        data-testid="font-upload-input"
      />
    </div>
  )
}
