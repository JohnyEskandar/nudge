// The app's own words, checked against the rules every screen keeps: never a long dash,
// never naming the gap ("it's been too long", "it's been a while"). Comments are stripped
// first, so the rules apply to what people read, not to notes for whoever edits the code.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..', '..')
const UI_DIRS = ['src/screens', 'src/components']
const OTHER_FILES = ['index.html', 'public/manifest.webmanifest', 'src/lib/useReachOut.js', 'src/lib/format.js']

function withoutComments(text) {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '') // {/* JSX comments */}
    .replace(/\/\*[\s\S]*?\*\//g, '') // /* block */ and /** doc */ comments
    .replace(/<!--[\s\S]*?-->/g, '') // <!-- html comments -->
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1') // // line comments, not https://
}

const files = [
  ...UI_DIRS.flatMap((dir) =>
    readdirSync(join(ROOT, dir))
      .filter((f) => f.endsWith('.jsx'))
      .map((f) => join(dir, f)),
  ),
  ...OTHER_FILES,
]

describe('copy rules', () => {
  for (const file of files) {
    const text = withoutComments(readFileSync(join(ROOT, file), 'utf8'))

    it(`${file} has no long dash`, () => {
      const hits = text.split('\n').filter((l) => /—|&mdash;/.test(l))
      expect(hits).toEqual([])
    })

    it(`${file} never names the gap`, () => {
      const hits = text.split('\n').filter((l) => /been (too long|a while)|it's been|it&rsquo;s been/i.test(l))
      expect(hits).toEqual([])
    })
  }

  it('describes Nudge by its purpose, the same way in the manifest and the page', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'public/manifest.webmanifest'), 'utf8'))
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
    expect(manifest.description).toMatch(/miss/i)
    expect(html).toContain(`content="${manifest.description}"`)
  })
})
