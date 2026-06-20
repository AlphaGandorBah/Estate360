import L from 'leaflet'

// A plain DivIcon avoids Leaflet's default marker image path problem under
// Vite (the default icon's image URLs resolve relative to the page, not the
// bundled asset, and 404 unless manually reconfigured) and matches the
// design system's Peninsula green instead of Leaflet's stock blue pin.
export const pinIcon = new L.DivIcon({
  className: '',
  html: `<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 0C7.16 0 0 7.16 0 16c0 11 16 26 16 26s16-15 16-26c0-8.84-7.16-16-16-16z" fill="#0E5C4A"/>
    <circle cx="16" cy="16" r="6.5" fill="#FBFAF7"/>
  </svg>`,
  iconSize: [32, 42],
  iconAnchor: [16, 42],
})

export const FREETOWN_CENTER: [number, number] = [8.4844, -13.2344]
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const OSM_ATTRIBUTION = '&copy; OpenStreetMap contributors'
