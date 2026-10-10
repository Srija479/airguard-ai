import axios from 'axios'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { reportCategories } from '../config/reports'
import type { ReportCategory } from '../config/reports'

type OfficerHistory = { previous_status: string | null; new_status: string; note: string | null; created_at: string }
type OfficerPhoto = { url: string; filename: string }
type OfficerReport = {
  report_code: string
  category: ReportCategory
  title: string
  description: string
  place_name: string
  activity_status: string
  review_status: string
  created_at: string
  photos: OfficerPhoto[]
  history: OfficerHistory[]
}
type OfficerQueue = {
  items: OfficerReport[]
  counts: Record<string, number>
}

const statuses = ['submitted', 'under_review', 'action_planned', 'resolved', 'rejected'] as const

const allowedTransitions: Record<string, string[]> = {
  submitted: ['under_review', 'rejected'],
  under_review: ['action_planned', 'resolved', 'rejected'],
  action_planned: ['resolved', 'under_review'],
  resolved: ['under_review'],
  rejected: [],
}

export default function OfficerPage() {
  const { t, i18n } = useTranslation()
  const [token, setToken] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState(false)
  const [queue, setQueue] = useState<OfficerQueue>({ items: [], counts: {} })
  const [category, setCategory] = useState('')
  const [reviewStatus, setReviewStatus] = useState('')
  const [active, setActive] = useState('')
  const [city, setCity] = useState('')
  const [selectedCode, setSelectedCode] = useState('')
  const [nextStatus, setNextStatus] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [queueError, setQueueError] = useState(false)
  const [updateError, setUpdateError] = useState(false)
  const [reload, setReload] = useState(0)

  const selectedReport = queue.items.find((report) => report.report_code === selectedCode) ?? null

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    setQueueError(false)
    axios.get<OfficerQueue>('/api/officer/reports', {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        ...(category ? { category } : {}),
        ...(reviewStatus ? { review_status: reviewStatus } : {}),
        ...(active ? { active: active === 'active' } : {}),
        ...(city.trim() ? { city: city.trim() } : {}),
      },
    }).then(({ data }) => {
      if (!cancelled) {
        setQueue(data)
        if (!selectedCode && data.items[0]) setSelectedCode(data.items[0].report_code)
      }
    }).catch(() => {
      if (!cancelled) setQueueError(true)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [active, category, city, reload, reviewStatus, selectedCode, token])

  useEffect(() => {
    setNextStatus(selectedReport ? allowedTransitions[selectedReport.review_status]?.[0] ?? '' : '')
    setNote('')
  }, [selectedCode, selectedReport?.review_status])

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoginError(false)
    try {
      const { data } = await axios.post<{ access_token: string }>('/api/officer/login', { username, password })
      setToken(data.access_token)
      setPassword('')
    } catch {
      setLoginError(true)
    }
  }

  async function updateStatus(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedReport || !nextStatus || !note.trim()) return
    setUpdateError(false)
    try {
      await axios.patch(
        `/api/officer/reports/${encodeURIComponent(selectedReport.report_code)}/status`,
        { status: nextStatus, note: note.trim() },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      setNote('')
      setReload((value) => value + 1)
    } catch {
      setUpdateError(true)
    }
  }

  if (!token) {
    return (
      <section className="max-w-md space-y-5">
        <h1 className="text-2xl font-semibold text-stone-950">{t('officer.title')}</h1>
        <form onSubmit={login} className="space-y-4">
          <label className="block space-y-2 text-sm font-medium text-stone-800">
            <span>{t('officer.username')}</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required className="min-h-12 w-full rounded-sm border border-stone-400 bg-white px-3 py-2 text-base font-normal" />
          </label>
          <label className="block space-y-2 text-sm font-medium text-stone-800">
            <span>{t('officer.password')}</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required className="min-h-12 w-full rounded-sm border border-stone-400 bg-white px-3 py-2 text-base font-normal" />
          </label>
          {loginError && <p role="alert" className="text-sm text-aqi-poor">{t('officer.loginFailed')}</p>}
          <button type="submit" className="min-h-12 rounded-sm border border-stone-500 px-5 py-2 font-semibold text-stone-900 hover:bg-stone-100">{t('officer.login')}</button>
        </form>
      </section>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-stone-950">{t('officer.title')}</h1>
        <button type="button" onClick={() => { setToken(''); setQueue({ items: [], counts: {} }) }} className="min-h-12 px-2 text-sm font-semibold text-stone-800 underline underline-offset-4">{t('officer.logout')}</button>
      </div>
      <ul aria-label={t('officer.statusCounts')} className="flex flex-wrap gap-x-6 gap-y-2 border-y border-stone-300 py-3">
        {statuses.slice(0, 4).map((status) => (
          <li key={status} className="text-sm text-stone-700">{t(`officer.count.${status}`)}: <strong className="text-stone-950">{queue.counts[status] ?? 0}</strong></li>
        ))}
      </ul>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)]">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-stone-950">{t('officer.reports')}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium text-stone-700">
              <span>{t('officer.category')}</span>
              <select value={category} onChange={(event) => { setCategory(event.target.value); setSelectedCode('') }} className="min-h-11 w-full rounded-sm border border-stone-400 bg-white px-2 text-sm">
                <option value="">{t('officer.allCategories')}</option>
                {reportCategories.map((value) => <option key={value} value={value}>{t(`reportCategories.${value}`)}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-stone-700">
              <span>{t('officer.reviewStatus')}</span>
              <select value={reviewStatus} onChange={(event) => { setReviewStatus(event.target.value); setSelectedCode('') }} className="min-h-11 w-full rounded-sm border border-stone-400 bg-white px-2 text-sm">
                <option value="">{t('officer.allStatuses')}</option>
                {statuses.map((value) => <option key={value} value={value}>{t(`reviewStatuses.${value}`)}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-stone-700">
              <span>{t('officer.activity')}</span>
              <select value={active} onChange={(event) => { setActive(event.target.value); setSelectedCode('') }} className="min-h-11 w-full rounded-sm border border-stone-400 bg-white px-2 text-sm">
                <option value="">{t('officer.allActivity')}</option>
                <option value="active">{t('officer.activeOnly')}</option>
                <option value="inactive">{t('officer.inactiveOnly')}</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-stone-700">
              <span>{t('officer.city')}</span>
              <input value={city} onChange={(event) => { setCity(event.target.value); setSelectedCode('') }} className="min-h-11 w-full rounded-sm border border-stone-400 bg-white px-2 text-sm font-normal" />
            </label>
          </div>
          {loading && <p role="status" className="text-sm text-stone-600">{t('common.loading')}</p>}
          {queueError && <p role="alert" className="text-sm text-aqi-poor">{t('officer.loadFailed')}</p>}
          <div className="overflow-x-auto border-y border-stone-300">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <thead><tr className="border-b border-stone-300 text-xs text-stone-600">
                <th className="px-2 py-3 font-semibold">{t('officer.titleColumn')}</th>
                <th className="px-2 py-3 font-semibold">{t('officer.category')}</th>
                <th className="px-2 py-3 font-semibold">{t('officer.reviewStatus')}</th>
                <th className="px-2 py-3 font-semibold">{t('officer.date')}</th>
              </tr></thead>
              <tbody>
                {queue.items.map((report) => (
                  <tr key={report.report_code} className={`cursor-pointer border-b border-stone-200 ${selectedCode === report.report_code ? 'bg-stone-100' : ''}`}>
                    <td className="px-2 py-2"><button type="button" onClick={() => setSelectedCode(report.report_code)} className="min-h-10 text-left font-medium text-stone-900 underline-offset-2 hover:underline">{report.title}</button></td>
                    <td className="px-2 py-2">{t(`reportCategories.${report.category}`)}</td>
                    <td className="px-2 py-2">{t(`reviewStatuses.${report.review_status}`)}</td>
                    <td className="px-2 py-2">{new Date(report.created_at).toLocaleDateString(i18n.resolvedLanguage ?? i18n.language)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !queueError && queue.items.length === 0 && <p className="py-4 text-sm text-stone-700">{t('officer.noReports')}</p>}
          </div>
        </section>

        <section className="space-y-4 border-t border-stone-300 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <h2 className="text-lg font-semibold text-stone-950">{t('officer.details')}</h2>
          {selectedReport ? (
            <>
              <div className="space-y-2">
                <h3 className="font-semibold text-stone-950">{selectedReport.title}</h3>
                <p className="text-sm text-stone-700">{t(`reportCategories.${selectedReport.category}`)} · {selectedReport.place_name}</p>
                <p className="text-sm text-stone-700">{t('officer.activityStatus')}: {t(`activityStatuses.${selectedReport.activity_status}`)}</p>
                <p className="whitespace-pre-wrap text-sm text-stone-700">{selectedReport.description || t('officer.noDescription')}</p>
                {selectedReport.photos.length > 0 && <ul className="flex flex-wrap gap-2">{selectedReport.photos.map((photo) => <li key={photo.filename}><img src={photo.url} alt={t('officer.reportPhoto')} className="h-20 w-20 border border-stone-300 object-cover" /></li>)}</ul>}
              </div>
              <ol className="space-y-2 border-l border-stone-300 pl-4">
                {selectedReport.history.map((entry, index) => (
                  <li key={`${entry.created_at}-${index}`} className="text-sm text-stone-700">
                    <p>{t(`reviewStatuses.${entry.new_status}`)}</p>
                    {entry.note && <p>{entry.note}</p>}
                    <time className="text-xs text-stone-500">{new Date(entry.created_at).toLocaleString(i18n.resolvedLanguage ?? i18n.language)}</time>
                  </li>
                ))}
              </ol>
              {allowedTransitions[selectedReport.review_status]?.length > 0 && (
                <form onSubmit={updateStatus} className="space-y-3 border-t border-stone-300 pt-3">
                  <label className="block space-y-2 text-sm font-medium text-stone-800">
                    <span>{t('officer.newStatus')}</span>
                    <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)} required className="min-h-12 w-full rounded-sm border border-stone-400 bg-white px-3 py-2 text-base font-normal">
                      {allowedTransitions[selectedReport.review_status].map((status) => <option key={status} value={status}>{t(`reviewStatuses.${status}`)}</option>)}
                    </select>
                  </label>
                  <label className="block space-y-2 text-sm font-medium text-stone-800">
                    <span>{t('officer.noteRequired')}</span>
                    <textarea value={note} onChange={(event) => setNote(event.target.value)} required maxLength={2000} rows={3} className="w-full rounded-sm border border-stone-400 bg-white px-3 py-2 text-base font-normal" />
                  </label>
                  {updateError && <p role="alert" className="text-sm text-aqi-poor">{t('officer.updateFailed')}</p>}
                  <button type="submit" disabled={!note.trim()} className="min-h-12 rounded-sm border border-stone-500 px-4 py-2 text-sm font-semibold text-stone-900 hover:bg-stone-100 disabled:opacity-60">{t('officer.saveStatus')}</button>
                </form>
              )}
            </>
          ) : <p className="text-sm text-stone-700">{t('officer.selectReport')}</p>}
        </section>
      </div>
    </div>
  )
}