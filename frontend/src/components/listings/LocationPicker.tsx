import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { pinIcon, FREETOWN_CENTER, OSM_TILE_URL, OSM_ATTRIBUTION } from './mapIcon'

interface Props {
  lat: number | null
  lng: number | null
  onChange: (lat: number, lng: number) => void
}

function ClickHandler({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onChange(e.latlng.lat, e.latlng.lng),
  })
  return null
}

export default function LocationPicker({ lat, lng, onChange }: Props) {
  const hasPin = lat != null && lng != null
  const center: [number, number] = hasPin ? [lat, lng] : FREETOWN_CENTER

  return (
    <div>
      <div className="h-64 w-full overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600">
        <MapContainer center={center} zoom={hasPin ? 15 : 12} className="h-full w-full" scrollWheelZoom={false}>
          <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
          <ClickHandler onChange={onChange} />
          {hasPin && (
            <Marker
              position={[lat, lng]}
              icon={pinIcon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const pos = e.target.getLatLng()
                  onChange(pos.lat, pos.lng)
                },
              }}
            />
          )}
        </MapContainer>
      </div>
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        {hasPin
          ? 'Tap elsewhere or drag the pin to adjust. The exact pin is private — tenants only see an approximate area on the public listing.'
          : 'Tap the map to drop a pin at the property (optional — the area label alone is shown if you skip this).'}
      </p>
    </div>
  )
}
