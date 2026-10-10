import { CircleMarker, MapContainer, TileLayer, useMapEvents } from 'react-leaflet'
import { useTranslation } from 'react-i18next'
import 'leaflet/dist/leaflet.css'

type ReportLocationPickerProps = {
  latitude: number
  longitude: number
  onPick: (latitude: number, longitude: number) => void
}

function MapClickHandler({ onPick }: Pick<ReportLocationPickerProps, 'onPick'>) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng)
    },
  })
  return null
}

export default function ReportLocationPicker({
  latitude,
  longitude,
  onPick,
}: ReportLocationPickerProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-2">
      <p className="text-sm text-stone-700">{t('reportForm.mapPrompt')}</p>
      <MapContainer
        center={[latitude, longitude]}
        zoom={12}
        scrollWheelZoom={false}
        className="h-52 w-full border border-stone-300"
      >
        <TileLayer
          attribution={t('map.mapAttribution')}
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onPick={onPick} />
        <CircleMarker
          center={[latitude, longitude]}
          radius={7}
          pathOptions={{ color: '#1557a0', fillColor: '#1557a0', fillOpacity: 0.8, weight: 2 }}
        />
      </MapContainer>
    </div>
  )
}
