import axios from 'axios'
import { useEffect, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTranslation } from 'react-i18next'
import useLocation from '../hooks/useLocation'
import useProfile from '../hooks/useProfile'
import type { AqiCategory } from '../hooks/useAqi'
import { getAdviceKey } from '../lib/advice'

type ForecastPoint = { time: string; aqi: number; category: AqiCategory }
type ForecastEvaluation = {
  status: 'ready' | 'not_ready'
  model: { mae: number; rmse: number }
  persistence: { mae: number; rmse: number }
  same_hour_yesterday: { mae: number; rmse: number }
  test_start: string
  test_end: string
  test_rows: number
  selected_model: string
  beats_baseline: boolean
  mae_by_horizon: Record<string, number | null>
}
type ForecastResponse = {
  status: 'ready' | 'training' | 'not_ready'
  ai?: ForecastPoint[]
  atmospheric?: ForecastPoint[]
  observed?: ForecastPoint[]
  best_window?: { start: string; end: string } | null
  worst_window?: { start: string; end: string } | null
}
type ChartPoint = {
  time: number
  observed: number | null
  ai: number | null
}

const categoryColors: Record<AqiCategory, string> = {
  good: '#166534',
  satisfactory: '#4d6800',
  moderate: '#8a5b00',
  poor: '#b93815',
  veryPoor: '#a32245',
  severe: '#7f1d1d',
}

const categoryOrder: AqiCategory[] = ['good', 'satisfactory', 'moderate', 'poor', 'veryPoor', 'severe']
const periods = [
  { key: 'morning', startHour: 6, endHour: 12 },
  { key: 'afternoon', startHour: 12, endHour: 18 },
  { key: 'evening', startHour: 18, endHour: 24 },
  { key: 'night', startHour: 0, endHour: 6 },
] as const

function dateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function categoryForAverage(aqi: number): AqiCategory {
  if (aqi <= 50) return 'good'
  if (aqi <= 100) return 'satisfactory'
  if (aqi <= 200) return 'moderate'
  if (aqi <= 300) return 'poor'
  if (aqi <= 400) return 'veryPoor'
  return 'severe'
}

function buildChartData(data: ForecastResponse): ChartPoint[] {
  const points = new Map<string, ChartPoint>()
  for (const [key, values] of [
    ['observed', data.observed ?? []],
    ['ai', data.ai ?? []],
  ] as const) {
    for (const point of values) {
      const entry = points.get(point.time) ?? {
        time: new Date(point.time).getTime(),
        observed: null,
        ai: null,
      }
      if (key === 'observed') entry.observed = point.aqi
      else entry.ai = point.aqi
      points.set(point.time, entry)
    }
  }
  return [...points.values()].sort((left, right) => left.time - right.time)
}

