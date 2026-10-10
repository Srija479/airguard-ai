import axios from 'axios'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'
import useLocation from './useLocation'

export type AlertType = 'high_aqi' | 'forecast' | 'report_update'
export type AirAlert = {
  id: string
  type: AlertType
  title: string
  message: string
  place: string
  value: number | string
  category?: string
  time: string
  read: boolean
  source: 'modelled' | 'forecast' | 'report'
  action: string
}

type AlertsContextValue = {
  alerts: AirAlert[]
  unreadCount: number
  markRead: (id: string) => void
  markAllRead: () => void
  clear: () => void
}

type ReportUpdate = { code: string; place_name: string; review_status: string }
type StoredReviewStatuses = Record<string, string>

const ALERTS_KEY = 'alerts'
const REVIEW_STATUSES_KEY = 'airguard-report-review-statuses'
const AlertsContext = createContext<AlertsContextValue | null>(null)

function readAlerts(): AirAlert[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(ALERTS_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter(
      (alert): alert is AirAlert =>
        typeof alert?.id === 'string' &&
        typeof alert?.type === 'string' &&
        typeof alert?.title === 'string' &&
        typeof alert?.message === 'string' &&
        typeof alert?.place === 'string' &&
        typeof alert?.time === 'string' &&
        typeof alert?.read === 'boolean',
    ).slice(0, 30)
  } catch {
    return []
  }
}

function readReviewStatuses(): StoredReviewStatuses {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(REVIEW_STATUSES_KEY) ?? '{}')
    return typeof value === 'object' && value !== null ? value as StoredReviewStatuses : {}
  } catch {
    return {}
  }
}

export function AlertsProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { location } = useLocation()
  const [alerts, setAlerts] = useState<AirAlert[]>(readAlerts)

  const updateAlerts = useCallback((update: (current: AirAlert[]) => AirAlert[]) => {
    setAlerts((current) => {
      const next = update(current).slice(0, 30)
      try {
        localStorage.setItem(ALERTS_KEY, JSON.stringify(next))
      } catch {
        return next
      }
      return next
    })
  }, [])

  const markRead = useCallback((id: string) => {
    updateAlerts((current) => current.map((alert) => alert.id === id ? { ...alert, read: true } : alert))
  }, [updateAlerts])

  const markAllRead = useCallback(() => {
    updateAlerts((current) => current.map((alert) => ({ ...alert, read: true })))
  }, [updateAlerts])

  const clear = useCallback(() => updateAlerts(() => []), [updateAlerts])

  useEffect(() => {
    let cancelled = false
    let checking = false

    const check = async () => {
      if (checking) return
      checking = true
      const params = { lat: location.lat, lon: location.lon }
      const additions: AirAlert[] = []
      try {
        const [aqiResult, forecastResult] = await Promise.allSettled([
          axios.get('/api/aqi/current', { params }),
          axios.get('/api/forecast', { params }),
        ])
        if (cancelled) return

        const today = new Date().toISOString().slice(0, 10)
        if (aqiResult.status === 'fulfilled' && aqiResult.value.data.aqi >= 201) {
          const category = aqiResult.value.data.category
          additions.push({
            id: `high_aqi|${location.name}|${today}|${category}`,
            type: 'high_aqi',
            title: 'alerts.highAqiTitle',
            message: 'alerts.highAqiMessage',
            place: location.name,
            value: aqiResult.value.data.aqi,
            category,
            time: new Date().toISOString(),
            read: false,
            source: 'modelled',
            action: 'alerts.highAqiAction',
          })
        }

        const forecastPoints = forecastResult.status === 'fulfilled' && forecastResult.value.data.status === 'ready'
          ? forecastResult.value.data.ai as Array<{ time: string; aqi: number; category: string }>
          : []
        const forecastCutoff = Date.now() + 24 * 60 * 60 * 1000
        const highForecast = forecastPoints.find(
          (point) => point.aqi >= 201 && new Date(point.time).getTime() <= forecastCutoff,
        )
        if (highForecast) {
          const category = highForecast.category
          additions.push({
            id: `forecast|${location.name}|${today}|${category}`,
            type: 'forecast',
            title: 'alerts.forecastTitle',
            message: 'alerts.forecastMessage',
            place: location.name,
            value: highForecast.aqi,
            category,
            time: new Date().toISOString(),
            read: false,
            source: 'forecast',
            action: 'alerts.forecastAction',
          })
        }

        try {
          const saved: unknown = JSON.parse(localStorage.getItem('myReports') ?? '[]')
          const codes = Array.isArray(saved)
            ? saved.map((item) => item?.code).filter((code): code is string => typeof code === 'string').slice(0, 20)
            : []
          if (codes.length) {
            const { data } = await axios.get<ReportUpdate[]>('/api/reports/by-codes', { params: { codes: codes.join(',') } })
            if (!cancelled) {
              const seen = readReviewStatuses()
              const updated = { ...seen }
              for (const report of data) {
                const previous = seen[report.code]
                if (previous && previous !== report.review_status) {
                  additions.push({
                    id: `report_update|${report.place_name}|${today}|${report.review_status}`,
                    type: 'report_update',
                    title: 'alerts.reportUpdateTitle',
                    message: 'alerts.reportUpdateMessage',
                    place: report.place_name,
                    value: report.review_status,
                    time: new Date().toISOString(),
                    read: false,
                    source: 'report',
                    action: 'alerts.reportUpdateAction',
                  })
                }
                updated[report.code] = report.review_status
              }
              localStorage.setItem(REVIEW_STATUSES_KEY, JSON.stringify(updated))
            }
          }
        } catch {
          // Report updates are retried on the next scheduled check.
        }

        if (!cancelled && additions.length) {
          updateAlerts((current) => {
            const existing = new Set(current.map((alert) => alert.id))
            const fresh = additions.filter((alert) => !existing.has(alert.id))
            return [...fresh.reverse(), ...current]
          })
        }
      } finally {
        checking = false
      }
    }

    void check()
    const interval = window.setInterval(() => void check(), 10 * 60 * 1000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [location.lat, location.lon, location.name, t, updateAlerts])

  const value = useMemo(
    () => ({ alerts, unreadCount: alerts.filter((alert) => !alert.read).length, markRead, markAllRead, clear }),
    [alerts, clear, markAllRead, markRead],
  )

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>
}

export function useAlerts() {
  const context = useContext(AlertsContext)
  if (!context) throw new Error('useAlerts must be used within AlertsProvider')
  return context
}