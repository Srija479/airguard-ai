import axios from 'axios'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'
import type { CircleMarker as LeafletCircleMarker } from 'leaflet'
import type { AqiCategory, AqiReading } from '../hooks/useAqi'
import useAqi from '../hooks/useAqi'
import useLocation from '../hooks/useLocation'
import { activeActivityStatuses, reportCategories } from '../config/reports'
import type { ActivityStatus, ReportCategory } from '../config/reports'
import RoutePlanner from '../components/RoutePlanner'
import 'leaflet/dist/leaflet.css'

type ReportMapEntry = {
  code: string
  category: ReportCategory
  title: string
  place_name: string
  latitude: number
  longitude: number
  activity_status: ActivityStatus
  review_status: string
  created_at: string
  photo_url: string | null
}

type MapFilter = 'all' | 'active' | ReportCategory
type MapTab = 'air' | 'routes'

function ReportMarker({
  report,
  focusCode,
  photoFailed,
  onPhotoError,
}: {
  report: ReportMapEntry
  focusCode: string | null
  photoFailed: boolean
  onPhotoError: () => void
}) {
  const { t, i18n } = useTranslation()
  const markerRef = useRef<LeafletCircleMarker | null>(null)
  const map = useMap()
  const active = activeActivityStatuses.has(report.activity_status)

  useEffect(() => {
    if (focusCode !== report.code) return
    map.setView([report.latitude, report.longitude], Math.max(map.getZoom(), 13))
    markerRef.current?.openPopup()
  }, [focusCode, map, report])

  return (
    <CircleMarker
      ref={markerRef}
      center={[report.latitude, report.longitude]}
      radius={active ? 13 : 11}
      pathOptions={{
        color: active ? '#b91c1c' : '#166534',
        fillColor: '#166534',
        fillOpacity: 0.95,
        weight: active ? 3 : 2,
      }}
    >
      <Popup>
        <div className="max-w-64 space-y-1 text-sm">
          {report.photo_url && !photoFailed ? (
            <img
              src={report.photo_url}
              alt={report.title}
              onError={onPhotoError}
              className="max-h-40 max-w-full object-contain"
            />
          ) : report.photo_url ? (
            <p>{t('map.photoUnavailable')}</p>
          ) : null}
          <p className="font-semibold">{report.title}</p>
          <p>{t(`reportCategories.${report.category}`)}</p>
          <p>{t('map.date', { date: new Date(report.created_at).toLocaleDateString(i18n.resolvedLanguage ?? i18n.language) })}</p>
          <p>{t(`activityStatuses.${report.activity_status}`)}</p>
          <p>{t(`reportForm.review.${report.review_status}`)}</p>
          {report.review_status === 'submitted' && <p>{t('reportForm.unverified')}</p>}
        </div>
      </Popup>
    </CircleMarker>
  )
}

const categoryTokens: Record<AqiCategory, string> = {
  good: '--color-aqi-good',
  satisfactory: '--color-aqi-satisfactory',
  moderate: '--color-aqi-moderate',
  poor: '--color-aqi-poor',
  veryPoor: '--color-aqi-very-poor',
  severe: '--color-aqi-severe',
}

function getCategoryColor(category: AqiCategory) {
  return getComputedStyle(document.documentElement).getPropertyValue(categoryTokens[category]).trim()
}

function formatTime(reading: AqiReading) {
  return reading.observed_at.split('T')[1]?.slice(0, 5) ?? ''
}

