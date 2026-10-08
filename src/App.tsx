import { useEffect, useMemo, useState } from 'react'
import type { Filters, MapData } from './types'
import MapView, { type LayerData } from './components/MapView'
import Controls from './components/Controls'
import Legend from './components/Legend'
import Summary from './components/Summary'
import { buildAntennas, buildLayers, gpsDistanceByAntenna, highlightFor } from './lib/derive'
import { formatDist, formatDuration, formatLima } from './lib/geo'

function dataBounds(data: MapData): [number, number, number, number] {
  let w = 180, s = 90, e = -180, n = -90
  const add = (lat: number, lng: number) => {
    w = Math.min(w, lng); e = Math.max(e, lng); s = Math.min(s, lat); n = Math.max(n, lat)
  }
  for (const d of Object.values(data.devices)) {
    d.tracks.forEach((t) => t.forEach((p) => add(p[0], p[1])))
    d.lbsTracks.forEach((t) => t.forEach((p) => add(p[0], p[1])))
  }
  return [w, s, e, n]
}

export default function App() {
  const [data, setData] = useState<MapData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters | null>(null)

  useEffect(() => {
    fetch('/map.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: MapData) => {
        setData(d)
        setFilters({
          devices: Object.keys(d.devices),
          day: 'all',
          hourFrom: 0,
          hourTo: 24,
          layers: { gps: true, antennas: true, lbsPath: true, transitions: true },
          rawBounces: false,
          suspicious: false,
        })
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  const gpsDist = useMemo(() => (data ? gpsDistanceByAntenna(data) : null), [data])
  const bounds = useMemo(() => (data ? dataBounds(data) : null), [data])

  const derived = useMemo(() => {
    if (!data || !filters || !gpsDist) return null
    const antennas = buildAntennas(data, filters, gpsDist)
    const base = buildLayers(data, filters, antennas)
    const layers: LayerData = {
      ...base,
      highlight: selected ? highlightFor(data, filters, selected) : { type: 'FeatureCollection', features: [] },
    }
    return { antennas, layers }
  }, [data, filters, gpsDist, selected])

  if (error)
    return <div className="grid h-full place-items-center p-6 text-center">No se pudo cargar map.json ({error}). Ejecuta <code>node scripts/map-data.mjs</code>.</div>
  if (!data || !filters || !derived || !bounds)
    return <div className="grid h-full place-items-center"><span className="pulse-dot" /></div>

  const sel = selected ? derived.antennas.find((a) => a.key === selected) : null

  return (
    <div className="flex h-full flex-col">
      <Controls data={data} filters={filters} onChange={setFilters} />
      <div className="relative min-h-0 flex-1">
        <MapView
          layers={derived.layers}
          layerVisibility={filters.layers}
          suspicious={filters.suspicious}
          bounds={bounds}
          selectedKey={selected}
          onSelect={setSelected}
        />
        <Legend suspicious={filters.suspicious} />
        <Summary data={data} filters={filters} antennas={derived.antennas} />
        {sel && (
          <aside className="panel selected-panel">
            <header>
              <span>Antena seleccionada</span>
              <button onClick={() => setSelected(null)} aria-label="Cerrar">✕</button>
            </header>
            <dl>
              <dt>Coord.</dt><dd>{sel.lat.toFixed(5)}, {sel.lng.toFixed(5)}</dd>
              <dt>Equipos</dt><dd>{sel.devices.join(', ')}</dd>
              <dt>Veces usada</dt><dd>{sel.points}</dd>
              <dt>Tiempo total</dt><dd>{formatDuration(sel.secondsUsed)}</dd>
              <dt>Visto</dt><dd>{formatLima(sel.first)} → {formatLima(sel.last)}</dd>
              {sel.medianGpsDistM != null && (<><dt>Mediana a GPS</dt><dd>{formatDist(sel.medianGpsDistM)}</dd></>)}
            </dl>
            <p>Los momentos de uso están resaltados en el recorrido.</p>
          </aside>
        )}
      </div>
    </div>
  )
}
