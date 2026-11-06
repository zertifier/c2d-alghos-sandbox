// Renders every chart type of empower-x/report/html-report.js with made-up data,
// to check the look of the helper on its own:  node tools/report-demo.mjs out.html
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ctx = { console }
vm.createContext(ctx)
vm.runInContext(fs.readFileSync(path.join(root, 'empower-x/report/html-report.js'), 'utf8') +
  '\nthis.api = { reportPage, reportSection, reportKpis, reportBarChart, reportHBarChart, reportLineChart, reportDonut, reportHeatmap, reportRangeChart, reportTable, reportMaskId };', ctx)
const R = ctx.api

const hours = Array.from({ length: 24 * 14 }, (_, i) => `2026-03-${String(1 + Math.floor(i / 24)).padStart(2, '0')} ${String(i % 24).padStart(2, '0')}:00`)
const solar = hours.map((_, i) => Math.max(0, Math.sin(((i % 24) - 6) / 12 * Math.PI)) * 8)
const load = hours.map((_, i) => 2 + ((i % 24) > 17 ? 4 : 0) + (i % 7) * 0.1)

const html = R.reportPage({
  title: 'Report helper demo',
  subtitle: 'Every chart type with made-up data',
  jsonFile: 'demo.json',
  sections: [
    R.reportSection('KPIs', R.reportKpis([
      { label: 'Solar produced', value: '1,234', unit: 'kWh' },
      { label: 'Grid import', value: '987', unit: 'kWh', hint: 'from the network' },
      { label: 'Self-sufficiency', value: '56', unit: '%' },
      { label: 'Supply points', value: '42' }])),
    R.reportSection('Time series', R.reportLineChart({ title: 'Solar vs load', labels: hours, series: [{ name: 'Solar', values: solar, color: '#f59e0b', area: true }, { name: 'Load', values: load, color: '#2563eb' }], unit: 'kWh' })),
    R.reportSection('Bars',
      R.reportBarChart({ title: 'Stacked per day', categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], series: [{ name: 'Solar used', values: [5, 6, 7, 4, 6, 8, 9], color: '#16a34a' }, { name: 'Grid', values: [3, 2, 4, 5, 3, 2, 1], color: '#64748b' }], unit: 'kWh', stacked: true }) +
      R.reportBarChart({ title: 'Grouped with negatives', categories: ['A', 'B', 'C'], series: [{ name: 'X', values: [3, -2, 5] }, { name: 'Y', values: [1, 4, -1] }], unit: '%' }) +
      R.reportHBarChart({ title: 'Ranking', items: [{ label: R.reportMaskId('ES0031408070250001CG0F'), value: 120 }, { label: R.reportMaskId('ES0031408070250002AB1C'), value: 80 }, { label: 'Short', value: 12 }], unit: 'kWh' })),
    R.reportSection('Shares', R.reportDonut({ title: 'Energy source', slices: [{ label: 'Solar', value: 60, color: '#f59e0b' }, { label: 'Grid', value: 40, color: '#64748b' }], unit: 'kWh' }) +
      R.reportDonut({ title: 'Single slice', slices: [{ label: 'Only', value: 10 }], unit: 'kWh' })),
    R.reportSection('Heatmap', R.reportHeatmap({ title: 'Day × hour', rows: ['Mon', 'Tue', 'Wed'], cols: Array.from({ length: 24 }, (_, h) => String(h)), values: [0, 1, 2].map((r) => Array.from({ length: 24 }, (_, h) => (r === 1 && h === 3 ? null : Math.max(0, Math.sin((h - 6) / 12 * Math.PI)) * (r + 1)))), unit: 'kWh' })),
    R.reportSection('Ranges', R.reportRangeChart({ title: 'Spread', items: [{ label: 'Imported', min: 0, max: 12, low: 1, high: 8, mid: 3.4, lowLabel: 'p05', highLabel: 'p95' }, { label: 'Produced', min: 0, max: 9, mid: 2.1 }], unit: 'kWh' })),
    R.reportSection('Table', R.reportTable({ title: 'Rows', columns: [{ key: 'name', label: 'Name' }, { key: 'v', label: 'Value', num: true }], rows: Array.from({ length: 60 }, (_, i) => ({ name: `<row ${i}>`, v: i * 1.234 })), limit: 5 }))
  ]
})
const out = process.argv[2] || 'report-demo.html'
fs.writeFileSync(out, html)
console.log(`demo written: ${out} (${html.length} bytes)`)
