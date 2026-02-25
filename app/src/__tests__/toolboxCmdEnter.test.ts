/**
 * Regression test: Cmd+Enter should not fire when query is already executing.
 *
 * Bug: The keyboard shortcut handler in Toolbox.tsx called handleRunQuery()
 * without checking sqlExecuting, allowing double-fire while a query runs.
 * The Run button correctly had disabled={sqlExecuting} but the keyboard
 * shortcut bypassed it.
 * Fix: Added `if (!sqlExecuting)` guard before handleRunQuery() call.
 */

import { describe, it, expect } from 'vitest'

import { resolve, dirname } from 'path'

import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('Toolbox Cmd+Enter guard', () => {
  it('should guard keyboard shortcut with sqlExecuting check', async () => {
    
    const fs = await import('fs')
    const source = fs.readFileSync(
      resolve(__dirname, '../components/editor/Toolbox.tsx'),
      'utf-8'
    )

    // Find the onKeyDown handler block and verify it contains the guard
    const onKeyDownIdx = source.indexOf('onKeyDown')
    expect(onKeyDownIdx).toBeGreaterThan(-1)

    // Extract the handler block (next ~300 chars)
    const handlerBlock = source.slice(onKeyDownIdx, onKeyDownIdx + 300)

    // The handler must check sqlExecuting before calling handleRunQuery
    expect(handlerBlock).toContain('!sqlExecuting')
    expect(handlerBlock).toContain('handleRunQuery')
  })
})
