/**
 * Screenshot capture utility for visual verification.
 * Usage: npx tsx e2e/screenshot.ts <name> [url] [selector]
 */
import { chromium } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SCREENSHOT_DIR = path.resolve(__dirname, '../../tasks/screenshots')

interface CaptureOptions {
  url?: string
  selector?: string
  name: string
  waitFor?: string
  viewport?: { width: number; height: number }
}

async function capture(options: CaptureOptions): Promise<string> {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: options.viewport || { width: 1280, height: 900 },
  })

  await page.goto(options.url || 'http://localhost:3001', {
    waitUntil: 'networkidle',
  })

  if (options.waitFor) {
    await page.waitForSelector(options.waitFor, { timeout: 10000 })
  }

  const screenshotPath = path.join(SCREENSHOT_DIR, `${options.name}.png`)

  if (options.selector) {
    const element = await page.$(options.selector)
    if (element) {
      await element.screenshot({ path: screenshotPath })
    } else {
      console.error(`Selector "${options.selector}" not found, taking full page screenshot`)
      await page.screenshot({ path: screenshotPath, fullPage: true })
    }
  } else {
    await page.screenshot({ path: screenshotPath, fullPage: true })
  }

  await browser.close()
  return screenshotPath
}

// CLI interface
const args = process.argv.slice(2)
const positional = args.filter((a) => !a.startsWith('--'))
const name = positional[0] || `screenshot-${Date.now()}`
const url = positional[1] || 'http://localhost:3001'
const selector = positional[2] || undefined

// Parse --viewport=WIDTHxHEIGHT
const viewportArg = args.find((a) => a.startsWith('--viewport='))
const viewport = viewportArg
  ? {
      width: parseInt(viewportArg.split('=')[1].split('x')[0]),
      height: parseInt(viewportArg.split('=')[1].split('x')[1]),
    }
  : undefined

capture({ name, url, selector, viewport }).then((p) =>
  console.log(`Screenshot saved: ${p}`),
)
