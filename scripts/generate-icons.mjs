// Draws the Nudge app icons as real PNGs — two overlapping circles (two people) in
// the accent colour on a warm cream ground. Pure Node: rasterise to RGBA, then
// encode PNG with zlib. No image dependencies.

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const CREAM = [250, 247, 242]
const ACCENT = [196, 103, 79]
const ACCENT_DEEP = [164, 79, 58]

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePNG(width, height, rgba) {
  const stride = width * 4
  // PNG wants a filter byte at the start of every scanline; 0 = no filter.
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * `inset` shrinks the artwork toward the centre. Maskable icons get a bigger inset
 * so nothing important lands in the region Android crops away.
 */
function draw(size, { inset = 0, transparentBg = false } = {}) {
  const px = Buffer.alloc(size * size * 4)
  const c = size / 2
  const scale = (1 - inset * 2) * size

  // Two overlapping circles: a larger one behind, a smaller one in front.
  const big = { x: c - scale * 0.1, y: c - scale * 0.04, r: scale * 0.235 }
  const small = { x: c + scale * 0.155, y: c + scale * 0.075, r: scale * 0.165 }

  // Ring carved around the front circle so the two shapes read as separate.
  const gap = scale * 0.035

  const SS = 3 // supersample factor for smooth edges

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0]
      let alphaAcc = 0

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px_ = x + (sx + 0.5) / SS
          const py_ = y + (sy + 0.5) / SS

          const dBig = Math.hypot(px_ - big.x, py_ - big.y)
          const dSmall = Math.hypot(px_ - small.x, py_ - small.y)

          let color = transparentBg ? null : CREAM
          let a = transparentBg ? 0 : 1

          if (dBig <= big.r && dSmall > small.r + gap) {
            color = ACCENT
            a = 1
          }
          if (dSmall <= small.r) {
            color = ACCENT_DEEP
            a = 1
          }

          if (color) {
            acc = [acc[0] + color[0] * a, acc[1] + color[1] * a, acc[2] + color[2] * a]
          }
          alphaAcc += a
        }
      }

      const n = SS * SS
      const i = (y * size + x) * 4
      const alpha = alphaAcc / n

      if (alpha === 0) {
        px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 0
        continue
      }

      // Un-premultiply so edge pixels keep their colour.
      px[i] = Math.round(acc[0] / alphaAcc)
      px[i + 1] = Math.round(acc[1] / alphaAcc)
      px[i + 2] = Math.round(acc[2] / alphaAcc)
      px[i + 3] = Math.round(alpha * 255)
    }
  }

  return px
}

/** Monochrome glyph for the Android status-bar badge: alpha is all that's used. */
function drawBadge(size) {
  const px = Buffer.alloc(size * size * 4)
  const c = size / 2
  const big = { x: c - size * 0.1, y: c - size * 0.04, r: size * 0.235 }
  const small = { x: c + size * 0.155, y: c + size * 0.075, r: size * 0.165 }
  const gap = size * 0.035
  const SS = 3

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px_ = x + (sx + 0.5) / SS
          const py_ = y + (sy + 0.5) / SS
          const dBig = Math.hypot(px_ - big.x, py_ - big.y)
          const dSmall = Math.hypot(px_ - small.x, py_ - small.y)
          if ((dBig <= big.r && dSmall > small.r + gap) || dSmall <= small.r) a++
        }
      }
      const i = (y * size + x) * 4
      px[i] = px[i + 1] = px[i + 2] = 255
      px[i + 3] = Math.round((a / (SS * SS)) * 255)
    }
  }
  return px
}

mkdirSync('public/icons', { recursive: true })

const outputs = [
  ['public/icons/icon-192.png', 192, encodePNG(192, 192, draw(192))],
  ['public/icons/icon-512.png', 512, encodePNG(512, 512, draw(512))],
  // Maskable: artwork pulled well inside the safe zone, full-bleed cream background.
  ['public/icons/maskable-512.png', 512, encodePNG(512, 512, draw(512, { inset: 0.12 }))],
  ['public/icons/badge-72.png', 72, encodePNG(72, 72, drawBadge(72))],
  ['public/apple-touch-icon.png', 180, encodePNG(180, 180, draw(180))],
]

for (const [path, size, buf] of outputs) {
  writeFileSync(path, buf)
  console.log(`${path}  ${size}x${size}  ${(buf.length / 1024).toFixed(1)} KB`)
}
