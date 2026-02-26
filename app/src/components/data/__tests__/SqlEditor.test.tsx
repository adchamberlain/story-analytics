import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { SqlEditor } from '../SqlEditor'

describe('SqlEditor', () => {
  it('renders without crashing', () => {
    const { container } = render(<SqlEditor />)
    expect(container.querySelector('.cm-editor')).toBeInTheDocument()
  })
})
