import type { AqiCategory } from '../hooks/useAqi'
import type { AdviceProfile } from '../hooks/useProfile'

export type AdviceKey = `profileAdvice.${AdviceProfile}.${AqiCategory}`

export function getAdviceKey(category: AqiCategory, profile: AdviceProfile): AdviceKey {
  return `profileAdvice.${profile}.${category}`
}
