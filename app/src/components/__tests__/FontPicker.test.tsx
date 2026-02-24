import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FontPicker, GOOGLE_FONTS, googleFontUrl } from '../FontPicker'

describe('FontPicker', () => {
  it('renders a search input', () => {
    render(<FontPicker value="Inter" onChange={() => {}} />)
    const input = screen.getByTestId('font-picker-search')
    expect(input).toBeTruthy()
    expect(input.tagName).toBe('INPUT')
  })

  it('filters fonts on search', () => {
    render(<FontPicker value="Inter" onChange={() => {}} />)
    const input = screen.getByTestId('font-picker-search')

    // Open the dropdown
    fireEvent.focus(input)

    // Type a search query
    fireEvent.change(input, { target: { value: 'Mono' } })

    // Should show fonts containing "Mono" in their name
    expect(screen.getByTestId('font-option-Space Mono')).toBeTruthy()
    expect(screen.getByTestId('font-option-Geist Mono')).toBeTruthy()
    expect(screen.getByTestId('font-option-IBM Plex Mono')).toBeTruthy()
    expect(screen.getByTestId('font-option-JetBrains Mono')).toBeTruthy()

    // Should NOT show non-matching fonts (no "Mono" in name)
    expect(screen.queryByTestId('font-option-Inter')).toBeNull()
    expect(screen.queryByTestId('font-option-Roboto')).toBeNull()
    expect(screen.queryByTestId('font-option-Fira Code')).toBeNull()
  })

  it('calls onChange with family and Google Fonts URL', () => {
    const onChange = vi.fn()
    render(<FontPicker value="Inter" onChange={onChange} />)
    const input = screen.getByTestId('font-picker-search')

    // Open dropdown
    fireEvent.focus(input)

    // Click a font option
    fireEvent.click(screen.getByTestId('font-option-Roboto'))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('Roboto', googleFontUrl('Roboto'))
  })

  it('generates correct Google Fonts URL', () => {
    expect(googleFontUrl('Inter')).toBe(
      'https://fonts.googleapis.com/css2?family=Inter&display=swap'
    )
    expect(googleFontUrl('Open Sans')).toBe(
      'https://fonts.googleapis.com/css2?family=Open+Sans&display=swap'
    )
    expect(googleFontUrl('Plus Jakarta Sans')).toBe(
      'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans&display=swap'
    )
  })

  it('shows upload font button', () => {
    render(<FontPicker value="Inter" onChange={() => {}} />)
    const input = screen.getByTestId('font-picker-search')

    // Open dropdown
    fireEvent.focus(input)

    const uploadBtn = screen.getByTestId('font-upload-button')
    expect(uploadBtn).toBeTruthy()
    expect(uploadBtn.textContent).toContain('Upload font')
  })

  it('has a hidden file input for font upload', () => {
    render(<FontPicker value="Inter" onChange={() => {}} />)
    const fileInput = screen.getByTestId('font-upload-input') as HTMLInputElement
    expect(fileInput).toBeTruthy()
    expect(fileInput.type).toBe('file')
    expect(fileInput.accept).toBe('.woff2,.woff,.ttf')
  })

  it('shows all fonts when no search query', () => {
    render(<FontPicker value="Inter" onChange={() => {}} />)
    const input = screen.getByTestId('font-picker-search')

    // Open dropdown
    fireEvent.focus(input)

    // Should show all Google Fonts (checking a few)
    expect(screen.getByTestId('font-option-Inter')).toBeTruthy()
    expect(screen.getByTestId('font-option-Roboto')).toBeTruthy()
    expect(screen.getByTestId('font-option-Lato')).toBeTruthy()
  })

  it('displays current value in the input when dropdown is closed', () => {
    render(<FontPicker value="Montserrat" onChange={() => {}} />)
    const input = screen.getByTestId('font-picker-search') as HTMLInputElement
    expect(input.value).toBe('Montserrat')
  })

  it('exports GOOGLE_FONTS with at least 40 entries', () => {
    expect(GOOGLE_FONTS.length).toBeGreaterThanOrEqual(40)
  })
})
