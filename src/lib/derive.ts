import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { Antenna, Filters, LbsRun, MapData } from '../types'
import { coordKey, limaDayKey, limaParts, median } from './geo'

const BOUNCE_MAX_S = 30
const SUSPICIOUS_M = 1500
const SUSPICIOUS_MIN_SAMPLES = 2

export const DAYS = ['2026-10-05', '2026-10-06'] as const

function inRange(t: number, f: Filters) {
  if (f.day !== 'all' && limaDayKey(t) !== f.day) return false
  const { hour } = limaParts(t)
  return hour >= f.hourFrom && hour < f.hourTo
}

/** Quita B en A→B→A cuando B dura menos de BOUNCE_MAX_S y funde repetidos. */
function collapseBounces(runs: LbsRun[]): LbsRun[] {
  const out = [...runs]
  let changed = true
  while (changed) {
    changed = false
    for (let i = 1; i < out.length - 1; i++) {
      if (
        out[i][3] < BOUNCE_MAX_S &&
        coordKey(out[i - 1][0], out[i - 1][1]) === coordKey(out[i + 1][0], out[i + 1][1])
      ) {
        out[i - 1] = [out[i - 1][0], out[i - 1][1], out[i - 1][2], out[i - 1][3] + out[i][3] + out[i + 1][3]]
        out.splice(i, 2)
        changed = true
        break
      }
    }
  }
  return out
}

/** Antenas sospechosas: mediana de distancia al primer GPS (LBS→GNSS) sobre el límite. */
export function gpsDistanceByAntenna(data: MapData) {
  const samples = new Map<string, number[]>()
  for (const d of Object.values(data.devices)) {
    for (const t of d.transitions) {
      if (t.dir !== 'lbs_to_gnss') continue
      const k = coordKey(t.from[0], t.from[1])
      const arr = samples.get(k) ?? []
      arr.push(t.distM)
      samples.set(k, arr)
    }
  }
  const result = new Map<string, { median: number; n: number }>()
  for (const [k, v] of samples) result.set(k, { median: median(v), n: v.length })
  return result
}

export function buildAntennas(
  data: MapData,
  f: Filters,
  gpsDist: ReturnType<typeof gpsDistanceByAntenna>,
): Antenna[] {
  const map = new Map<string, Antenna>()
  for (const name of f.devices) {
    for (const track of data.devices[name].lbsTracks) {
      for (const [lat, lng, t, dur] of track) {
        if (!inRange(t, f)) continue
        const key = coordKey(lat, lng)
        let a = map.get(key)
        if (!a) {
          const g = gpsDist.get(key)
          a = {
            key, lat, lng, devices: [], points: 0, secondsUsed: 0, first: t, last: t,
            medianGpsDistM: g ? g.median : null,
            suspicious: !!g && g.n >= SUSPICIOUS_MIN_SAMPLES && g.median > SUSPICIOUS_M,
          }
          map.set(key, a)
        }
        if (!a.devices.includes(name)) a.devices.push(name)
        a.points += 1
        a.secondsUsed += dur
        a.first = Math.min(a.first, t)
        a.last = Math.max(a.last, t)
      }
    }
  }
  return [...map.values()]
}

const line = (coords: number[][], props: object = {}): Feature<LineString> => ({
  type: 'Feature',
  properties: props,
  geometry: { type: 'LineString', coordinates: coords },
})

function splitByRange<T extends number[]>(seg: T[], tIdx: number, f: Filters): T[][] {
  const out: T[][] = []
  let cur: T[] = []
  for (const p of seg) {
    if (inRange(p[tIdx], f)) cur.push(p)
    else if (cur.length) {
      out.push(cur)
      cur = []
    }
  }
  if (cur.length) out.push(cur)
  return out
}

export function buildLayers(data: MapData, f: Filters, antennas: Antenna[]) {
  const gps: Feature<LineString>[] = []
  const lbsPath: Feature<LineString>[] = []
  const transitions: Feature[] = []

  for (const name of f.devices) {
    const d = data.devices[name]
    for (const seg of d.tracks)
      for (const part of splitByRange(seg, 2, f))
        if (part.length > 1) gps.push(line(part.map((p) => [p[1], p[0]]), { device: name }))

    for (const seg of d.lbsTracks)
      for (const part of splitByRange(seg, 2, f)) {
        const runs = f.rawBounces ? part : collapseBounces(part)
        if (runs.length > 1) lbsPath.push(line(runs.map((p) => [p[1], p[0]]), { device: name }))
      }

    d.transitions.forEach((t) => {
      if (!inRange(Date.parse(t.at) / 1000, f)) return
      transitions.push(
        line([[t.from[1], t.from[0]], [t.to[1], t.to[0]]], {
          device: name,
          dir: t.dir,
          at: t.at,
          distM: t.distM,
          gapS: t.gapS ?? null,
          heldS: t.heldS ?? null,
          label: t.distM >= 1000 ? `${(t.distM / 1000).toFixed(1).replace('.', ',')} km` : '',
        }),
      )
    })
  }

  const antennaPts: Feature<Point>[] = antennas.map((a) => ({
    type: 'Feature',
    properties: {
      key: a.key,
      devices: a.devices.join(', '),
      points: a.points,
      secondsUsed: a.secondsUsed,
      first: a.first,
      last: a.last,
      suspicious: a.suspicious,
      medianGpsDistM: a.medianGpsDistM,
    },
    geometry: { type: 'Point', coordinates: [a.lng, a.lat] },
  }))

  const fc = <G extends Feature>(features: G[]): FeatureCollection => ({ type: 'FeatureCollection', features })
  return {
    gps: fc(gps),
    lbsPath: fc(lbsPath),
    transitions: fc(transitions),
    antennas: fc(antennaPts),
  }
}

/** Tramos del recorrido LBS que tocan una antena (anterior → antena → siguiente). */
export function highlightFor(data: MapData, f: Filters, key: string): FeatureCollection {
  const feats: Feature<LineString>[] = []
  for (const name of f.devices) {
    for (const seg of data.devices[name].lbsTracks) {
      seg.forEach((r, i) => {
        if (coordKey(r[0], r[1]) !== key || !inRange(r[2], f)) return
        const a = seg[i - 1] ?? r
        const b = seg[i + 1] ?? r
        feats.push(line([[a[1], a[0]], [r[1], r[0]], [b[1], b[0]]]))
      })
    }
  }
  return { type: 'FeatureCollection', features: feats }
}
