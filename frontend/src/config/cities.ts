export const cities = [
  { name: 'Delhi', translationKey: 'cities.delhi', lat: 28.6139, lon: 77.209 },
  { name: 'Mumbai', translationKey: 'cities.mumbai', lat: 19.076, lon: 72.8777 },
  { name: 'Bengaluru', translationKey: 'cities.bengaluru', lat: 12.9716, lon: 77.5946 },
  { name: 'Hyderabad', translationKey: 'cities.hyderabad', lat: 17.385, lon: 78.4867 },
  { name: 'Chennai', translationKey: 'cities.chennai', lat: 13.0827, lon: 80.2707 },
  { name: 'Kolkata', translationKey: 'cities.kolkata', lat: 22.5726, lon: 88.3639 },
  { name: 'Pune', translationKey: 'cities.pune', lat: 18.5204, lon: 73.8567 },
  { name: 'Ahmedabad', translationKey: 'cities.ahmedabad', lat: 23.0225, lon: 72.5714 },
] as const

export type CityQuickPick = (typeof cities)[number]
