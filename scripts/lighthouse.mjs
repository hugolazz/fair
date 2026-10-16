// Audit Lighthouse mobile d'un build de production servi par `vite preview`.
// Usage : pnpm build && pnpm preview (autre terminal), puis  pnpm lighthouse [url]
// Chrome : variable CHROME_PATH, sinon Edge ou Chrome installés. Rapport HTML dans lighthouse-report/.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { launch } from 'chrome-launcher'
import lighthouse from 'lighthouse'

const url = process.argv[2] ?? 'http://127.0.0.1:4173/login'
const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)
const chromePath = candidates.find((p) => existsSync(p))

const chrome = await launch({
  chromePath,
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
})
try {
  // Configuration par défaut = émulation mobile (Moto G Power) avec réseau 4G ralenti et CPU ×4 plus lent.
  const result = await lighthouse(url, {
    port: chrome.port,
    output: 'html',
    logLevel: 'error',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  })
  const { lhr, report } = result
  mkdirSync('lighthouse-report', { recursive: true })
  writeFileSync('lighthouse-report/report.html', report)

  console.log(`Lighthouse ${lhr.lighthouseVersion} — ${url} (${lhr.configSettings.formFactor})`)
  for (const c of Object.values(lhr.categories)) {
    console.log(`  ${c.title.padEnd(16)} ${Math.round((c.score ?? 0) * 100)}`)
  }
  const a = lhr.audits
  const metric = (id) => a[id]?.displayValue ?? 'n/a'
  console.log(
    `  FCP ${metric('first-contentful-paint')} · LCP ${metric('largest-contentful-paint')} · ` +
      `TBT ${metric('total-blocking-time')} · CLS ${metric('cumulative-layout-shift')} · SI ${metric('speed-index')}`,
  )
  console.log(`  Poids transféré ${metric('total-byte-weight')}`)
  const failing = Object.values(a).filter(
    (x) => x.score !== null && x.score < 0.9 && x.scoreDisplayMode === 'numeric',
  )
  for (const x of failing) console.log(`  ! ${x.title} (${Math.round(x.score * 100)})`)

  const perf = lhr.categories.performance.score ?? 0
  if (perf < 0.9) process.exitCode = 1
} finally {
  await chrome.kill()
}