export default function MapPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const incomingFocus = searchParams.get('focus')
  const { location } = useLocation()
  const { reading, loading: aqiLoading, error: aqiError, retry: retryAqi } = useAqi(location)
  const [reports, setReports] = useState<ReportMapEntry[]>([])
  const [reportsLoading, setReportsLoading] = useState(true)
  const [reportsError, setReportsError] = useState(false)
  const [filter, setFilter] = useState<MapFilter>('all')
  const [mapTab, setMapTab] = useState<MapTab>('air')
  const [focusedCode, setFocusedCode] = useState<string | null>(null)
  const [failedPhotos, setFailedPhotos] = useState<Set<string>>(() => new Set())
  const [reload, setReload] = useState(0)

  useEffect(() => {
    setFocusedCode(incomingFocus)
  }, [incomingFocus])

  useEffect(() => {
    let cancelled = false
    const fetchReports = async () => {
      try {
        const { data } = await axios.get<ReportMapEntry[]>('/api/reports/map', {
          headers: { 'Cache-Control': 'no-cache' },
        })
        if (!cancelled) {
          setReports(Array.isArray(data) ? data : [])
          setReportsError(false)
        }
      } catch {
        if (!cancelled) {
          setReports([])
          setReportsError(true)
        }
      } finally {
        if (!cancelled) setReportsLoading(false)
      }
    }
    void fetchReports()
    const interval = window.setInterval(() => void fetchReports(), 30_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [incomingFocus, reload])

  const visibleReports = reports.filter((report) => {
    if (filter === 'active') return activeActivityStatuses.has(report.activity_status)
    if (filter === 'all') return true
    return report.category === filter
  })
  const filters: MapFilter[] = ['all', 'active', ...reportCategories]
  const recentReports = visibleReports.slice(0, 10)

  function timeAgo(value: string) {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000))
    if (minutes < 60) return t('map.minutesAgo', { count: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('map.hoursAgo', { count: hours })
    return t('map.daysAgo', { count: Math.floor(hours / 24) })
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-stone-950">{t('pages.map.title')}</h1>
      <div role="tablist" aria-label={t('pages.map.title')} className="flex border-b border-stone-300">
        {(['air', 'routes'] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={mapTab === item}
            onClick={() => setMapTab(item)}
            className={`min-h-12 border-b-2 px-4 py-2 text-sm font-medium ${mapTab === item ? 'border-brand-blue text-brand-blue' : 'border-transparent text-stone-700'}`}
          >
            {t(item === 'air' ? 'map.airMapTab' : 'map.routesTab')}
          </button>
        ))}
      </div>
      {mapTab === 'routes' ? (
        <RoutePlanner />
      ) : (
      <div role="tabpanel" className="space-y-4">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {filters.map((item) => {
          const label = item === 'all'
            ? t('map.all')
            : item === 'active'
              ? t('map.activeOnly')
              : t(`reportCategories.${item}`)
          return (
            <button
              key={item}
              type="button"
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
              className={`min-h-12 shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${
                filter === item
                  ? 'border-brand-blue text-brand-blue'
                  : 'border-transparent text-stone-700'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {(reportsLoading || aqiLoading) && <p role="status" className="text-sm text-stone-600">{t('common.loading')}</p>}
      {reportsError && (
        <div role="alert" className="flex items-center gap-3 text-sm text-stone-800">
          <span>{t('common.error')}</span>
          <button type="button" onClick={() => setReload((value) => value + 1)} className="min-h-12 px-2 font-semibold underline underline-offset-4">
            {t('common.retry')}
          </button>
        </div>
      )}
      {aqiError && (
        <div role="alert" className="flex items-center gap-3 text-sm text-stone-800">
          <span>{t('common.error')}</span>
          <button type="button" onClick={retryAqi} className="min-h-12 px-2 font-semibold underline underline-offset-4">
            {t('common.retry')}
          </button>
        </div>
      )}

      <MapContainer
        key={`${location.lat}-${location.lon}`}
        center={[location.lat, location.lon]}
        zoom={11}
        scrollWheelZoom={false}
        className="h-[62svh] min-h-80 w-full border border-stone-300"
      >
        <TileLayer
          attribution={t('map.mapAttribution')}
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {reading?.aqi !== null && reading?.aqi !== undefined && reading.category && (
          <CircleMarker
            center={[location.lat, location.lon]}
            radius={15}
            pathOptions={{
              color: getCategoryColor(reading.category),
              fillColor: getCategoryColor(reading.category),
              fillOpacity: 0.9,
              weight: 2,
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -14]}>
              {reading.aqi} {t(`aqi.${reading.category}`)}
            </Tooltip>
            <Popup>
              <div className="space-y-1">
                <p className="font-semibold">{t('map.aqiPopup', { value: reading.aqi })}</p>
                <p>{t(`aqi.${reading.category}`)}</p>
                <p>{t('common.modelledUpdated', { time: formatTime(reading) })}</p>
              </div>
            </Popup>
          </CircleMarker>
        )}
        {visibleReports.map((report) => (
          <ReportMarker
            key={report.code}
            report={report}
            focusCode={focusedCode}
            photoFailed={failedPhotos.has(report.code)}
            onPhotoError={() => setFailedPhotos((previous) => new Set(previous).add(report.code))}
          />
        ))}
      </MapContainer>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-stone-950">{t('map.recentReports')}</h2>
        {recentReports.length === 0 ? (
          <p className="text-sm text-stone-700">
            {t('map.empty')}{' '}
            <Link to="/report" className="font-semibold text-brand-blue underline underline-offset-4">{t('map.reportLink')}</Link>
          </p>
        ) : (
          <ul className="divide-y divide-stone-200 border-y border-stone-300">
            {recentReports.map((report) => (
              <li key={report.code}>
                <button
                  type="button"
                  onClick={() => setFocusedCode(report.code)}
                  className="flex min-h-20 w-full items-center gap-3 py-3 text-left"
                >
                  {report.photo_url ? (
                    <img src={report.photo_url} alt="" className="h-14 w-14 shrink-0 border border-stone-300 object-cover" />
                  ) : (
                    <span aria-hidden="true" className="h-14 w-14 shrink-0 border border-stone-300 bg-stone-100" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-stone-950">{report.title}</span>
                    <span className="block text-sm text-stone-700">{t(`reportCategories.${report.category}`)} · {report.place_name}</span>
                    <span className="block text-xs text-stone-600">{timeAgo(report.created_at)} · {t(`reportForm.review.${report.review_status}`)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
      )}
    </div>
  )
}
