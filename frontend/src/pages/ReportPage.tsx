import axios from 'axios'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import ReportLocationPicker from '../components/ReportLocationPicker'
import { reportCategories, reportOptions } from '../config/reports'
import useLocation from '../hooks/useLocation'

const reportSchema = z
  .object({
    category: z.enum(reportCategories),
    activity_status: z.string(),
    title: z.string().trim().min(3).max(100),
    description: z.string().max(1000),
    place_name: z.string().trim().min(1),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
  })
  .superRefine((values, context) => {
    if (!(reportOptions[values.category] as readonly string[]).includes(values.activity_status)) {
      context.addIssue({ code: 'custom', path: ['activity_status'], message: 'status' })
    }
    if ((values.latitude === null) !== (values.longitude === null)) {
      context.addIssue({ code: 'custom', path: ['latitude'], message: 'coordinates' })
    }
  })

type ReportFormValues = z.infer<typeof reportSchema>
type SavedReport = { code: string; savedAt: string }
type ReportHistoryEntry = {
  previous_status: string | null
  new_status: string
  note: string | null
  created_at: string | null
}
type CitizenReport = {
  code: string
  category: ReportFormValues['category']
  title: string
  place_name: string
  activity_status: string
  review_status: string
  created_at: string | null
  photo_urls: string[]
  history: ReportHistoryEntry[]
}

function readSavedReports(): SavedReport[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem('myReports') ?? '[]')
    if (!Array.isArray(stored)) return []
    return stored.filter(
      (item): item is SavedReport =>
        typeof item?.code === 'string' && typeof item?.savedAt === 'string',
    )
  } catch {
    return []
  }
}

const validationKeys: Record<string, string> = {
  category: 'reportForm.validationCategory',
  activity_status: 'reportForm.validationStatus',
  title: 'reportForm.validationTitle',
  place_name: 'reportForm.validationPlace',
  latitude: 'reportForm.validationCoordinates',
}

