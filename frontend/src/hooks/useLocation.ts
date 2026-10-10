import { useEffect, useState } from 'react'

export type SelectedLocation = {
  name: string
  lat: number
  lon: number
  translationKey?: string
}

const STORAGE_KEY = 'airguard-location'
const defaultLocation: SelectedLocation = {
  name: 'Hyderabad',
  lat: 17.385,
  lon: 78.4867,
  translationKey: 'cities.hyderabad',
}

function readSavedLocation(): SelectedLocation {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return defaultLocation

    const place: unknown = JSON.parse(saved)
    if (
      typeof place === 'object' &&
      place !== null &&
      'name' in place &&
      typeof place.name === 'string' &&
      'lat' in place &&
      typeof place.lat === 'number' &&
      'lon' in place &&
      typeof place.lon === 'number'
    ) {
      return place as SelectedLocation
    }
  } catch {
    return defaultLocation
  }
  return defaultLocation
}

export default function useLocation() {
  const [location, setLocation] = useState<SelectedLocation>(readSavedLocation)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(location))
    } catch {
      // The current selection still works when browser storage is unavailable.
    }
  }, [location])

  return { location, setLocation }
}
