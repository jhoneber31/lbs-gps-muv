import type { Filters, MapData } from '../types'

interface Props {
  data: MapData
  filters: Filters
  onChange: (f: Filters) => void
}

const LAYERS: { key: keyof Filters['layers']; label: string; swatch: string }[] = [
  { key: 'gps', label: 'Recorrido GPS', swatch: 'sw-gps' },
  { key: 'antennas', label: 'Antenas LBS', swatch: 'sw-ant' },
  { key: 'lbsPath', label: 'Recorrido LBS', swatch: 'sw-lbs' },
  { key: 'transitions', label: 'Transiciones', swatch: 'sw-tr' },
]

export default function Controls({ data, filters: f, onChange }: Props) {
  const names = Object.keys(data.devices)
  const set = (patch: Partial<Filters>) => onChange({ ...f, ...patch })
  const toggleDevice = (n: string) => {
    const next = f.devices.includes(n) ? f.devices.filter((d) => d !== n) : [...f.devices, n]
    set({ devices: names.filter((d) => next.includes(d)) })
  }
  const hours = Array.from({ length: 25 }, (_, i) => i)

  return (
    <header className="bar">
      <div className="bar-row">
        <h1 className="brand"><span className="brand-mark" />GPS <i>/</i> LBS</h1>

        <fieldset className="group" aria-label="Dispositivos">
          <legend>Equipo</legend>
          <div className="chips">
            {names.map((n) => (
              <button key={n} className="chip" aria-pressed={f.devices.includes(n)} onClick={() => toggleDevice(n)}>{n}</button>
            ))}
            <button className="chip ghost" onClick={() => set({ devices: f.devices.length === names.length ? [] : names })}>
              {f.devices.length === names.length ? 'Ninguno' : 'Todos'}
            </button>
          </div>
        </fieldset>

        <fieldset className="group" aria-label="Día">
          <legend>Día (Lima)</legend>
          <div className="seg">
            {([['all', 'Ambos'], ['2026-10-05', '5 oct'], ['2026-10-06', '6 oct']] as const).map(([v, l]) => (
              <button key={v} aria-pressed={f.day === v} onClick={() => set({ day: v })}>{l}</button>
            ))}
          </div>
        </fieldset>

        <fieldset className="group" aria-label="Rango de horas">
          <legend>Horas</legend>
          <div className="hours">
            <select value={f.hourFrom} onChange={(e) => { const v = +e.target.value; set({ hourFrom: v, hourTo: Math.max(v + 1, f.hourTo) }) }}>
              {hours.slice(0, 24).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
            <span>→</span>
            <select value={f.hourTo} onChange={(e) => { const v = +e.target.value; set({ hourTo: v, hourFrom: Math.min(v - 1, f.hourFrom) }) }}>
              {hours.slice(1).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </div>
        </fieldset>

      </div>

      <div className="bar-row sub">
        <div className="layer-toggles" role="group" aria-label="Capas">
          {LAYERS.map((l) => (
            <label key={l.key} className="toggle">
              <input type="checkbox" checked={f.layers[l.key]} onChange={(e) => set({ layers: { ...f.layers, [l.key]: e.target.checked } })} />
              <span className={`sw ${l.swatch}`} />{l.label}
            </label>
          ))}
        </div>
        <div className="layer-toggles">
          <label className="toggle" title="Mostrar la secuencia LBS sin colapsar los A→B→A">
            <input type="checkbox" checked={f.rawBounces} onChange={(e) => set({ rawBounces: e.target.checked })} />
            Rebotes en crudo
          </label>
          <label className="toggle" title="Antenas cuya mediana de distancia al GPS supera 1,5 km">
            <input type="checkbox" checked={f.suspicious} onChange={(e) => set({ suspicious: e.target.checked })} />
            Marcar antenas sospechosas
          </label>
        </div>
      </div>
    </header>
  )
}
