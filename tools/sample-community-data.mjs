// Deterministic sample input for the Empower-X community algorithms
// (basic, anomalies, community, profile), in the ZertiPower format they parse:
// { data: [ { id, name, cups: [ { id, place_type, energy_hourly: [ { id, cups_id, info_dt, kwh_in, kwh_out, production, battery } ] } ] } ] }
//
//   node tools/sample-community-data.mjs <output-file> [days=21]
//
// Made-up but realistic: municipal buildings with typical daily shapes, some with
// solar, plus injected anomalies (consumption spikes and a 2-day outage).
import fs from 'node:fs'

const out = process.argv[2] || 'community_sample'
const DAYS = Number(process.argv[3] || 21)
const START = Date.UTC(2026, 2, 1) // 2026-03-01

let seed = 42
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
const noise = (scale) => (rand() - 0.5) * 2 * scale

// Hourly base load (kWh) by place type: [night, morning, day, evening]
const PROFILES = {
  education: (h, wd) => (wd < 5 && h >= 8 && h < 17 ? 9 : 1.5),
  office: (h, wd) => (wd < 5 && h >= 8 && h < 19 ? 12 : 2),
  sports: (h) => (h >= 16 && h < 23 ? 14 : h >= 7 && h < 16 ? 6 : 2),
  street_lighting: (h) => (h >= 19 || h < 7 ? 18 : 0.2),
  swimming_pool: (h) => (h >= 7 && h < 22 ? 22 : 12),
  healthcare: (h) => (h >= 8 && h < 20 ? 15 : 8)
}
const solarShape = (h) => Math.max(0, Math.sin(((h - 7) / 12) * Math.PI)) // ~07:00–19:00

function cupsId(n) {
  return `ES0031408${String(70250000 + n * 137).padStart(10, '0')}${['CG', 'AB', 'ZX', 'KL'][n % 4]}0F`
}

const COMMUNITIES = [
  { id: 'comm-rubi-01', name: 'Rubí – Equipaments municipals', cups: [
    ['education', 0], ['education', 8], ['office', 0], ['sports', 25], ['street_lighting', 0], ['street_lighting', 0], ['swimming_pool', 30], ['healthcare', 0]] },
  { id: 'comm-rubi-02', name: 'Rubí – Comunitat energètica Can Fatjó', cups: [
    ['office', 12], ['education', 0], ['sports', 0], ['healthcare', 15], ['street_lighting', 0]] }
]

let n = 0
let recId = 1
const data = COMMUNITIES.map((c) => ({
  id: c.id,
  name: c.name,
  cups: c.cups.map(([type, solarKwp]) => {
    const id = cupsId(++n)
    const outage = n === 3 ? [9, 10] : [] // supply point 3 reports zero for two days
    const energy_hourly = []
    for (let d = 0; d < DAYS; d++) {
      const date = new Date(START + d * 86400000)
      const wd = (date.getUTCDay() + 6) % 7 // 0 = Monday
      const cloud = 0.4 + 0.6 * rand() // daily cloudiness
      for (let h = 0; h < 24; h++) {
        let load = Math.max(0, PROFILES[type](h, wd) * (1 + noise(0.15)))
        const production = solarKwp ? solarKwp * 0.8 * solarShape(h) * cloud : 0
        if (n === 5 && d === 6 && h === 21) load *= 9 // a consumption spike
        if (n === 9 && d === 14 && h === 3) load *= 12 // another spike, at night
        let kwhIn = Math.max(0, load - production)
        let kwhOut = Math.max(0, production - load)
        if (outage.includes(d)) { kwhIn = 0; kwhOut = 0 }
        energy_hourly.push({
          id: recId++,
          cups_id: id,
          info_dt: `${date.toISOString().slice(0, 10)} ${String(h).padStart(2, '0')}:00:00`,
          kwh_in: Number(kwhIn.toFixed(3)),
          kwh_out: Number(kwhOut.toFixed(3)),
          production: Number(production.toFixed(3)),
          battery: 0
        })
      }
    }
    return { id, place_type: type, energy_hourly }
  })
}))

fs.writeFileSync(out, JSON.stringify({ data }))
console.log(`${out}: ${data.length} communities, ${n} supply points, ${recId - 1} hourly records`)
