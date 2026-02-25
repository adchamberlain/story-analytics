/**
 * Regression test: stale preview responses must still clear loadingPreview.
 *
 * Bug: In dataStore.ts, the loadPreview method used a stale-guard pattern
 * with request IDs. When a response was stale (requestId !== previewRequestId),
 * the code did nothing, leaving loadingPreview stuck as true forever.
 * Fix: Added else branches to set loadingPreview: false for stale responses.
 */

import { describe, it, expect } from 'vitest'

import { resolve, dirname } from 'path'

import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('dataStore loadPreview stale guard', () => {
  it('should clear loadingPreview even for stale responses', async () => {
    
    const fs = await import('fs')
    const source = fs.readFileSync(
      resolve(__dirname, '../stores/dataStore.ts'),
      'utf-8'
    )

    // Find the async loadPreview method body (second occurrence, inside create())
    const firstIdx = source.indexOf('loadPreview:')
    const methodIdx = source.indexOf('loadPreview:', firstIdx + 1)
    expect(methodIdx).toBeGreaterThan(-1)

    // Extract from the method definition to the next top-level method (reset:)
    const resetIdx = source.indexOf('reset:', methodIdx)
    const section = source.slice(methodIdx, resetIdx)

    // Count occurrences of loadingPreview: false — should be at least 3
    // (success path, stale success else, error path, stale error else)
    const clearings = (section.match(/loadingPreview:\s*false/g) || []).length
    expect(clearings).toBeGreaterThanOrEqual(3)
  })
})
