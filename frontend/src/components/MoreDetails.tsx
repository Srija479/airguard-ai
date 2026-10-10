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
import type { AqiReading } from '../hooks/useAqi'
import type { AqiHistoryPoint } from '../hooks/useAqiHistory'

type PollutantKey = keyof AqiReading['pollutants']

const pollutantKeys: PollutantKey[] = [
  'pm2_5',
  'pm10',
  'nitrogen_dioxide',
  'ozone',
  'sulphur_dioxide',
  'carbon_monoxide',
]

function getTrendKey(points: AqiHistoryPoint[]): string | null {
  const ordered = [...points].sort((a, b) => a.observed_at.localeCompare(b.observed_at))
  const today = ordered.at(-1)?.observed_at.slice(0, 10)
  if (!today) return null

  const todayPoints = ordered.filter((point) => point.observed_at.startsWith(today))
  if (todayPoints.length < 2) return null

  const change = todayPoints[todayPoints.length - 1].aqi - todayPoints[0].aqi
  if (change <= -5) return 'details.betterSinceMorning'
  if (change >= 5) return 'details.worseSinceMorning'
  return 'details.sameSinceMorning'
}

type MoreDetailsProps = {
  reading: AqiReading
  points: AqiHistoryPoint[]
  historyLoading: boolean
  historyError: boolean
  onRetryHistory: () => void
}

export default function MoreDetails({
  reading,
  points,
  historyLoading,
  historyError,
  onRetryHistory,
}: MoreDetailsProps) {
  const { t } = useTranslation()
  const pollutants = pollutantKeys
    .map((key) => ({ key, value: reading.pollutants[key] }))
    .filter((item): item is { key: PollutantKey; value: number } =>
      typeof item.value === 'number' && Number.isFinite(item.value),
    )
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
  const maxValue = pollutants[0]?.value ?? 0
  const missingMeasurements = pollutantKeys.some((key) => reading.pollutants[key] == null)
  const mainCause = reading.main_pollutant as PollutantKey | null
  const trendKey = getTrendKey(points)

  return (
    <details className="border-y border-stone-300">
      <summary className="flex min-h-12 cursor-pointer items-center py-3 font-semibold text-stone-900 focus-visible:outline-2 focus-visible:outline-stone-900">
        {t('details.title')}
      </summary>
      <div className="space-y-6 pb-5">
        {mainCause && reading.pollutants[mainCause] != null && (
          <p className="text-sm text-stone-800">
            {t('details.mainCause', { pollutant: t(`pollutants.${mainCause}`) })}
          </p>
        )}

        {pollutants.length > 0 && (
          <div className="divide-y divide-stone-200">
            {pollutants.map(({ key, value }) => {
              const level = value < 100 ? 'low' : value <= 200 ? 'medium' : 'high'
              const width = maxValue > 0 ? Math.min(100, (value / maxValue) * 100) : 0

              return (
                <details key={key} className="group py-1">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 focus-visible:outline-2 focus-visible:outline-stone-900">
                    <span className="w-36 shrink-0 text-sm text-stone-800">{t(`pollutants.${key}`)}</span>
                    <span
                      role="img"
                      aria-label={t(`details.${level}`)}
                      className="h-2 flex-1 bg-stone-200"
                    >
                      <span className="block h-2 bg-stone-700" style={{ width: `${width}%` }} />
                    </span>
                    <span className="w-16 text-right text-xs text-stone-600">{t(`details.${level}`)}</span>
                  </summary>
                  <p className="pb-3 pl-3 text-sm text-stone-600">
                    {t('details.exactValue', {
                      name: t(`technicalPollutants.${key}`),
                      value,
                    })}
                  </p>
                </details>
              )
            })}
          </div>
        )}

        {missingMeasurements && (
          <p className="text-xs text-stone-600">{t('details.measurementNote')}</p>
        )}

        <section aria-label={t('details.chartLabel')}>
          {trendKey && <p className="mb-2 text-sm text-stone-700">{t(trendKey)}</p>}
          {historyLoading && <p role="status" className="text-sm text-stone-600">{t('common.loading')}</p>}
          {historyError && (
            <div className="flex flex-wrap items-center gap-3">
              <p role="alert" className="text-sm text-stone-700">{t('details.historyUnavailable')}</p>
              <button
                type="button"
                onClick={onRetryHistory}
                className="min-h-12 px-2 text-sm font-semibold text-stone-900 underline underline-offset-4"
              >
                {t('details.retryHistory')}
              </button>
            </div>
          )}
          {!historyLoading && !historyError && points.length > 1 && (
            <div role="img" aria-label={t('details.chartLabel')} className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="#d6d3d1" />
                  <XAxis
                    dataKey="observed_at"
                    tickFormatter={(value: string) => value.slice(11, 16)}
                    tick={{ fill: '#57534e', fontSize: 11 }}
                    axisLine={{ stroke: '#a8a29e' }}
                    tickLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    width={36}
                    tick={{ fill: '#57534e', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value) => [t('details.aqiValue', { value }), '']}
                    labelFormatter={(label) => String(label).slice(11, 16)}
                    contentStyle={{ border: '1px solid #d6d3d1', borderRadius: 2, boxShadow: 'none' }}
                  />
                  <Line
                    type="linear"
                    dataKey="aqi"
                    stroke="#44403c"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>
    </details>
  )
}
