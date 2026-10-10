import type { AqiHistoryPoint } from '../hooks/useAqiHistory'

export default function getBestTime(points: AqiHistoryPoint[]): string | null {
  const today = [...points]
    .filter((point) => Number.isFinite(point.aqi) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(point.observed_at))
    .sort((a, b) => a.observed_at.localeCompare(b.observed_at))
    .at(-1)?.observed_at.slice(0, 10)

  if (!today) return null

  const todayPoints = points.filter(
    (point) =>
      point.observed_at.startsWith(today) &&
      Number.isFinite(point.aqi) &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(point.observed_at),
  )
  if (todayPoints.length < 2) return null

  const best = todayPoints.reduce((lowest, point) => (point.aqi < lowest.aqi ? point : lowest))
  const hour = best.observed_at.slice(11, 13)
  return /^\d{2}$/.test(hour) ? `${hour}:00` : null
}
