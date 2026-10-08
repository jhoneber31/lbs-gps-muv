import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import type { FeatureCollection } from 'geojson'
import type { Filters } from '../types'
import { circlePolygon, formatDist, formatDuration, formatLima } from '../lib/geo'

export interface LayerData {
  gps: FeatureCollection
  lbsPath: FeatureCollection
  transitions: FeatureCollection
  antennas: FeatureCollection
  highlight: FeatureCollection
}

interface Props {
  layers: LayerData
  layerVisibility: Filters['layers']
  suspicious: boolean
  bounds: [number, number, number, number]
  selectedKey: string | null
  onSelect: (key: string | null) => void
}

const c = { gps: '#0b6fa0', lbs: '#c97a1e', flag: '#b3265a', halo: '#ffffff' }

// En el build de producción Vite no empaqueta el worker solo: se indica su URL a mano.
maplibregl.setWorkerUrl(workerUrl)

const STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }
const SOURCES = ['gps', 'lbsPath', 'transitions', 'antennas', 'highlight', 'accuracy'] as const

function arrowImage(): ImageData {
  const s = 24
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.beginPath()
  g.moveTo(s * 0.88, s / 2)
  g.lineTo(s * 0.22, s * 0.16)
  g.lineTo(s * 0.4, s / 2)
  g.lineTo(s * 0.22, s * 0.84)
  g.closePath()
  g.fill()
  return g.getImageData(0, 0, s, s)
}

function setVisible(map: maplibregl.Map, id: string, on: boolean) {
  if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
}

