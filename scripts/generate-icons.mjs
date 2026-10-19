// Génère le favicon et les icônes PWA depuis le logo « fair. » (pnpm icons). Les fichiers générés sont versionnés
// dans public/. Le logo est le même que celui de l'en-tête (src/components/wordmark.tsx) : « fair » en Instrument
// Serif italique (teal) suivi d'un point doré. Les lettres sont ici en tracés (extraits de la police) : aucun
// rendu de texte, donc identique partout et sans police à charger.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const out = join(import.meta.dirname, '..', 'public')
mkdirSync(out, { recursive: true })

const BG = '#faf9f6'
const TEAL = '#0f766e'
const GOLD = '#d9a441'

// Tracés des lettres (unités de la police : 1000 par em, axe Y vers le haut) et leur chasse.
const GLYPHS = {
  f: {
    adv: 273,
    d: 'M32 0Q19 0 22 13L123 445Q132 482 99 482H78Q62 482 62 496Q62 510 80 510Q111 510 126.5 518.0Q142 526 147 550Q160 607 185.5 651.5Q211 696 247.0 722.0Q283 748 326 748Q361 748 382.5 731.5Q404 715 404 686Q404 664 392.5 650.5Q381 637 364 637Q343 637 336.5 649.0Q330 661 328.5 677.0Q327 693 322.0 705.0Q317 717 299 717Q276 717 258.5 694.5Q241 672 227 610L207 523Q204 510 218 510H298Q317 510 313 496Q310 482 295 482H208Q198 482 195 472L88 11Q85 0 74 0Z',
  },
  a: {
    adv: 474,
    d: 'M89 -9Q53 -9 33.0 22.0Q13 53 13 113Q13 170 29.0 227.5Q45 285 73.0 337.0Q101 389 136.5 429.0Q172 469 211.5 492.5Q251 516 290 516Q309 516 326.0 508.5Q343 501 354 485Q360 476 366 476Q372 476 378 485Q389 501 396.0 505.5Q403 510 409 510Q422 510 419 496L330 113Q315 48 350 48Q373 48 391.5 79.0Q410 110 429 175Q432 186 442 186Q449 186 451.0 180.0Q453 174 451 166Q432 72 400.0 31.5Q368 -9 323 -9Q284 -9 267.5 24.0Q251 57 264 114L277 169Q279 176 274.5 177.0Q270 178 267 172Q212 71 169.5 31.0Q127 -9 89 -9ZM114 42Q138 42 167.0 71.0Q196 100 224.5 146.0Q253 192 277.0 245.0Q301 298 315.5 347.0Q330 396 330 430Q330 491 287 491Q261 491 232.0 467.5Q203 444 176.5 404.0Q150 364 128.5 313.5Q107 263 94.0 208.5Q81 154 81 102Q81 67 89.5 54.5Q98 42 114 42Z',
  },
  i: {
    adv: 288,
    d: 'M204 605Q185 605 172.5 618.5Q160 632 160 651Q160 678 176.5 694.0Q193 710 214 710Q234 710 247.5 697.5Q261 685 261 665Q261 637 244.0 621.0Q227 605 204 605ZM122 -10Q89 -10 75.0 14.5Q61 39 74 95L148 412Q153 434 149.5 446.5Q146 459 131 459Q113 459 91.5 432.5Q70 406 43 332Q39 319 29 319Q14 319 21 337Q43 406 67.5 445.0Q92 484 117.0 500.0Q142 516 163 516Q198 516 212.0 491.5Q226 467 213 411L139 94Q134 72 137.5 59.5Q141 47 156 47Q174 47 195.5 73.5Q217 100 244 174Q248 187 258 187Q273 187 266 169Q245 101 219.5 61.5Q194 22 169.0 6.0Q144 -10 122 -10Z',
  },
  r: {
    adv: 368,
    d: 'M64 0Q50 0 53 13L148 412Q153 434 149.5 446.5Q146 459 131 459Q113 459 91.5 432.5Q70 406 43 332Q39 319 29 319Q14 319 21 337Q43 406 67.5 445.0Q92 484 117.0 500.0Q142 516 163 516Q196 516 210.0 491.5Q224 467 211 411L200 364Q199 357 203.0 356.0Q207 355 210 361Q248 448 279.0 482.0Q310 516 350 516Q377 516 390.5 501.5Q404 487 404 462Q404 437 392.0 422.0Q380 407 361 407Q345 407 338.0 415.0Q331 423 327.5 433.5Q324 444 320.0 452.0Q316 460 307 460Q292 460 268.0 422.0Q244 384 216.5 319.5Q189 255 163.5 175.0Q138 95 119 11Q116 0 105 0Z',
  },
  '.': {
    adv: 219,
    d: 'M62 -9Q41 -9 28.0 4.5Q15 18 15 38Q15 64 33.0 80.0Q51 96 71 96Q91 96 104.5 82.5Q118 69 118 49Q118 23 100.0 7.0Q82 -9 62 -9Z',
  },
}
const TRACKING = -20 // -0,02 em, comme le logo
const TEXT_WIDTH = 1420 // largeur du mot « fair. » (unités), de l'encre de « f » à celle du point
const TEXT_LEFT = 21 // débord gauche du « f »
const TEXT_MID_Y = 369 // milieu vertical de l'encre (de -10 à 748)

/** SVG carré 512 : tuile crème et logo centré ; scale réduit le logo (zone de sécurité des icônes maskable). */
const svg = ({ round = true, scale = 1 } = {}) => {
  const s = (430 / TEXT_WIDTH) * scale
  const x0 = 256 - (TEXT_WIDTH / 2 + TEXT_LEFT) * s + TEXT_LEFT * s
  const y0 = 256 + TEXT_MID_Y * s
  let x = 0
  const paths = [...'fair.']
    .map((ch) => {
      const g = GLYPHS[ch]
      const p = `<path fill="${ch === '.' ? GOLD : TEAL}" transform="translate(${(x0 + x * s).toFixed(2)} ${y0.toFixed(2)}) scale(${s.toFixed(5)} -${s.toFixed(5)})" d="${g.d}"/>`
      x += g.adv + TRACKING
      return p
    })
    .join('\n  ')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${round ? 112 : 0}" fill="${BG}"/>
  ${paths}
</svg>`
}

writeFileSync(join(out, 'favicon.svg'), svg())

const render = (name, size, content) =>
  sharp(Buffer.from(content)).resize(size, size).png().toFile(join(out, name))

await render('favicon-32x32.png', 32, svg())
await render('pwa-192x192.png', 192, svg())
await render('pwa-512x512.png', 512, svg())
await render('pwa-maskable-512x512.png', 512, svg({ round: false, scale: 0.8 })) // zone de sécurité maskable
await render('apple-touch-icon.png', 180, svg({ round: false, scale: 0.8 }))
console.log('Icônes générées dans public/')
