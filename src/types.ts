export type GpsPoint = [lat: number, lng: number, t: number]
export type LbsRun = [lat: number, lng: number, t: number, durS: number]

export interface Transition {
  dir: 'gnss_to_lbs' | 'lbs_to_gnss'
  from: [number, number]
  to: [number, number]
  at: string
  distM: number
  gapS?: number
  heldS?: number
}

export interface DeviceData {
  tracks: GpsPoint[][]
  lbsTracks: LbsRun[][]
  transitions: Transition[]
}

export interface MapData {
  devices: Record<string, DeviceData>
  antennas: unknown[]
}

export interface Filters {
  devices: string[]
  day: 'all' | '2026-10-05' | '2026-10-06'
  hourFrom: number
  hourTo: number
  layers: { gps: boolean; antennas: boolean; lbsPath: boolean; transitions: boolean }
  rawBounces: boolean
  suspicious: boolean
}

export interface Antenna {
  key: string
  lat: number
  lng: number
  devices: string[]
  points: number
  secondsUsed: number
  first: number
  last: number
  medianGpsDistM: number | null
  suspicious: boolean
}
