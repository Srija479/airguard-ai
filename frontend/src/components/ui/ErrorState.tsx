import { useTranslation } from 'react-i18next'
import Button from './Button'
import Card from './Card'

type ErrorStateProps = {
  onRetry: () => void
}

export default function ErrorState({ onRetry }: ErrorStateProps) {
  const { t } = useTranslation()

  return (
    <Card>
      <div role="alert" className="flex flex-wrap items-center justify-between gap-4">
        <p className="font-medium text-stone-900">{t('common.error')}</p>
        <Button onClick={onRetry}>{t('common.retry')}</Button>
      </div>
    </Card>
  )
}
