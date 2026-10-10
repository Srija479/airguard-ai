import axios from 'axios'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet'
import type { SelectedLocation } from '../hooks/useLocation'
import useLocation from '../hooks/useLocation'
import 'leaflet/dist/leaflet.css'

type PlaceResult = { name: string; state: string | null; latitude: number; longitude: number }
type ExposureLevel = 'Low' | 'Medium' | 'High' | 'Unavailable'
type RouteOption = {
  id: number
  geometry: [number, number][]
  duration_seconds: number
  distance_meters: number
  average_aqi: number | null
  exposure_score: number | null
  exposure_level: ExposureLevel
  lowest_exposure: boolean
}
type RoutesResponse = {
  routes: RouteOption[]
  lowest_exposure_route_id: number | null
  duration_note: string
}

const routeColors: Record<ExposureLevel, string> = {
  Low: '#166534',
  Medium: '#8a5b00',
  High: '#b93815',
  Unavailable: '#57534e',
}

function RoutePlaceSearch({
  id,
  label,
  value,
  onSelect,
}: {
  id: string
  label: string
  value: SelectedLocation | null
  onSelect: (place: SelectedLocation) => void
}) {
  const { i18n, t } = useTranslation()
  const [query, setQuery] = useState(value?.name ?? '')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(false)
  const [locationError, setLocationError] = useState('')

  useEffect(() => setQuery(value?.name ?? ''), [value?.name])
  useEffect(() => {
    const term = query.trim()
    if (term.length < 2 || term === value?.name) {
      setResults([])
      setError(false)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      setSearching(true)
      axios.get<PlaceResult[]>('/api/places/search', {
        params: { q: term, lang: i18n.resolvedLanguage ?? i18n.language },
      }).then(({ data }) => {
        if (!cancelled) setResults(Array.isArray(data) ? data : [])
      }).catch(() => {
        if (!cancelled) setError(true)
      }).finally(() => {
        if (!cancelled) setSearching(false)
      })
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [i18n.language, i18n.resolvedLanguage, query, value?.name])

  function useMyLocation() {
    setLocationError('')
    if (!navigator.geolocation) {
      setLocationError('citySearch.locationUnavailable')
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => onSelect({ name: t('cities.currentLocation'), translationKey: 'cities.currentLocation', lat: coords.latitude, lon: coords.longitude }),
      (positionError) => setLocationError(positionError.code === positionError.PERMISSION_DENIED ? 'citySearch.locationDenied' : 'citySearch.locationUnavailable'),
      { timeout: 10000, maximumAge: 60000 },
    )
  }

  function selectResult(place: PlaceResult) {
    onSelect({ name: place.name, lat: place.latitude, lon: place.longitude })
    setResults([])
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-stone-800">{label}</label>
      <input
        id={id}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('citySearch.placeholder')}
        autoComplete="off"
        className="min-h-12 w-full rounded-sm border border-stone-400 bg-white px-3 py-2 text-base text-stone-900"
      />
      {query.trim().length >= 2 && query.trim() !== value?.name && (
        <div className="border-y border-stone-300">
          {searching ? <p role="status" className="py-3 text-sm text-stone-600">{t('citySearch.searching')}</p>
            : error ? <p role="alert" className="py-3 text-sm text-stone-700">{t('citySearch.searchFailed')}</p>
              : results.length ? <ul className="divide-y divide-stone-200">
                {results.map((place, index) => (
                  <li key={`${place.latitude}-${place.longitude}-${index}`}>
                    <button type="button" onClick={() => selectResult(place)} className="min-h-12 w-full px-2 py-2 text-left text-sm text-stone-900">
                      {place.name}{place.state ? `, ${place.state}` : ''}
                    </button>
                  </li>
                ))}
              </ul> : !error && <p className="py-3 text-sm text-stone-600">{t('citySearch.noResults')}</p>}
        </div>
      )}
      <button type="button" onClick={useMyLocation} className="min-h-10 text-sm font-semibold text-brand-blue underline underline-offset-4">
        {t('citySearch.useMyLocation')}
      </button>
      {locationError && <p role="alert" className="text-sm text-stone-700">{t(locationError)}</p>}
    </div>
  )
}

function FitRoutes({ routes }: { routes: RouteOption[] }) {
  const map = useMap()
  useEffect(() => {
    const points = routes.flatMap((route) => route.geometry)
    if (points.length) map.fitBounds(points, { padding: [24, 24] })
  }, [map, routes])
  return null
}

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return hours ? `${hours}h ${remaining}m` : `${minutes} min`
}

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`
}

export default function RoutePlanner() {
  const { t } = useTranslation()
  const { location } = useLocation()
  const [from, setFrom] = useState<SelectedLocation | null>(location)
  const [to, setTo] = useState<SelectedLocation | null>(null)
  const [routes, setRoutes] = useState<RouteOption[]>([])
  const [bestRouteId, setBestRouteId] = useState<number | null>(null)
  const [selectedRoute, setSelectedRoute] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [durationNote, setDurationNote] = useState('')

  async function findRoutes() {
    if (!from || !to) return
    setLoading(true)
    setError(false)
    setRoutes([])
    try {
      const { data } = await axios.get<RoutesResponse>('/api/routes', {
        params: { from_lat: from.lat, from_lon: from.lon, to_lat: to.lat, to_lon: to.lon },
      })
      setRoutes(data.routes ?? [])
      setBestRouteId(data.lowest_exposure_route_id)
      setDurationNote(data.duration_note)
      setSelectedRoute(data.lowest_exposure_route_id)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  const availableScores = routes.map((route) => route.exposure_score).filter((score): score is number => score !== null)
  const differenceIsSmall = availableScores.length > 1 &&
    Math.max(...availableScores) - Math.min(...availableScores) <= Math.max(...availableScores) * 0.1

  return (
    <section role="tabpanel" className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <RoutePlaceSearch id="route-from" label={t('routes.from')} value={from} onSelect={setFrom} />
        <RoutePlaceSearch id="route-to" label={t('routes.to')} value={to} onSelect={setTo} />
      </div>
      <button
        type="button"
        disabled={!from || !to || loading}
        onClick={() => void findRoutes()}
        className="min-h-12 rounded-sm border border-stone-500 px-5 py-2 text-sm font-semibold text-stone-900 hover:bg-stone-100 disabled:opacity-60"
      >
        {loading ? t('routes.searchingRoutes') : t('routes.findRoutes')}
      </button>
      {loading && <p role="status" className="text-sm text-stone-600">{t('common.loading')}</p>}
      {error && <p role="alert" className="text-sm text-stone-700">{t('routes.serviceError')}</p>}
      {routes.length > 0 && (
        <>
          <MapContainer
            key={`${from?.lat}-${from?.lon}-${to?.lat}-${to?.lon}-${routes.length}`}
            center={routes[0].geometry[0]}
            zoom={11}
            scrollWheelZoom={false}
            className="h-[52svh] min-h-72 w-full border border-stone-300"
          >
            <TileLayer attribution={t('map.mapAttribution')} url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <FitRoutes routes={routes} />
            {routes.map((route) => (
              <Polyline
                key={route.id}
                positions={route.geometry}
                pathOptions={{
                  color: routeColors[route.exposure_level],
                  weight: selectedRoute === route.id ? 7 : 4,
                  opacity: selectedRoute === route.id ? 0.95 : 0.65,
                }}
                eventHandlers={{ click: () => setSelectedRoute(route.id) }}
              />
            ))}
          </MapContainer>
          <p className="text-sm text-stone-700">{t('routes.durationNote')}</p>
          {differenceIsSmall && <p className="text-sm font-medium text-stone-800">{t('routes.smallDifference')}</p>}
          <p className="text-sm text-stone-600">{t('routes.coarseDataNote')}</p>
          <ul className="divide-y divide-stone-200 border-y border-stone-300">
            {routes.map((route) => (
              <li key={route.id}>
                <button type="button" onClick={() => setSelectedRoute(route.id)} className="w-full space-y-1 py-4 text-left">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold text-stone-950">{t('routes.routeNumber', { number: route.id + 1 })}</span>
                    {route.id === bestRouteId && <span className="border border-stone-400 px-2 py-1 text-xs font-semibold text-stone-900">{t('routes.lowerExposure')}</span>}
                  </span>
                  <span className="block text-sm text-stone-700">
                    {formatDuration(route.duration_seconds)} · {formatDistance(route.distance_meters)} · {t(`routes.level.${route.exposure_level.toLowerCase()}`)}
                  </span>
                  {route.id === bestRouteId && route.average_aqi !== null && (
                    <span className="block text-sm text-stone-600">{t('routes.bestReason', { value: route.average_aqi })}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {!loading && !error && routes.length === 0 && <p className="text-sm text-stone-600">{durationNote || t('routes.empty')}</p>}
    </section>
  )
}