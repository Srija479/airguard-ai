import axios from 'axios'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cities } from '../config/cities'
import type { SelectedLocation } from '../hooks/useLocation'

type PlaceResult = {
  name: string
  state: string | null
  latitude: number
  longitude: number
}

type CitySearchProps = {
  onSelect: (place: SelectedLocation) => void
}

export default function CitySearch({ onSelect }: CitySearchProps) {
  const { i18n, t } = useTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [searchAttempt, setSearchAttempt] = useState(0)
  const [locationMessage, setLocationMessage] = useState<'locationDenied' | 'locationUnavailable' | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const language = i18n.resolvedLanguage ?? i18n.language

  useEffect(() => {
    const searchTerm = query.trim()
    if (searchTerm.length < 2) {
      setResults([])
      setSearchError(false)
      setIsSearching(false)
      return
    }

    let cancelled = false
    const timeout = window.setTimeout(() => {
      setIsSearching(true)
      setSearchError(false)
      axios
        .get<PlaceResult[]>('/api/places/search', {
          params: { q: searchTerm, lang: language },
        })
        .then(({ data }) => {
          if (!cancelled) setResults(Array.isArray(data) ? data : [])
        })
        .catch(() => {
          if (!cancelled) setSearchError(true)
        })
        .finally(() => {
          if (!cancelled) setIsSearching(false)
        })
    }, 400)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [query, language, searchAttempt])

  function chooseQuickPick(city: (typeof cities)[number]) {
    onSelect({
      name: city.name,
      translationKey: city.translationKey,
      lat: city.lat,
      lon: city.lon,
    })
    setQuery('')
  }

  function useMyLocation() {
    setLocationMessage(null)
    if (!navigator.geolocation) {
      setLocationMessage('locationUnavailable')
      return
    }

    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        onSelect({
          name: 'Your location',
          translationKey: 'cities.currentLocation',
          lat: coords.latitude,
          lon: coords.longitude,
        })
        setIsLocating(false)
      },
      (error) => {
        setLocationMessage(error.code === error.PERMISSION_DENIED ? 'locationDenied' : 'locationUnavailable')
        setIsLocating(false)
      },
      { timeout: 10000, maximumAge: 60000 },
    )
  }

  function chooseResult(place: PlaceResult) {
    onSelect({ name: place.name, lat: place.latitude, lon: place.longitude })
    setQuery('')
    setResults([])
  }

  const showResults = query.trim().length >= 2

  return (
    <section className="space-y-4" aria-label={t('citySearch.label')}>
      <div>
        <label htmlFor="city-search" className="mb-2 block text-sm font-semibold text-stone-800">
          {t('citySearch.label')}
        </label>
        <input
          id="city-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('citySearch.placeholder')}
          autoComplete="off"
          className="min-h-12 w-full rounded-sm border border-stone-400 bg-white px-3 py-2 text-base text-stone-900 placeholder:text-stone-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 sm:max-w-xl"
        />

        {showResults && (
          <div className="mt-2 border-y border-stone-300">
            {isSearching ? (
              <p role="status" className="py-3 text-sm text-stone-600">{t('citySearch.searching')}</p>
            ) : searchError ? (
              <div role="alert" className="flex flex-wrap items-center gap-3 py-2">
                <p className="text-sm text-stone-800">{t('citySearch.searchFailed')}</p>
                <button
                  type="button"
                  onClick={() => setSearchAttempt((attempt) => attempt + 1)}
                  className="min-h-12 px-2 text-sm font-semibold text-brand-blue underline underline-offset-4"
                >
                  {t('common.retry')}
                </button>
              </div>
            ) : results.length ? (
              <ul className="divide-y divide-stone-200">
                {results.map((place, index) => (
                  <li key={`${place.latitude}-${place.longitude}-${index}`}>
                    <button
                      type="button"
                      onClick={() => chooseResult(place)}
                      className="min-h-12 w-full px-2 py-3 text-left text-stone-900 hover:underline focus-visible:outline-2 focus-visible:outline-stone-900"
                    >
                      {place.name}{place.state ? `, ${place.state}` : ''}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-3 text-sm text-stone-600">{t('citySearch.noResults')}</p>
            )}
          </div>
        )}
      </div>

      <div>
        <p className="mb-1 text-sm font-semibold text-stone-800">{t('citySearch.quickPicks')}</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {cities.map((city) => (
            <button
              key={city.name}
              type="button"
              onClick={() => chooseQuickPick(city)}
              className="min-h-12 py-2 text-left text-stone-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-stone-900"
            >
              {t(city.translationKey)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={isLocating}
          className="min-h-12 rounded-sm border border-stone-400 bg-white px-4 py-2 text-sm font-semibold text-stone-900 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 disabled:opacity-60"
        >
          {isLocating ? t('citySearch.locating') : t('citySearch.useMyLocation')}
        </button>
        {locationMessage && (
          <p role="status" className="mt-2 text-sm text-stone-700">
            {t(`citySearch.${locationMessage}`)}
          </p>
        )}
      </div>
    </section>
  )
}
