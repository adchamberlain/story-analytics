// ── Economic time series (24 months, 3 indicators) ──────────────────────────
export interface EconomicDataPoint {
  month: string
  gdpGrowth: number
  unemployment: number
  inflation: number
}

export const economicData: EconomicDataPoint[] = [
  { month: '2023-01', gdpGrowth: 2.1, unemployment: 3.6, inflation: 6.4 },
  { month: '2023-02', gdpGrowth: 2.0, unemployment: 3.5, inflation: 6.0 },
  { month: '2023-03', gdpGrowth: 1.9, unemployment: 3.5, inflation: 5.0 },
  { month: '2023-04', gdpGrowth: 2.0, unemployment: 3.4, inflation: 4.9 },
  { month: '2023-05', gdpGrowth: 2.2, unemployment: 3.7, inflation: 4.0 },
  { month: '2023-06', gdpGrowth: 2.4, unemployment: 3.6, inflation: 3.0 },
  { month: '2023-07', gdpGrowth: 2.4, unemployment: 3.5, inflation: 3.2 },
  { month: '2023-08', gdpGrowth: 2.2, unemployment: 3.8, inflation: 3.7 },
  { month: '2023-09', gdpGrowth: 2.1, unemployment: 3.8, inflation: 3.7 },
  { month: '2023-10', gdpGrowth: 2.3, unemployment: 3.9, inflation: 3.2 },
  { month: '2023-11', gdpGrowth: 2.5, unemployment: 3.7, inflation: 3.1 },
  { month: '2023-12', gdpGrowth: 2.6, unemployment: 3.7, inflation: 3.4 },
  { month: '2024-01', gdpGrowth: 2.7, unemployment: 3.7, inflation: 3.1 },
  { month: '2024-02', gdpGrowth: 2.9, unemployment: 3.9, inflation: 3.2 },
  { month: '2024-03', gdpGrowth: 3.0, unemployment: 3.8, inflation: 3.5 },
  { month: '2024-04', gdpGrowth: 2.8, unemployment: 3.9, inflation: 3.4 },
  { month: '2024-05', gdpGrowth: 2.7, unemployment: 4.0, inflation: 3.3 },
  { month: '2024-06', gdpGrowth: 2.8, unemployment: 4.1, inflation: 3.0 },
  { month: '2024-07', gdpGrowth: 3.0, unemployment: 4.3, inflation: 2.9 },
  { month: '2024-08', gdpGrowth: 2.9, unemployment: 4.2, inflation: 2.5 },
  { month: '2024-09', gdpGrowth: 3.1, unemployment: 4.1, inflation: 2.4 },
  { month: '2024-10', gdpGrowth: 3.2, unemployment: 4.1, inflation: 2.6 },
  { month: '2024-11', gdpGrowth: 3.3, unemployment: 4.2, inflation: 2.7 },
  { month: '2024-12', gdpGrowth: 3.1, unemployment: 4.0, inflation: 2.5 },
]

export const economicSeries = [
  { key: 'gdpGrowth' as const, label: 'GDP Growth (%)' },
  { key: 'unemployment' as const, label: 'Unemployment (%)' },
  { key: 'inflation' as const, label: 'Inflation (%)' },
]

// ── Country survey data (8 countries, satisfaction + life expectancy) ────────
export interface CountryDataPoint {
  country: string
  satisfaction: number
  lifeExpectancy: number
}

export const countryData: CountryDataPoint[] = [
  { country: 'Finland', satisfaction: 7.8, lifeExpectancy: 82.0 },
  { country: 'Denmark', satisfaction: 7.6, lifeExpectancy: 81.4 },
  { country: 'Switzerland', satisfaction: 7.5, lifeExpectancy: 83.8 },
  { country: 'Netherlands', satisfaction: 7.4, lifeExpectancy: 82.3 },
  { country: 'Norway', satisfaction: 7.3, lifeExpectancy: 83.2 },
  { country: 'Canada', satisfaction: 6.9, lifeExpectancy: 82.4 },
  { country: 'United States', satisfaction: 6.7, lifeExpectancy: 77.3 },
  { country: 'Japan', satisfaction: 6.1, lifeExpectancy: 84.6 },
]

// ── Research scatter data (hours studied vs test score, 2 groups) ────────────
export interface ScatterDataPoint {
  hours: number
  score: number
  group: 'Control' | 'Treatment'
}

export const scatterData: ScatterDataPoint[] = [
  // Control group
  { hours: 1.0, score: 52, group: 'Control' },
  { hours: 1.5, score: 55, group: 'Control' },
  { hours: 2.0, score: 58, group: 'Control' },
  { hours: 2.5, score: 60, group: 'Control' },
  { hours: 3.0, score: 62, group: 'Control' },
  { hours: 3.5, score: 63, group: 'Control' },
  { hours: 4.0, score: 65, group: 'Control' },
  { hours: 4.5, score: 67, group: 'Control' },
  { hours: 5.0, score: 68, group: 'Control' },
  { hours: 5.5, score: 70, group: 'Control' },
  { hours: 6.0, score: 72, group: 'Control' },
  { hours: 6.5, score: 73, group: 'Control' },
  { hours: 7.0, score: 74, group: 'Control' },
  { hours: 7.5, score: 76, group: 'Control' },
  { hours: 8.0, score: 77, group: 'Control' },
  // Treatment group
  { hours: 1.0, score: 58, group: 'Treatment' },
  { hours: 1.5, score: 62, group: 'Treatment' },
  { hours: 2.0, score: 65, group: 'Treatment' },
  { hours: 2.5, score: 68, group: 'Treatment' },
  { hours: 3.0, score: 72, group: 'Treatment' },
  { hours: 3.5, score: 74, group: 'Treatment' },
  { hours: 4.0, score: 77, group: 'Treatment' },
  { hours: 4.5, score: 79, group: 'Treatment' },
  { hours: 5.0, score: 82, group: 'Treatment' },
  { hours: 5.5, score: 84, group: 'Treatment' },
  { hours: 6.0, score: 86, group: 'Treatment' },
  { hours: 6.5, score: 87, group: 'Treatment' },
  { hours: 7.0, score: 89, group: 'Treatment' },
  { hours: 7.5, score: 91, group: 'Treatment' },
  { hours: 8.0, score: 93, group: 'Treatment' },
]

// ── CPI data for area chart ─────────────────────────────────────────────────
export interface CpiDataPoint {
  month: string
  cpi: number
}

export const cpiData: CpiDataPoint[] = economicData.map((d) => ({
  month: d.month,
  cpi: 290 + (economicData.indexOf(d) * 2.5) + (Math.sin(economicData.indexOf(d) * 0.5) * 3),
}))
