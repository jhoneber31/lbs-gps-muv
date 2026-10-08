// Genera public/map.json a partir de src/assets/raw/*.json
// Uso: node scripts/map-data.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const rawDir = join(root, 'src/assets/raw')

const GAP_CUT_S = 120 // corte de líneas
const TRANSITION_MAX_S = 600 // 10 min
const GPS_STEP_S = 12 // muestreo del recorrido GPS

const r5 = (n) => Math.round(n * 1e5) / 1e5
const key = (lat, lng) => `${r5(lat)},${r5(lng)}`

function haversine(a, b) {
  const R = 6371000
  const rad = Math.PI / 180
  const dLat = (b[0] - a[0]) * rad
  const dLng = (b[1] - a[1]) * rad
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

const iso = (s) => new Date(s * 1000).toISOString().replace('.000Z', 'Z')

const devices = {}
const antennaMap = new Map()
const counts = {}

for (const file of readdirSync(rawDir).filter((f) => f.endsWith('.json')).sort()) {
  const name = file.replace('.json', '')
  const { rows } = JSON.parse(readFileSync(join(rawDir, file), 'utf8'))

  // Filtros: sin gnss_hold, LBS solo propio (500), orden por timestamp del equipo
  const recs = rows
    .filter(
      (r) =>
        r.position_source === 'gnss' ||
        (r.position_source === 'lbs' && r.accuracy_m === 500),
    )
    .map((r) => ({
      t: Date.parse(r.timestamp) / 1000,
      src: r.position_source === 'gnss' ? 'g' : 'l',
      lat: r.latitude,
      lng: r.longitude,
    }))
    .sort((a, b) => a.t - b.t)

  // Recorrido GPS
  const tracks = []
  let seg = []
  let lastKept = -Infinity
  let prevG = null
  for (const r of recs) {
    if (r.src !== 'g') continue
    if (prevG && r.t - prevG.t > GAP_CUT_S) {
      if (seg.length) tracks.push(seg)
      seg = []
      lastKept = -Infinity
    }
    if (r.t - lastKept >= GPS_STEP_S) {
      seg.push([r5(r.lat), r5(r.lng), Math.round(r.t)])
      lastKept = r.t
    }
    prevG = r
  }
  if (seg.length) tracks.push(seg)

  // Rachas LBS (registros consecutivos con la misma coordenada)
  const runs = [] // {lat,lng,t0,t1,end,idx0,idx1}
  recs.forEach((r, i) => {
    if (r.src !== 'l') return
    const last = runs[runs.length - 1]
    if (last && last.idx1 === i - 1 && key(last.lat, last.lng) === key(r.lat, r.lng)) {
      last.t1 = r.t
      last.idx1 = i
    } else {
      runs.push({ lat: r.lat, lng: r.lng, t0: r.t, t1: r.t, idx0: i, idx1: i })
    }
  })
  for (const run of runs) {
    const next = recs[run.idx1 + 1]
    run.dur = Math.round(
      (next && next.t - run.t1 <= GAP_CUT_S ? next.t : run.t1) - run.t0,
    )
    const k = key(run.lat, run.lng)
    let a = antennaMap.get(k)
    if (!a) {
      a = { lat: r5(run.lat), lng: r5(run.lng), devices: new Set(), points: 0, secondsUsed: 0, first: run.t0, last: run.t1 }
      antennaMap.set(k, a)
    }
    a.devices.add(name)
    a.points += 1
    a.secondsUsed += run.dur
    a.first = Math.min(a.first, run.t0)
    a.last = Math.max(a.last, run.t1)
  }

  // Secuencia LBS en tramos (corte por >120 s o GPS en medio)
  const lbsTracks = []
  let cur = []
  runs.forEach((run, i) => {
    const prev = runs[i - 1]
    if (prev) {
      const gpsBetween = recs.slice(prev.idx1 + 1, run.idx0).some((r) => r.src === 'g')
      if (gpsBetween || run.t0 - prev.t1 > GAP_CUT_S) {
        if (cur.length) lbsTracks.push(cur)
        cur = []
      }
    }
    cur.push([r5(run.lat), r5(run.lng), Math.round(run.t0), run.dur])
  })
  if (cur.length) lbsTracks.push(cur)

  // Transiciones
  const transitions = []
  for (let i = 1; i < recs.length; i++) {
    const a = recs[i - 1]
    const b = recs[i]
    if (a.src === b.src || b.t - a.t >= TRANSITION_MAX_S) continue
    const from = [r5(a.lat), r5(a.lng)]
    const to = [r5(b.lat), r5(b.lng)]
    const distM = Math.round(haversine(from, to))
    if (a.src === 'g') {
      transitions.push({ dir: 'gnss_to_lbs', from, to, at: iso(b.t), distM, gapS: Math.round(b.t - a.t) })
    } else {
      const run = runs.find((x) => x.idx1 === i - 1)
      transitions.push({ dir: 'lbs_to_gnss', from, to, at: iso(b.t), distM, heldS: Math.round(b.t - run.t0) })
    }
  }

  devices[name] = { tracks, lbsTracks, transitions }
  counts[name] = {
    gnss: recs.filter((r) => r.src === 'g').length,
    lbsRegistros: recs.filter((r) => r.src === 'l').length,
    lbsPuntos: runs.length,
    g2l: transitions.filter((t) => t.dir === 'gnss_to_lbs').length,
    l2g: transitions.filter((t) => t.dir === 'lbs_to_gnss').length,
    desde: recs.length ? iso(recs[0].t) : null,
    hasta: recs.length ? iso(recs[recs.length - 1].t) : null,
  }
}

const antennas = [...antennaMap.values()].map((a) => ({
  ...a,
  devices: [...a.devices].sort(),
  first: iso(a.first),
  last: iso(a.last),
}))

writeFileSync(join(root, 'public/map.json'), JSON.stringify({ devices, antennas }))
console.table(counts)
const tot = Object.values(counts).reduce(
  (s, c) => ({ g2l: s.g2l + c.g2l, l2g: s.l2g + c.l2g }),
  { g2l: 0, l2g: 0 },
)
console.log('Totales transiciones:', tot, '(esperado 75 / 82)')
console.log('Antenas:', antennas.length)
