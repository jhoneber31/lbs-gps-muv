import type { Antenna, Filters, MapData } from '../types'
import { limaDayKey, limaParts } from '../lib/geo'

interface Props {
  data: MapData
  filters: Filters
  antennas: Antenna[]
}

/** Totales con los filtros actuales; sin filtros deben dar 75 / 82 (ver resultados.md). */
export default function Summary({ data, filters: f, antennas }: Props) {
  const inRange = (t: number) => {
    if (f.day !== 'all' && limaDayKey(t) !== f.day) return false
    const { hour } = limaParts(t)
    return hour >= f.hourFrom && hour < f.hourTo
  }
  let g2l = 0, l2g = 0
  const lbsByDevice: Record<string, number> = {}
  for (const n of f.devices) {
    const d = data.devices[n]
    for (const t of d.transitions) {
      if (!inRange(Date.parse(t.at) / 1000)) continue
      if (t.dir === 'gnss_to_lbs') g2l++
      else l2g++
    }
    lbsByDevice[n] = d.lbsTracks.reduce((s, seg) => s + seg.filter((r) => inRange(r[2])).length, 0)
  }
  const flagged = antennas.filter((a) => a.suspicious).length

  return (
    <aside className="panel summary" aria-label="Resumen">
      <div className="stat"><b>{g2l}</b><span>GNSS → LBS</span></div>
      <div className="stat"><b>{l2g}</b><span>LBS → GNSS</span></div>
      <div className="stat"><b>{antennas.length}</b><span>antenas</span></div>
      {f.suspicious && <div className="stat flag"><b>{flagged}</b><span>sospechosas</span></div>}
      <details>
        <summary>Puntos LBS por equipo</summary>
        <ul>
          {Object.entries(lbsByDevice).map(([n, c]) => (<li key={n}><span>{n}</span><b>{c}</b></li>))}
        </ul>
      </details>
    </aside>
  )
}
