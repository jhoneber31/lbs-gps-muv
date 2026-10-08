const LIMA_OFFSET_S = 5 * 3600

export const coordKey = (lat: number, lng: number) =>
  `${Math.round(lat * 1e5) / 1e5},${Math.round(lng * 1e5) / 1e5}`

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Polígono aproximado de un círculo de radio `r` metros. */
export function circlePolygon(lat: number, lng: number, r: number, steps = 64) {
  const dLat = r / 111320
  const dLng = r / (111320 * Math.cos((lat * Math.PI) / 180))
  const ring: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)])
  }
  return ring
}

/** Hora local de Lima (UTC−5) a partir de segundos epoch. */
export function limaParts(t: number) {
  const local = t - LIMA_OFFSET_S
  const day = Math.floor(local / 86400)
  const hour = (local - day * 86400) / 3600
  return { day, hour }
}

export function limaDayKey(t: number) {
  return new Date((t - LIMA_OFFSET_S) * 1000).toISOString().slice(0, 10)
}

export function formatLima(t: number | string) {
  const s = typeof t === 'string' ? Date.parse(t) / 1000 : t
  const d = new Date((s - LIMA_OFFSET_S) * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())}-${['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][d.getUTCMonth()]} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}

export function formatDist(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(m)} m`
}

export function formatDuration(s: number) {
  if (s < 60) return `${Math.round(s)} s`
  if (s < 3600) return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`
  return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`
}
