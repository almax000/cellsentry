#!/usr/bin/env node
// Checks docs/adr against docs/adr/INDEX.md. Every ADR uses the same header
// block (see docs/adr/README.md), so besides "which ADRs exist" this also
// compares each file's Status and Date with its INDEX row.
// Usage: cd app && npm run check:adr [-- --quiet]   Exit code: 0 consistent, 1 mismatch.
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ADR_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'adr')
const HEADER = ['Status', 'Date', 'Deciders', 'Drafted by', 'Supersedes', 'Superseded by', 'Legacy ID', 'Related']
const STATUS = /^(Proposed|Accepted|Rejected|Deprecated|Superseded by ADR-\d{4})$/

const problems = []
const files = readdirSync(ADR_DIR).filter((name) => /^\d{4}-[a-z0-9-]+\.md$/.test(name)).sort()

// INDEX rows look like: | [0001](./0001-slug.md) | title | Status | Date | legacy id |
const rows = new Map()
for (const line of readFileSync(join(ADR_DIR, 'INDEX.md'), 'utf8').split('\n')) {
  const cells = line.split('|').map((cell) => cell.trim())
  const link = cells[1]?.match(/^\[(\d{4})\]\(\.\/([^)]+)\)$/)
  if (!link) continue
  if (rows.has(link[1])) problems.push(`INDEX.md 里 ${link[1]} 出现了两次`)
  rows.set(link[1], { file: link[2], status: cells[3], date: cells[4] })
}

const ids = new Set()
const successors = []
for (const name of files) {
  const id = name.slice(0, 4)
  if (ids.has(id)) problems.push(`编号 ${id} 被两个文件占用`)
  ids.add(id)

  const text = readFileSync(join(ADR_DIR, name), 'utf8')
  if (!text.startsWith(`# ADR-${id}：`)) problems.push(`${name}：第一行要以「# ADR-${id}：」开头`)
  const head = text.split('\n## ')[0]
  const fields = [...head.matchAll(/^- \*\*([^*]+)\*\*: (.+)$/gm)].map((match) => [match[1], match[2].trim()])
  if (fields.map(([key]) => key).join('|') !== HEADER.join('|')) {
    problems.push(`${name}：头部字段要按顺序写 ${HEADER.join('、')}`)
  }
  const header = Object.fromEntries(fields)
  if (!STATUS.test(header.Status ?? '')) problems.push(`${name}：Status「${header.Status ?? ''}」不在允许的取值里`)
  const successor = header.Status?.match(/^Superseded by (ADR-\d{4})$/)?.[1]
  if (successor) {
    successors.push([name, successor])
    if (header['Superseded by'] !== successor) problems.push(`${name}：Status 写了 ${successor}，Superseded by 字段也要写 ${successor}`)
  }

  const row = rows.get(id)
  if (!row) {
    problems.push(`${name}：盘上有、INDEX.md 没列`)
    continue
  }
  if (row.file !== name) problems.push(`${id}：INDEX.md 链接的是 ${row.file}，文件名是 ${name}`)
  if (row.status !== header.Status) problems.push(`${id}：INDEX.md 写「${row.status}」，文件写「${header.Status}」`)
  if (row.date !== header.Date) problems.push(`${id}：INDEX.md 日期 ${row.date}，文件日期 ${header.Date}`)
}
for (const id of rows.keys()) if (!ids.has(id)) problems.push(`${id}：INDEX.md 列了、盘上没有文件`)
for (const [name, successor] of successors) {
  if (!ids.has(successor.slice(4))) problems.push(`${name}：被 ${successor} 取代，但盘上没有 ${successor}`)
}

if (problems.length > 0) {
  console.error('❌ docs/adr 和 INDEX.md 对不上：')
  for (const problem of problems) console.error(`   ${problem}`)
  process.exit(1)
}
if (!process.argv.includes('--quiet')) console.log(`✅ docs/adr 一致（${files.length} 条 ADR）`)
