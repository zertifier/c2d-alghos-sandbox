// Copies empower-x/report/html-report.js into every algorithm that contains the
// html-report markers, replacing what was there. The algorithms are published as
// single files, so the shared helper has to live inside each of them.
//
//   node tools/inline-report.mjs                 update every algorithm with markers
//   node tools/inline-report.mjs empower-x/x.js  update only the given file(s)
//   node tools/inline-report.mjs --check         exit 1 if any file is out of date
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const helperPath = path.join(root, 'empower-x', 'report', 'html-report.js')
const BEGIN = '// ===== BEGIN html-report'
const END = '// ===== END html-report ====='
const check = process.argv.includes('--check')

// Built with LF, then converted to each target file's own line endings, so a
// CRLF checkout (core.autocrlf) never ends up with mixed endings.
const toLf = (s) => s.replace(/\r\n/g, '\n')
const helper = toLf(fs.readFileSync(helperPath, 'utf8')).trim()
const blockLf =
  `${BEGIN} (copied from empower-x/report/html-report.js — edit it there, then run: node tools/inline-report.mjs) =====\n` +
  `${helper}\n${END}`

const fileArgs = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const targets = fileArgs.length
  ? fileArgs.map((f) => path.resolve(f))
  : ['empower-x', 'zertipower-solar'].flatMap((dir) =>
      fs
        .readdirSync(path.join(root, dir))
        .filter((f) => f.endsWith('.js'))
        .map((f) => path.join(root, dir, f))
    )

let stale = 0
for (const file of targets) {
  const src = fs.readFileSync(file, 'utf8')
  const start = src.indexOf(BEGIN)
  const end = src.indexOf(END)
  if (start === -1 || end === -1) continue
  const eol = src.includes('\r\n') ? '\r\n' : '\n'
  const block = blockLf.replace(/\n/g, eol)
  const next = src.slice(0, start) + block + src.slice(end + END.length)
  // Compare ignoring line endings: only real content changes count.
  if (toLf(next) === toLf(src)) {
    console.log(`up to date  ${path.relative(root, file)}`)
    continue
  }
  stale++
  if (check) console.log(`OUT OF DATE ${path.relative(root, file)}`)
  else {
    fs.writeFileSync(file, next)
    console.log(`updated     ${path.relative(root, file)}`)
  }
}
if (check && stale) process.exit(1)
