import { useEffect, useState } from 'react'

export type AdviceProfile = 'general' | 'child' | 'asthma' | 'elderly' | 'runner'

const STORAGE_KEY = 'airguard-profile'
const profiles: AdviceProfile[] = ['general', 'child', 'asthma', 'elderly', 'runner']

function readProfile(): AdviceProfile {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && profiles.includes(saved as AdviceProfile)) return saved as AdviceProfile
  } catch {
    return 'general'
  }
  return 'general'
}

export default function useProfile() {
  const [profile, setProfile] = useState<AdviceProfile>(readProfile)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, profile)
    } catch {
      // The selected profile remains usable when browser storage is unavailable.
    }
  }, [profile])

  return { profile, setProfile }
}
