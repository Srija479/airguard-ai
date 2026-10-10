import { useTranslation } from 'react-i18next'
import type { AqiCategory } from '../hooks/useAqi'

const segments: { category: AqiCategory; color: string }[] = [
  { category: 'good', color: 'bg-aqi-good' },
  { category: 'satisfactory', color: 'bg-aqi-satisfactory' },
  { category: 'moderate', color: 'bg-aqi-moderate' },
  { category: 'poor', color: 'bg-aqi-poor' },
  { category: 'veryPoor', color: 'bg-aqi-very-poor' },
  { category: 'severe', color: 'bg-aqi-severe' },
]

type AqiScaleProps = {
  value: number
}

export default function AqiScale({ value }: AqiScaleProps) {
  const { t } = useTranslation()
  const position = (Math.min(500, Math.max(0, value)) / 500) * 100

  return (
    <div role="img" aria-label={t('aqi.scaleLabel')} className="w-full max-w-lg">
      <div className="relative flex h-2 overflow-visible">
        {segments.map(({ category, color }) => (
          <span key={category} className={`h-2 flex-1 ${color}`} />
        ))}
        <span
          aria-hidden="true"
          className="absolute top-[-3px] h-3 w-0.5 bg-stone-950"
          style={{ left: `${position}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-stone-600">
        <span>{t('aqi.good')}</span>
        <span>{t('aqi.severe')}</span>
      </div>
    </div>
  )
}
