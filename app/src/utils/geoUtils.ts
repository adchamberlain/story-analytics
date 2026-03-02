/**
 * Geography utilities for choropleth maps.
 * Handles TopoJSON loading, projection, and data-to-geography joining.
 */

import * as topojson from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { FeatureCollection, Feature, Geometry } from 'geojson'

// ── Basemap Registry ──────────────────────────────────────────────────────

export type BasemapId = 'world' | 'us-states' | 'us-counties' | 'europe'

export interface BasemapMeta {
  id: BasemapId
  label: string
  path: string
  objectKey: string          // TopoJSON object key
  idProperty: string         // Feature property to match data against
  defaultProjection: string  // D3 projection name
}

export const BASEMAPS: BasemapMeta[] = [
  {
    id: 'world',
    label: 'World Countries',
    path: '/basemaps/world-countries.json',
    objectKey: 'countries',
    idProperty: 'id',            // ISO 3166-1 numeric
    defaultProjection: 'geoMercator',
  },
  {
    id: 'us-states',
    label: 'US States',
    path: '/basemaps/us-states.json',
    objectKey: 'states',
    idProperty: 'id',            // FIPS state code
    defaultProjection: 'geoAlbersUsa',
  },
  {
    id: 'us-counties',
    label: 'US Counties',
    path: '/basemaps/us-counties.json',
    objectKey: 'counties',
    idProperty: 'id',            // FIPS county code
    defaultProjection: 'geoAlbersUsa',
  },
  {
    id: 'europe',
    label: 'Europe',
    path: '/basemaps/europe-countries.json',
    objectKey: 'countries',
    idProperty: 'id',            // ISO 3166-1 numeric
    defaultProjection: 'geoMercator',
  },
]

// ── TopoJSON Loading ──────────────────────────────────────────────────────

const topoCache = new Map<string, Topology>()

export async function loadBasemap(basemapId: BasemapId): Promise<FeatureCollection> {
  const meta = BASEMAPS.find((b) => b.id === basemapId)
  if (!meta) throw new Error(`Unknown basemap: ${basemapId}`)

  let topo = topoCache.get(meta.path)
  if (!topo) {
    const resp = await fetch(meta.path)
    if (!resp.ok) throw new Error(`Failed to load basemap: ${resp.statusText}`)
    topo = (await resp.json()) as Topology
    topoCache.set(meta.path, topo)
  }

  const obj = topo.objects[meta.objectKey] as GeometryCollection
  const fc = topojson.feature(topo, obj) as unknown as FeatureCollection

  // Strip Antarctica from the world basemap — it's not a real country and
  // wastes vertical space that could be used by the actual countries.
  if (basemapId === 'world') {
    fc.features = fc.features.filter(
      (f) => f.properties?.name !== 'Antarctica' && String(f.id ?? f.properties?.id) !== '010',
    )
  }

  return fc
}

export async function loadCustomGeoJSON(file: File): Promise<FeatureCollection> {
  const text = await file.text()
  const json = JSON.parse(text)

  // If it's a Topology, convert to GeoJSON
  if (json.type === 'Topology') {
    const key = Object.keys(json.objects)[0]
    return topojson.feature(json as Topology, json.objects[key] as GeometryCollection) as unknown as FeatureCollection
  }

  // Already GeoJSON
  if (json.type === 'FeatureCollection') return json as FeatureCollection
  throw new Error('File must be GeoJSON FeatureCollection or TopoJSON Topology')
}

// ── Data Joining ──────────────────────────────────────────────────────────

export interface JoinedFeature {
  feature: Feature<Geometry>
  value: number | null
  label: string
}

/** US state abbreviation → full name mapping for flexible join matching */
const US_STATE_ABBREV: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
  CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
  HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
  KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',
  MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',
  MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',
  OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',
  VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
  DC:'District of Columbia',PR:'Puerto Rico',
}

/** Reverse: full state name (lowercase) → abbreviation */
const US_STATE_NAME_TO_ABBREV = new Map<string, string>(
  Object.entries(US_STATE_ABBREV).map(([abbr, name]) => [name.toLowerCase(), abbr])
)

/**
 * Join data rows to geography features by matching joinColumn values to feature IDs.
 * Returns features enriched with the matched data value.
 * Supports matching on feature ID, name, and US state abbreviations.
 */
export function joinDataToFeatures(
  features: FeatureCollection,
  data: Record<string, unknown>[],
  joinColumn: string,
  valueColumn: string,
  basemapId: BasemapId,
): JoinedFeature[] {
  const meta = BASEMAPS.find((b) => b.id === basemapId)
  const idProp = meta?.idProperty ?? 'id'
  const isUsStates = basemapId === 'us-states'

  // Build lookup: data join value → numeric value
  // For US states, also index by normalized abbreviation and full name
  const dataMap = new Map<string, number>()
  for (const row of data) {
    const key = String(row[joinColumn] ?? '').trim()
    const val = Number(row[valueColumn])
    if (key && isFinite(val)) {
      dataMap.set(key, val)
      if (isUsStates) {
        // If key is an abbreviation like "CA", also store under full name "California"
        const fullName = US_STATE_ABBREV[key.toUpperCase()]
        if (fullName) dataMap.set(fullName, val)
        // If key is a full name like "California", also store under abbreviation "CA"
        const abbrev = US_STATE_NAME_TO_ABBREV.get(key.toLowerCase())
        if (abbrev) dataMap.set(abbrev, val)
      }
    }
  }

  return features.features.map((f) => {
    const featureId = String(f.properties?.[idProp] ?? f.id ?? '')
    const featureName = String(f.properties?.name ?? f.properties?.NAME ?? featureId)
    const value = dataMap.get(featureId) ?? dataMap.get(featureName) ?? null

    return { feature: f, value, label: featureName }
  })
}

// ── Projections ───────────────────────────────────────────────────────────

export const PROJECTIONS = [
  { id: 'geoEqualEarth', label: 'Equal Earth' },
  { id: 'geoMercator', label: 'Mercator' },
  { id: 'geoAlbersUsa', label: 'Albers USA' },
  { id: 'geoOrthographic', label: 'Orthographic' },
  { id: 'geoNaturalEarth1', label: 'Natural Earth' },
] as const

export type ProjectionId = typeof PROJECTIONS[number]['id']
