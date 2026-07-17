import { MapContainer, TileLayer, Marker, Circle } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { pinIcon, OSM_TILE_URL, OSM_ATTRIBUTION } from './mapIcon'
import { AREA_LABELS } from '@/lib/utils'
import type { LocationArea } from '@/types'

interface Props {
  lat: number | null
  lng: number | null
  area: LocationArea
}

const PRIVACY_RADIUS_M = 100

export default function LocationMap({ lat, lng, area }: Props) {
  if (lat == null || lng == null) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg bg-gray-100 text-sm text-gray-500 dark:bg-gray-800 dark:text-gray-400">
        Exact location not shared — {AREA_LABELS[area]}
      </div>
    )
  }

  return (
    <div>
      <div className="h-48 w-full overflow-hidden rounded-lg">
        <MapContainer center={[lat, lng]} zoom={14} className="h-full w-full" scrollWheelZoom={false} dragging={true}>
          <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
          <Circle center={[lat, lng]} radius={PRIVACY_RADIUS_M} pathOptions={{ color: '#0E5C4A', fillOpacity: 0.15 }} />
          <Marker position={[lat, lng]} icon={pinIcon} />
        </MapContainer>
      </div>
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        Approximate location — the exact address is shared after you contact the listing provider.
      </p>
    </div>
  )
}
