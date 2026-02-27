import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock themeStore to avoid localStorage access at module level
vi.mock('../../../stores/themeStore', () => ({
  useThemeStore: (selector: (s: { resolved: string }) => string) =>
    selector({ resolved: 'light' }),
}))

import { SqlEditor } from '../SqlEditor'

describe('SqlEditor', () => {
  it('renders without crashing', () => {
    const { container } = render(<SqlEditor />)
    expect(container.querySelector('.cm-editor')).toBeInTheDocument()
  })
})