export default function ReportPage() {
  const { t } = useTranslation()
  const { location } = useLocation()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'new' | 'mine'>('new')
  const [myReports, setMyReports] = useState<SavedReport[]>(readSavedReports)
  const [citizenReports, setCitizenReports] = useState<CitizenReport[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportsError, setReportsError] = useState(false)
  const [step, setStep] = useState(1)
  const [photos, setPhotos] = useState<File[]>([])
  const [photoError, setPhotoError] = useState('')
  const [previews, setPreviews] = useState<string[]>([])
  const [locationMessage, setLocationMessage] = useState('')
  const [isLocating, setIsLocating] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const [reportCode, setReportCode] = useState('')
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<ReportFormValues>({
    defaultValues: {
      category: '' as ReportFormValues['category'],
      activity_status: '',
      title: '',
      description: '',
      place_name: location.name,
      latitude: location.lat,
      longitude: location.lon,
    },
  })
  const category = watch('category')
  const latitude = watch('latitude')
  const longitude = watch('longitude')

  useEffect(() => {
    const urls = photos.map((photo) => URL.createObjectURL(photo))
    setPreviews(urls)
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [photos])

  useEffect(() => {
    if (tab !== 'mine' || myReports.length === 0) {
      setCitizenReports([])
      setReportsError(false)
      return
    }
    let cancelled = false
    setReportsLoading(true)
    setReportsError(false)
    axios
      .get<CitizenReport[]>('/api/reports/by-codes', {
        params: { codes: myReports.map((report) => report.code).join(',') },
      })
      .then(({ data }) => {
        if (!cancelled) setCitizenReports(data)
      })
      .catch(() => {
        if (!cancelled) setReportsError(true)
      })
      .finally(() => {
        if (!cancelled) setReportsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [myReports, tab])

  function chooseFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? [])
    event.target.value = ''
    setPhotoError('')
    if (selected.length > 3) {
      setPhotoError('reportForm.photoCountError')
      return
    }
    if (selected.some((file) => file.size > 5 * 1024 * 1024)) {
      setPhotoError('reportForm.photoSizeError')
      return
    }
    if (selected.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      setPhotoError('reportForm.photoTypeError')
      return
    }
    setPhotos(selected)
  }

  function useMyLocation() {
    setLocationMessage('')
    if (!navigator.geolocation) {
      setLocationMessage('reportForm.locationUnavailable')
      return
    }
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setValue('latitude', coords.latitude)
        setValue('longitude', coords.longitude)
        setValue('place_name', t('cities.currentLocation'), { shouldDirty: true })
        setIsLocating(false)
      },
      (error) => {
        setLocationMessage(
          error.code === error.PERMISSION_DENIED
            ? 'reportForm.locationDenied'
            : 'reportForm.locationUnavailable',
        )
        setIsLocating(false)
      },
      { timeout: 10000, maximumAge: 60000 },
    )
  }

  function advanceToStepTwo() {
    if (!category) {
      setError('category', { type: 'manual', message: validationKeys.category })
      return
    }
    clearErrors('category')
    setStep(2)
  }

  function advanceToStepThree() {
    if (!watch('place_name').trim()) {
      setError('place_name', { type: 'manual', message: validationKeys.place_name })
      return
    }
    if ((latitude === null) !== (longitude === null)) {
      setError('latitude', { type: 'manual', message: validationKeys.latitude })
      return
    }
    clearErrors(['place_name', 'latitude'])
    setStep(3)
  }

  async function submitReport(values: ReportFormValues) {
    clearErrors()
    setSubmitError(false)
    const result = reportSchema.safeParse(values)
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = String(issue.path[0] ?? 'title')
        const message = issue.message === 'status'
          ? validationKeys.activity_status
          : issue.message === 'coordinates'
            ? validationKeys.latitude
            : validationKeys[field] ?? 'reportForm.validationTitle'
        if (field in validationKeys) {
          setError(field as keyof ReportFormValues, { type: 'manual', message })
        }
      }
      return
    }

    const formData = new FormData()
    formData.append('category', values.category)
    formData.append('activity_status', values.activity_status)
    formData.append('title', values.title.trim())
    formData.append('description', values.description)
    formData.append('place_name', values.place_name.trim())
    if (values.latitude !== null && values.longitude !== null) {
      formData.append('latitude', String(values.latitude))
      formData.append('longitude', String(values.longitude))
    }
    photos.forEach((photo) => formData.append('photos', photo))

    setIsSubmitting(true)
    try {
      const { data } = await axios.post<{ report_code: string }>('/api/reports', formData)
      setReportCode(data.report_code)
      const savedReport = { code: data.report_code, savedAt: new Date().toISOString() }
      const updated = [savedReport, ...myReports.filter((report) => report.code !== data.report_code)].slice(0, 20)
      localStorage.setItem('myReports', JSON.stringify(updated))
      setMyReports(updated)
    } catch {
      setSubmitError(true)
    } finally {
      setIsSubmitting(false)
    }
  }

  const steps = ['reportForm.stepOne', 'reportForm.stepTwo', 'reportForm.stepThree']
  const tips = category
    ? (t(`categoryTips.${category}`, { returnObjects: true }) as string[])
    : []
  const statusOptions = category ? reportOptions[category] : []

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold text-stone-950">{t('pages.report.title')}</h1>
      <div role="tablist" aria-label={t('pages.report.title')} className="flex border-b border-stone-300">
        {(['new', 'mine'] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => {
              setTab(item)
              if (item === 'mine') setReportCode('')
            }}
            className={`min-h-12 border-b-2 px-4 py-2 text-sm font-medium ${
              tab === item ? 'border-brand-blue text-brand-blue' : 'border-transparent text-stone-700'
            }`}
          >
            {t(item === 'new' ? 'reportForm.newReportTab' : 'reportForm.myReportsTab')}
          </button>
        ))}
      </div>

      {tab === 'mine' ? (
        <section role="tabpanel" className="space-y-4">
          <p className="text-sm text-stone-600">{t('reportForm.savedOnDevice')}</p>
          {myReports.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-stone-700">{t('reportForm.emptyReports')}</p>
              <button type="button" onClick={() => setTab('new')} className="min-h-12 text-sm font-semibold text-brand-blue underline underline-offset-4">
                {t('reportForm.reportNow')}
              </button>
            </div>
          ) : reportsLoading ? (
            <p role="status" className="text-sm text-stone-600">{t('common.loading')}</p>
          ) : reportsError ? (
            <p role="alert" className="text-sm text-stone-700">{t('reportForm.loadReportsFailed')}</p>
          ) : (
            <ul className="divide-y divide-stone-200 border-y border-stone-300">
              {citizenReports.map((report) => (
                <li key={report.code} className="space-y-3 py-4">
                  {report.photo_urls[0] && (
                    <img src={report.photo_urls[0]} alt={t('reportForm.photoPreview', { index: 1 })} className="h-20 w-20 border border-stone-300 object-cover" />
                  )}
                  <h2 className="font-semibold text-stone-950">{report.title}</h2>
                  <p className="text-sm text-stone-700">
                    {t(`reportCategories.${report.category}`)} · {report.place_name} · {report.created_at ? new Date(report.created_at).toLocaleDateString() : ''}
                  </p>
                  {report.review_status === 'submitted' && <p className="text-sm text-stone-700">{t('reportForm.unverified')}</p>}
                  <p className="text-sm text-stone-700">{t('reportForm.reportedByYou')}: {t(`activityStatuses.${report.activity_status}`)}</p>
                  <p className="text-sm font-medium text-stone-800">{t(`reportForm.review.${report.review_status}`)}</p>
                  {report.history.length > 0 && (
                    <ol className="space-y-2 border-l border-stone-300 pl-4">
                      {report.history.map((entry, index) => (
                        <li key={`${entry.created_at}-${index}`} className="text-sm text-stone-700">
                          <p>{t(`reportForm.review.${entry.new_status}`)}</p>
                          {entry.note && <p>{entry.note}</p>}
                          {entry.created_at && <time className="text-xs text-stone-500">{new Date(entry.created_at).toLocaleString()}</time>}
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : reportCode ? (
        <section role="tabpanel" className="max-w-2xl space-y-4 border-t border-stone-300 pt-6">
          <h2 className="text-lg font-semibold text-stone-950">{t('reportForm.successMessage')}</h2>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => navigate(`/map?focus=${encodeURIComponent(reportCode)}`)} className="min-h-12 rounded-sm border border-stone-400 px-4 py-2 font-semibold text-stone-900 hover:bg-stone-100">
              {t('reportForm.seeOnMap')}
            </button>
            <button type="button" onClick={() => setTab('mine')} className="min-h-12 rounded-sm border border-stone-400 px-4 py-2 font-semibold text-stone-900 hover:bg-stone-100">
              {t('reportForm.myReportsTab')}
            </button>
          </div>
        </section>
      ) : (
      <>
      <ol aria-label={t('reportForm.progress')} className="grid grid-cols-3 border-b border-stone-300">
        {steps.map((label, index) => (
          <li
            key={label}
            aria-current={step === index + 1 ? 'step' : undefined}
            className={`min-h-12 border-b-2 px-2 py-3 text-sm ${
              step === index + 1
                ? 'border-stone-900 font-semibold text-stone-950'
                : 'border-transparent text-stone-600'
            }`}
          >
            {index + 1}. {t(label)}
          </li>
        ))}
      </ol>

      <form onSubmit={handleSubmit(submitReport)} className="space-y-6">
        {step === 1 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-stone-900">{t('reportForm.categoryPrompt')}</h2>
            <div role="radiogroup" aria-label={t('reportForm.categoryPrompt')} className="divide-y divide-stone-200 border-y border-stone-300">
              {reportCategories.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="radio"
                  aria-checked={category === item}
                  onClick={() => {
                    setValue('category', item, { shouldDirty: true })
                    setValue('activity_status', '')
                  }}
                  className={`min-h-14 w-full px-3 py-3 text-left text-base ${
                    category === item ? 'font-semibold text-stone-950' : 'text-stone-800'
                  }`}
                >
                  {t(`reportCategories.${item}`)}
                </button>
              ))}
            </div>
            {errors.category?.message && <p role="alert" className="text-sm text-aqi-poor">{t(errors.category.message)}</p>}
            {tips.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-stone-800">{t('reportForm.tipsTitle')}</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
                  {tips.map((tip) => <li key={tip}>{tip}</li>)}
                </ul>
              </div>
            )}
            <button type="button" onClick={advanceToStepTwo} className="min-h-12 rounded-sm border border-stone-400 px-5 py-2 font-semibold text-stone-900 hover:bg-stone-100">
              {t('reportForm.continue')}
            </button>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-stone-900">{t('reportForm.locationTitle')}</h2>
            <button type="button" onClick={useMyLocation} disabled={isLocating} className="min-h-12 rounded-sm border border-stone-400 px-4 py-2 font-semibold text-stone-900 hover:bg-stone-100 disabled:opacity-60">
              {isLocating ? t('reportForm.locating') : t('reportForm.useMyLocation')}
            </button>
            {locationMessage && <p role="status" className="text-sm text-stone-700">{t(locationMessage)}</p>}
            <ReportLocationPicker
              latitude={latitude ?? location.lat}
              longitude={longitude ?? location.lon}
              onPick={(lat, lon) => {
                setValue('latitude', lat, { shouldDirty: true })
                setValue('longitude', lon, { shouldDirty: true })
                setValue('place_name', t('map.selectedLocation'), { shouldDirty: true })
              }}
            />
            <label className="block space-y-2 text-sm font-medium text-stone-800">
              <span>{t('reportForm.areaName')}</span>
              <input
                {...register('place_name')}
                placeholder={t('reportForm.areaPlaceholder')}
                className="min-h-12 w-full rounded-sm border border-stone-400 bg-white px-3 py-2 text-base font-normal"
              />
            </label>
            {errors.place_name?.message && <p role="alert" className="text-sm text-aqi-poor">{t(errors.place_name.message)}</p>}
            {errors.latitude?.message && <p role="alert" className="text-sm text-aqi-poor">{t(errors.latitude.message)}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(1)} className="min-h-12 px-4 py-2 text-stone-800 underline underline-offset-4">{t('reportForm.back')}</button>
              <button type="button" onClick={advanceToStepThree} className="min-h-12 rounded-sm border border-stone-400 px-5 py-2 font-semibold text-stone-900 hover:bg-stone-100">{t('reportForm.continue')}</button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="space-y-5">
            <label className="block space-y-2 text-sm font-medium text-stone-800">
              <span>{t('reportForm.statusTitle')}</span>
              <select {...register('activity_status')} className="min-h-12 w-full rounded-sm border border-stone-400 bg-white px-3 py-2 text-base font-normal">
                <option value="">{t('reportForm.statusTitle')}</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>{t(`activityStatuses.${status}`)}</option>
                ))}
              </select>
            </label>
            {errors.activity_status?.message && <p role="alert" className="text-sm text-aqi-poor">{t(errors.activity_status.message)}</p>}

            <label className="block space-y-2 text-sm font-medium text-stone-800">
              <span>{t('reportForm.title')}</span>
              <input {...register('title')} maxLength={100} placeholder={t('reportForm.titlePlaceholder')} className="min-h-12 w-full rounded-sm border border-stone-400 bg-white px-3 py-2 text-base font-normal" />
            </label>
            {errors.title?.message && <p role="alert" className="text-sm text-aqi-poor">{t(errors.title.message)}</p>}

            <label className="block space-y-2 text-sm font-medium text-stone-800">
              <span>{t('reportForm.description')}</span>
              <textarea {...register('description')} maxLength={1000} rows={4} placeholder={t('reportForm.descriptionPlaceholder')} className="w-full rounded-sm border border-stone-400 bg-white px-3 py-2 text-base font-normal" />
            </label>

            <div className="space-y-2">
              <label htmlFor="report-photos" className="block text-sm font-medium text-stone-800">{t('reportForm.photos')}</label>
              <p className="text-sm text-stone-600">{t('reportForm.photoHelp')}</p>
              <input id="report-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={chooseFiles} className="min-h-12 max-w-full py-2 text-sm text-stone-800" />
              {photoError && <p role="alert" className="text-sm text-aqi-poor">{t(photoError)}</p>}
              {previews.length > 0 && (
                <ul className="flex flex-wrap gap-3">
                  {previews.map((preview, index) => (
                    <li key={preview}>
                      <img src={preview} alt={t('reportForm.photoPreview', { index: index + 1 })} className="h-20 w-20 border border-stone-300 object-cover" />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="border-l-2 border-stone-400 pl-3 text-sm text-stone-700">{t('reportForm.safety')}</p>
            <p className="text-sm text-stone-600">{t('reportForm.staysInLanguage')}</p>
            {submitError && <p role="alert" className="text-sm text-aqi-poor">{t('reportForm.submitFailed')}</p>}
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => setStep(2)} className="min-h-12 px-4 py-2 text-stone-800 underline underline-offset-4">{t('reportForm.back')}</button>
              <button type="submit" disabled={isSubmitting} className="min-h-12 rounded-sm border border-stone-500 bg-white px-5 py-2 font-semibold text-stone-900 hover:bg-stone-100 disabled:opacity-60">
                {isSubmitting ? t('reportForm.submitting') : t('reportForm.submit')}
              </button>
            </div>
          </section>
        )}
      </form>
      </>
      )}
    </div>
  )
}
