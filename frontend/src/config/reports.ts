export const reportOptions = {
  construction_dust: ['ongoing', 'paused', 'completed', 'not_sure'],
  waste_burning: ['burning_now', 'fire_out', 'ash_remaining', 'not_sure'],
  waste_dumping: ['uncollected', 'collection_in_progress', 'cleared', 'not_sure'],
  traffic: ['heavy_jam', 'recurring', 'cleared', 'not_sure'],
  industrial_smoke: ['emitting_now', 'stopped', 'recurring', 'not_sure'],
  road_dust: ['dust_visible', 'road_repair', 'fixed', 'not_sure'],
  other: ['happening_now', 'stopped', 'not_sure'],
} as const

export type ReportCategory = keyof typeof reportOptions
export type ActivityStatus = (typeof reportOptions)[ReportCategory][number]
export const reportCategories = Object.keys(reportOptions) as ReportCategory[]
export const activeActivityStatuses = new Set<ActivityStatus>([
  'ongoing',
  'burning_now',
  'ash_remaining',
  'uncollected',
  'collection_in_progress',
  'heavy_jam',
  'recurring',
  'emitting_now',
  'dust_visible',
  'road_repair',
  'happening_now',
])
