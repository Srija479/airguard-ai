import axios from 'axios'
import { useEffect, useState } from 'react'
import type { SelectedLocation } from './useLocation'

export type AqiCategory = 'good' | 'satisfactory' | 'moderate' | 'poor' | 'veryPoor' | 'severe'

export type AqiReading = {
  aqi: number | null
  category: AqiCategory | null
  main_pollutant: string | null
  pollutants: Record<string, number | null>
  observed_at: string
  is_modelled: boolean
  stale: boolean
}

export default function useAqi(location: SelectedLocation) {
  const [reading, setReading] = useState<AqiReading | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    axios
      .get<AqiReading>('/api/aqi/current', {
        params: { lat: location.lat, lon: location.lon },
      })
      .then(({ data }) => {
        if (!cancelled) setReading(data)
      })
      .catch(() => {
        if (!cancelled) {
          setReading(null)
          setError(true)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [location.lat, location.lon, retryCount])

  return {
    reading,
    loading,
    error,
    retry: () => setRetryCount((count) => count + 1),
  }
}
