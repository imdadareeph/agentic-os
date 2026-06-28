export interface VitalMetric {
  id: string
  label: string
  value: string
  change: string
  changeUp: boolean
  sparkline: number[]
  live: boolean
}

export interface VitalsResponse {
  updatedAt: string
  vitals: VitalMetric[]
  liveCount: number
}