export default function MapView(props: Props) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const latest = useRef(props)
  useEffect(() => {
    latest.current = props
  })

  /** (Re)crea fuentes y capas; se llama en cada carga de estilo. */
  const setup = (map: maplibregl.Map) => {
    if (!map.hasImage('arrow')) map.addImage('arrow', arrowImage(), { sdf: true })
    for (const s of SOURCES) if (!map.getSource(s)) map.addSource(s, { type: 'geojson', data: EMPTY })

    map.addLayer({ id: 'gps', type: 'line', source: 'gps', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': c.gps, 'line-width': 2, 'line-opacity': 0.9 } })
    map.addLayer({ id: 'lbs-path', type: 'line', source: 'lbsPath', layout: { 'line-join': 'round' }, paint: { 'line-color': c.lbs, 'line-width': 1.6, 'line-gap-width': 3.2, 'line-opacity': 0.95 } })
    map.addLayer({ id: 'lbs-arrows', type: 'symbol', source: 'lbsPath', layout: { 'symbol-placement': 'line', 'symbol-spacing': 90, 'icon-image': 'arrow', 'icon-size': 0.55, 'icon-allow-overlap': true, 'icon-rotation-alignment': 'map' }, paint: { 'icon-color': c.lbs, 'icon-halo-color': c.halo, 'icon-halo-width': 1 } })
    map.addLayer({ id: 'transitions-hit', type: 'line', source: 'transitions', paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 14 } })
    map.addLayer({ id: 'transitions-lbs-to-gnss', type: 'line', source: 'transitions', filter: ['==', ['get', 'dir'], 'lbs_to_gnss'], paint: { 'line-color': c.lbs, 'line-width': ['interpolate', ['linear'], ['get', 'distM'], 0, 1.5, 1000, 2.5, 6000, 5] } })
    map.addLayer({ id: 'transitions-gnss-to-lbs', type: 'line', source: 'transitions', filter: ['==', ['get', 'dir'], 'gnss_to_lbs'], paint: { 'line-color': c.lbs, 'line-dasharray': [2, 2], 'line-width': ['interpolate', ['linear'], ['get', 'distM'], 0, 1.5, 1000, 2.5, 6000, 5] } })
    map.addLayer({
      id: 'transitions-label', type: 'symbol', source: 'transitions', filter: ['!=', ['get', 'label'], ''],
      layout: { 'symbol-placement': 'line-center', 'text-field': ['get', 'label'], 'text-font': ['Montserrat Medium', 'Open Sans Bold'], 'text-size': 11, 'text-offset': [0, -0.9] },
      paint: { 'text-color': c.lbs, 'text-halo-color': c.halo, 'text-halo-width': 2 },
    })
    map.addLayer({ id: 'highlight', type: 'line', source: 'highlight', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': c.flag, 'line-width': 4, 'line-opacity': 0.85 } })
    map.addLayer({ id: 'accuracy-fill', type: 'fill', source: 'accuracy', paint: { 'fill-color': c.lbs, 'fill-opacity': 0.12 } })
    map.addLayer({ id: 'accuracy-line', type: 'line', source: 'accuracy', paint: { 'line-color': c.lbs, 'line-width': 1.2, 'line-dasharray': [3, 2] } })
    const radius: maplibregl.ExpressionSpecification = ['min', 22, ['+', 3.5, ['*', 0.22, ['sqrt', ['get', 'secondsUsed']]]]]
    map.addLayer({ id: 'antennas', type: 'circle', source: 'antennas', paint: { 'circle-radius': radius, 'circle-color': c.lbs, 'circle-opacity': 0.55, 'circle-stroke-color': c.lbs, 'circle-stroke-width': 1.2 } })
    map.addLayer({ id: 'antennas-flag', type: 'circle', source: 'antennas', filter: ['==', ['get', 'suspicious'], true], paint: { 'circle-radius': ['+', radius, 4], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': c.flag, 'circle-stroke-width': 2 } })
    sync(map)
  }

  /** Empuja datos y visibilidad actuales al mapa. */
  const sync = (map: maplibregl.Map) => {
    const p = latest.current
    const set = (id: string, d: FeatureCollection) => (map.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(d)
    set('gps', p.layers.gps)
    set('lbsPath', p.layers.lbsPath)
    set('transitions', p.layers.transitions)
    set('antennas', p.layers.antennas)
    set('highlight', p.layers.highlight)
    const v = p.layerVisibility
    setVisible(map, 'gps', v.gps)
    for (const id of ['lbs-path', 'lbs-arrows']) setVisible(map, id, v.lbsPath)
    for (const id of ['transitions-hit', 'transitions-lbs-to-gnss', 'transitions-gnss-to-lbs', 'transitions-label']) setVisible(map, id, v.transitions)
    setVisible(map, 'antennas', v.antennas)
    setVisible(map, 'antennas-flag', v.antennas && p.suspicious)
    setVisible(map, 'highlight', p.selectedKey !== null)
  }

  // Creación del mapa e interacciones (una sola vez)
  useEffect(() => {
    const map = new maplibregl.Map({
      container: el.current!,
      style: STYLE,
      bounds: latest.current.bounds,
      fitBoundsOptions: { padding: 60 },
      attributionControl: { compact: true },
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right')
    map.on('style.load', () => setup(map))

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: 'tip' })
    const setAccuracy = (c: [number, number] | null) => {
      const src = map.getSource('accuracy') as maplibregl.GeoJSONSource | undefined
      src?.setData(c ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circlePolygon(c[1], c[0], 500)] } }] } : EMPTY)
    }
    const row = (k: string, v: string) => `<div class="tip-row"><span>${k}</span><b>${v}</b></div>`

    map.on('mousemove', 'antennas', (e) => {
      const f = e.features?.[0]
      if (!f || f.geometry.type !== 'Point') return
      const p = f.properties
      const [lng, lat] = f.geometry.coordinates as [number, number]
      map.getCanvas().style.cursor = 'pointer'
      setAccuracy([lng, lat])
      popup.setLngLat([lng, lat]).setHTML(
        `<div class="tip-title">Antena LBS${p.suspicious ? ' · <em>sospechosa</em>' : ''}</div>` +
        row('Coord.', `${lat.toFixed(5)}, ${lng.toFixed(5)}`) +
        row('Equipos', String(p.devices)) +
        row('Veces usada', String(p.points)) +
        row('Tiempo total', formatDuration(Number(p.secondsUsed))) +
        row('Primera vez', formatLima(Number(p.first))) +
        row('Última vez', formatLima(Number(p.last))) +
        (p.medianGpsDistM != null && p.medianGpsDistM !== 'null' ? row('Mediana a GPS', formatDist(Number(p.medianGpsDistM))) : ''),
      ).addTo(map)
    })
    map.on('mouseleave', 'antennas', () => {
      map.getCanvas().style.cursor = ''
      setAccuracy(null)
      popup.remove()
    })
    map.on('click', 'antennas', (e) => latest.current.onSelect(String(e.features?.[0]?.properties.key)))
    map.on('click', (e) => {
      if (!map.queryRenderedFeatures(e.point, { layers: ['antennas'].filter((l) => map.getLayer(l)) }).length) latest.current.onSelect(null)
    })

    map.on('mousemove', 'transitions-hit', (e) => {
      if (map.queryRenderedFeatures(e.point, { layers: ['antennas'] }).length) return
      const p = e.features?.[0]?.properties
      if (!p) return
      map.getCanvas().style.cursor = 'pointer'
      const toLbs = p.dir === 'gnss_to_lbs'
      popup.setLngLat(e.lngLat).setHTML(
        `<div class="tip-title">${toLbs ? 'GNSS → LBS' : 'LBS → GNSS'}</div>` +
        row('Equipo', String(p.device)) +
        row('Hora (Lima)', formatLima(String(p.at))) +
        row('Distancia', formatDist(Number(p.distM))) +
        (toLbs ? row('Tiempo sin datos', formatDuration(Number(p.gapS))) : row('Tiempo con ese punto', formatDuration(Number(p.heldS)))),
      ).addTo(map)
    })
    map.on('mouseleave', 'transitions-hit', () => {
      map.getCanvas().style.cursor = ''
      popup.remove()
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Datos / visibilidad
  useEffect(() => {
    const map = mapRef.current
    if (map?.getLayer('antennas')) sync(map)
  }, [props.layers, props.layerVisibility, props.suspicious, props.selectedKey])

  return <div className="absolute inset-0"><div ref={el} style={{ width: "100%", height: "100%" }} /></div>
}