export default function ForecastPage() {
  const { t, i18n } = useTranslation()
  const { location } = useLocation()
  const { profile } = useProfile()
  const [forecast, setForecast] = useState<ForecastResponse | null>(null)
  const [evaluation, setEvaluation] = useState<ForecastEvaluation | null>(null)
  const [loading, setLoading] = useState(true)
  const [training, setTraining] = useState(false)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let cancelled = false
    let interval = 0
    setLoading(true)
    setTraining(false)
    setError(false)
    setForecast(null)
    setEvaluation(null)

    const params = { lat: location.lat, lon: location.lon }
    const fetchForecast = async () => {
      try {
        const { data } = await axios.get<ForecastResponse>('/api/forecast', { params })
        if (cancelled) return
        if (data.status === 'ready') {
          setForecast(data)
          setTraining(false)
          setLoading(false)
          try {
            const evaluationResult = await axios.get<ForecastEvaluation>('/api/forecast/evaluation', { params })
            if (!cancelled && evaluationResult.data.status === 'ready') setEvaluation(evaluationResult.data)
          } catch {
            if (!cancelled) setEvaluation(null)
          }
          if (interval) window.clearInterval(interval)
          return
        }
        if (data.status === 'training') {
          setTraining(true)
          setLoading(false)
          return
        }
        setForecast(null)
        setTraining(false)
        setError(true)
        setLoading(false)
        if (interval) window.clearInterval(interval)
      } catch {
        if (cancelled) return
        setError(true)
        setLoading(false)
        if (interval) window.clearInterval(interval)
      }
    }

    const pollStatus = async () => {
      try {
        const { data } = await axios.get<{ status: string }>('/api/forecast/status', { params })
        if (cancelled) return
        if (data.status === 'ready') await fetchForecast()
        else if (data.status === 'not_ready') await fetchForecast()
      } catch {
        if (!cancelled) {
          setError(true)
          setLoading(false)
          window.clearInterval(interval)
        }
      }
    }

    void fetchForecast()
    interval = window.setInterval(() => void pollStatus(), 5000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [location.lat, location.lon, retry])

  const aiPoints = forecast?.ai ?? []
  const chartData = forecast ? buildChartData(forecast) : []
  const adviceCategory = aiPoints[0]?.category
  const worstNextDay = aiPoints
    .filter((point) => new Date(point.time).getTime() <= Date.now() + 24 * 60 * 60 * 1000)
    .reduce<ForecastPoint | null>((worst, point) => {
      if (!worst || categoryOrder.indexOf(point.category) > categoryOrder.indexOf(worst.category)) return point
      return worst
    }, null)
  const locale = i18n.language === 'hi' ? 'hi-IN' : i18n.language === 'te' ? 'te-IN' : 'en-IN'
  const formatTime = (value: string | number) => new Date(value).toLocaleTimeString(locale, { hour: 'numeric' })
  const formatWeekday = (date: Date) => date.toLocaleDateString(locale, { weekday: 'short' })
  const formatDay = (value: string) => {
    const date = new Date(value)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)
    if (dateKey(date) === dateKey(today)) return t('forecastPage.today')
    if (dateKey(date) === dateKey(tomorrow)) return t('forecastPage.tomorrow')
    return date.toLocaleDateString(locale, { weekday: 'long' })
  }
  const formatWindow = (window: ForecastResponse['best_window']) => window
    ? `${formatDay(window.start)} ${formatTime(window.start)}-${formatTime(window.end)}`
    : t('forecastPage.notAvailable')
  const firstDay = new Date()
  firstDay.setHours(0, 0, 0, 0)
  const dayBuckets = [0, 1].map((offset) => {
    const date = new Date(firstDay)
    date.setDate(firstDay.getDate() + offset)
    const dayPoints = aiPoints.filter((point) => dateKey(new Date(point.time)) === dateKey(date))
    const slices = periods.map((period) => {
      const points = dayPoints.filter((point) => {
        const hour = new Date(point.time).getHours()
        return hour >= period.startHour && hour < period.endHour
      })
      if (points.length === 0) return { ...period, average: null, category: null }
      const average = points.reduce((sum, point) => sum + point.aqi, 0) / points.length
      const category = categoryForAverage(average)
      return { ...period, average, category }
    })
    return { date, slices }
  })
  const chartStart = chartData.length ? Math.ceil(chartData[0].time / (12 * 60 * 60 * 1000)) * 12 * 60 * 60 * 1000 : 0
  const chartEnd = chartData.at(-1)?.time ?? 0
  const chartTicks: number[] = []
  for (let tick = chartStart; tick <= chartEnd; tick += 12 * 60 * 60 * 1000) chartTicks.push(tick)

  if (loading || training) {
    return (
      <div className="max-w-4xl space-y-5" aria-busy="true">
        <h1 className="text-2xl font-semibold text-stone-950">{t('pages.forecast.title')}</h1>
        <p role="status" className="text-sm text-stone-700">{t('forecast.preparing', { city: location.name })}</p>
        <div className="space-y-3" aria-hidden="true">
          <div className="h-6 w-2/3 bg-stone-200" />
          <div className="h-32 w-full bg-stone-100" />
        </div>
      </div>
    )
  }

  if (error || !forecast) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold text-stone-950">{t('pages.forecast.title')}</h1>
        <p role="alert" className="text-sm text-stone-700">{t('forecast.unavailable')}</p>
        <button type="button" onClick={() => setRetry((value) => value + 1)} className="min-h-12 px-2 text-sm font-semibold text-stone-900 underline underline-offset-4">
          {t('common.retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold text-stone-950">{t('pages.forecast.title')}</h1>
      <p className="text-xs font-medium text-stone-600">{t('forecastPage.notMeasurement')}</p>
      <section aria-label={t('forecastPage.answerLabel')} className="space-y-2 border-b border-stone-300 pb-5">
        <p className="text-2xl font-semibold text-stone-950">{t('forecastPage.bestAnswer', { window: formatWindow(forecast.best_window) })}</p>
        <p className="text-2xl font-semibold text-stone-950">{t('forecastPage.avoidAnswer', {
          window: formatWindow(forecast.worst_window),
          category: worstNextDay ? t(`aqi.${worstNextDay.category}`) : t('forecastPage.notAvailable'),
        })}</p>
      </section>
      {adviceCategory && <p className="text-sm text-stone-700">{t(getAdviceKey(adviceCategory, profile))}</p>}

      <section aria-label={t('forecastPage.daysLabel')} className="space-y-4">
        {dayBuckets.map((day) => (
          <div key={dateKey(day.date)} className="border-b border-stone-200 pb-4">
            <h2 className="mb-3 text-base font-semibold text-stone-900">
              {dateKey(day.date) === dateKey(new Date()) ? t('forecastPage.today') : dateKey(day.date) === dateKey(new Date(Date.now() + 24 * 60 * 60 * 1000)) ? t('forecastPage.tomorrow') : day.date.toLocaleDateString(locale, { weekday: 'long' })}
            </h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
              {day.slices.map((slice) => (
                <div key={slice.key} className="space-y-1.5">
                  <h3 className="text-sm font-medium text-stone-800">{t(`forecastPage.periods.${slice.key}`)}</h3>
                  <div className="h-2 w-full" style={{ backgroundColor: slice.category ? categoryColors[slice.category] : '#e7e5e4' }} />
                  <p className="text-sm text-stone-800">
                    {slice.category ? t(`aqi.${slice.category}`) : t('forecastPage.notAvailable')}
                    <span className="ml-2 text-xs text-stone-600">{t('forecastPage.averageAqi', { value: slice.average === null ? '—' : Math.round(slice.average) })}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section aria-label={t('forecastPage.chartLabel')} className="space-y-3">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone-700">
          <span className="inline-flex items-center gap-2"><i className="h-0.5 w-6 bg-stone-800" />{t('forecastPage.observedLegend')}</span>
          <span className="inline-flex items-center gap-2"><i className="h-0 w-6 border-t-2 border-dashed border-brand-blue" />{t('forecastPage.aiLegend')}</span>
        </div>
        <div role="img" aria-label={t('forecastPage.chartLabel')} className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="#d6d3d1" />
              <XAxis type="number" dataKey="time" domain={['dataMin', 'dataMax']} ticks={chartTicks} tickFormatter={(value: number) => `${formatWeekday(new Date(value))} ${formatTime(value)}`} tick={{ fill: '#57534e', fontSize: 11 }} axisLine={{ stroke: '#a8a29e' }} tickLine={false} />
              <YAxis width={36} tick={{ fill: '#57534e', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip labelFormatter={(value) => `${formatWeekday(new Date(Number(value)))} ${formatTime(Number(value))}`} contentStyle={{ border: '1px solid #d6d3d1', borderRadius: 2, boxShadow: 'none' }} />
              <Line type="linear" dataKey="observed" name={t('forecastPage.observedLegend')} stroke="#292524" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
              <Line type="linear" dataKey="ai" name={t('forecastPage.aiLegend')} stroke="#1d4ed8" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-stone-600">{t('forecastPage.chartCaption')}</p>
      </section>

      <details className="border-y border-stone-300">
        <summary className="flex min-h-12 cursor-pointer items-center py-3 font-semibold text-stone-900">{t('forecastPage.reliabilityTitle')}</summary>
        <div className="space-y-2 pb-4 text-sm text-stone-700">
          {evaluation ? (
            <>
              <p>{t('forecastPage.typicalError', { value: evaluation.model.mae.toFixed(1) })}</p>
              <p>{t('forecastPage.comparisons', {
                model: evaluation.model.mae.toFixed(1),
                baseline: evaluation.persistence.mae.toFixed(1),
                atmospheric: t('forecastPage.atmosphericUnavailable'),
              })}</p>
              <p>{t('forecastPage.testPeriod', { start: evaluation.test_start.slice(0, 10), end: evaluation.test_end.slice(0, 10) })}</p>
              {!evaluation.beats_baseline && <p>{t('forecastPage.doesNotBeat')}</p>}
            </>
          ) : <p>{t('forecastPage.evaluationUnavailable')}</p>}
        </div>
      </details>
    </div>
  )
}
