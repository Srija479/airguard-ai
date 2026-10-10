import { useTranslation } from 'react-i18next'
import Card from './Card'

export default function Skeleton() {
  const { t } = useTranslation()

  return (
    <Card>
      <div role="status" aria-label={t('common.loading')} aria-busy="true" className="space-y-4">
        <div className="h-6 w-2/5 rounded-sm bg-stone-200" />
        <div className="h-4 w-3/4 rounded-sm bg-stone-200" />
      </div>
    </Card>
  )
}
