/**
 * Screenshot capture utility for visual verification.
 * Usage: npx tsx e2e/screenshot.ts <name> [url] [selector]
 */
import { chromium } from '@playwright/test'
import path from 'path'
import fs from 'fs'

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
const name = args[0] || `screenshot-${Date.now()}`
const url = args[1] || 'http://localhost:3001'
const selector = args[2] || undefined

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
