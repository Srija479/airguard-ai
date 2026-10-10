import axios from 'axios'
import { useEffect, useState } from 'react'
import type { SelectedLocation } from './useLocation'

export type AqiHistoryPoint = {
  aqi: number
  observed_at: string
}

type AqiHistoryResponse = {
  points: AqiHistoryPoint[]
}

export default function useAqiHistory(location: SelectedLocation) {
  const [points, setPoints] = useState<AqiHistoryPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    axios
      .get<AqiHistoryResponse>('/api/aqi/history', {
        params: { lat: location.lat, lon: location.lon, hours: 24 },
      })
      .then(({ data }) => {
        if (!cancelled) setPoints(Array.isArray(data.points) ? data.points : [])
      })
      .catch(() => {
        if (!cancelled) {
          setPoints([])
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
    points,
    loading,
    error,
    retry: () => setRetryCount((count) => count + 1),
  }
}
