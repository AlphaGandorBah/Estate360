import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { pinIcon, FREETOWN_CENTER, OSM_TILE_URL, OSM_ATTRIBUTION } from './mapIcon'

interface Props {
  lat: number | null
  lng: number | null
  onChange: (lat: number, lng: number) => void
}

// The backend stores lat/lng as DecimalField(max_digits=9, decimal_places=6)
// — about 11cm of precision, plenty for a property pin. Leaflet's click/drag
// events report raw float coordinates with 15+ significant digits, which
// blows past max_digits and gets rejected by the API with a field error the
// form has nowhere to show, surfacing only as a generic "Body validation
// failed" banner. Round to the field's actual precision before it leaves the map.
const round6 = (n: number) => Math.round(n * 1e6) / 1e6

function ClickHandler({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onChange(round6(e.latlng.lat), round6(e.latlng.lng)),
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
                  onChange(round6(pos.lat), round6(pos.lng))
                },
              }}
            />
          )}
        </MapContainer>
      </div>
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        {hasPin
          ? 'Tap elsewhere or drag the pin to adjust. The exact pin is private — visitors only see an approximate area on the public listing.'
          : 'Tap the map to drop a pin at the property (optional — the area label alone is shown if you skip this).'}
      </p>
    </div>
  )
}
