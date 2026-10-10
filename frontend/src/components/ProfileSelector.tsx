import { useTranslation } from 'react-i18next'
import type { AdviceProfile } from '../hooks/useProfile'

type ProfileSelectorProps = {
  value: AdviceProfile
  onChange: (profile: AdviceProfile) => void
}

const profiles: AdviceProfile[] = ['general', 'child', 'asthma', 'elderly', 'runner']

export default function ProfileSelector({ value, onChange }: ProfileSelectorProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <label htmlFor="advice-profile" className="text-sm font-medium text-stone-700">
        {t('profileSelector.label')}
      </label>
      <select
        id="advice-profile"
        value={value}
        onChange={(event) => onChange(event.target.value as AdviceProfile)}
        className="min-h-12 min-w-48 rounded-sm border border-stone-400 bg-white px-3 py-2 text-base text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
      >
        {profiles.map((profile) => (
          <option key={profile} value={profile}>
            {t(`profileSelector.${profile}`)}
          </option>
        ))}
      </select>
    </div>
  )
}
