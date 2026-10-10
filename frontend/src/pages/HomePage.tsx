import { useTranslation } from 'react-i18next'
import AqiScale from '../components/AqiScale'
import CitySearch from '../components/CitySearch'
import MoreDetails from '../components/MoreDetails'
import ProfileSelector from '../components/ProfileSelector'
import ErrorState from '../components/ui/ErrorState'
import Skeleton from '../components/ui/Skeleton'
import type { AqiCategory } from '../hooks/useAqi'
import useAqi from '../hooks/useAqi'
import useAqiHistory from '../hooks/useAqiHistory'
import useLocation from '../hooks/useLocation'
import useProfile from '../hooks/useProfile'
import { getAdviceKey } from '../lib/advice'
import getBestTime from '../lib/bestTime'

const categoryColors: Record<AqiCategory, string> = {
  good: 'text-aqi-good',
  satisfactory: 'text-aqi-satisfactory',
  moderate: 'text-aqi-moderate',
  poor: 'text-aqi-poor',
  veryPoor: 'text-aqi-very-poor',
  severe: 'text-aqi-severe',
}

export default function HomePage() {
  const { t } = useTranslation()
  const { location, setLocation } = useLocation()
  const { reading, loading, error, retry } = useAqi(location)
  const { profile, setProfile } = useProfile()
  const history = useAqiHistory(location)
  const cityName = location.translationKey ? t(location.translationKey) : location.name
  const updatedTime = reading?.observed_at.split('T')[1]?.slice(0, 5) ?? ''
  const bestTime = getBestTime(history.points)

  return (
    <div className="space-y-8">
      <CitySearch onSelect={setLocation} />

      {loading && <Skeleton />}
      {error && <ErrorState onRetry={retry} />}
      {reading && !loading && !error && (
        <div className="space-y-6">
          <section aria-live="polite" className="border-t border-stone-300 pt-8">
            <h1 className="mb-4 text-2xl font-semibold text-stone-900">{cityName}</h1>
            {reading.aqi !== null && reading.category ? (
              <>
                <p className="text-8xl font-bold leading-none text-stone-950">{reading.aqi}</p>
                <div className="mt-4">
                  <AqiScale value={reading.aqi} />
                </div>
                <p className={`mt-3 text-xl font-bold ${categoryColors[reading.category]}`}>
                  {t(`aqi.${reading.category}`)}
                </p>
              </>
            ) : (
              <p className="text-base text-stone-800">{t('aqi.unavailable')}</p>
            )}
          </section>

          <ProfileSelector value={profile} onChange={setProfile} />
          {reading.category && (
            <p className="max-w-2xl text-base leading-7 text-stone-800">
              {t(getAdviceKey(reading.category, profile))}
            </p>
          )}

          {bestTime && (
            <p className="text-sm text-stone-700">
              {t('bestTime.message', { time: bestTime })}{' '}
              {t('bestTime.basedOnToday')}
            </p>
          )}

          <MoreDetails
            reading={reading}
            points={history.points}
            historyLoading={history.loading}
            historyError={history.error}
            onRetryHistory={history.retry}
          />

          {reading.stale && (
            <p className="text-xs text-stone-600">{t('common.staleData', { time: updatedTime })}</p>
          )}
          <p className="text-xs text-stone-600">
            {t('common.modelledUpdated', { time: updatedTime })}
          </p>
        </div>
      )}
    </div>
  )
}
