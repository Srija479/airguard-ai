import { useState } from 'react'
import { Bell } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from './LanguageSwitcher'
import { useAlerts } from '../hooks/AlertsProvider'

const navigation = [
  { to: '/', label: 'nav.home', end: true },
  { to: '/forecast', label: 'nav.forecast' },
  { to: '/map', label: 'nav.map' },
  { to: '/report', label: 'nav.report' },
] as const

export default function Layout() {
  const { t, i18n } = useTranslation()
  const { alerts, unreadCount, markRead, markAllRead, clear } = useAlerts()
  const [alertsOpen, setAlertsOpen] = useState(false)

  return (
    <div className="flex min-h-screen flex-col bg-[#faf9f6] text-stone-900">
      <header className="sticky top-0 z-30 border-b border-stone-300 bg-white">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <NavLink to="/" className="shrink-0 text-lg font-bold text-stone-950 no-underline">
            {t('app.name')}
          </NavLink>

          <nav className="hidden items-center gap-1 md:flex">
            {navigation.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `border-b-2 px-3 py-2 text-sm font-semibold no-underline ${
                    isActive
                      ? 'border-brand-blue text-brand-blue'
                      : 'border-transparent text-stone-700 hover:text-brand-blue'
                  }`
                }
              >
                {t(label)}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher />
            <div className="relative">
              <button
                type="button"
                aria-label={t('common.notifications')}
                aria-expanded={alertsOpen}
                aria-controls="alerts-panel"
                onClick={() => setAlertsOpen((open) => !open)}
                className="relative grid size-11 shrink-0 place-items-center rounded-sm border border-stone-300 bg-white text-stone-800 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
              >
                <Bell aria-hidden="true" size={20} />
                {unreadCount > 0 && (
                  <span aria-label={t('alerts.unreadCount', { count: unreadCount })} className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-aqi-poor px-1 text-[10px] font-bold text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
              {alertsOpen && (
                <section
                  id="alerts-panel"
                  aria-label={t('common.notifications')}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setAlertsOpen(false)
                  }}
                  className="fixed inset-x-0 top-16 z-50 max-h-[calc(100svh-4rem)] overflow-y-auto border-b border-stone-300 bg-white p-4 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 sm:max-h-[70svh] sm:border sm:p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-3 border-b border-stone-200 pb-3">
                    <h2 className="font-semibold text-stone-950">{t('common.notifications')}</h2>
                    <div className="flex gap-3 text-xs">
                      <button type="button" onClick={markAllRead} className="min-h-10 text-brand-blue underline underline-offset-2">{t('alerts.markAllRead')}</button>
                      <button type="button" onClick={clear} className="min-h-10 text-stone-700 underline underline-offset-2">{t('alerts.clear')}</button>
                    </div>
                  </div>
                  {alerts.length === 0 ? (
                    <p className="py-5 text-sm text-stone-700">{t('alerts.empty')}</p>
                  ) : (
                    <ul className="divide-y divide-stone-200">
                      {alerts.map((alert) => (
                        <li key={alert.id}>
                          <button
                            type="button"
                            onClick={() => markRead(alert.id)}
                            className={`w-full space-y-1 py-3 text-left ${alert.read ? 'text-stone-700' : 'text-stone-950'}`}
                          >
                            <span className="flex items-start justify-between gap-3">
                              <span className="font-semibold">{t(alert.title)}</span>
                              {!alert.read && <span aria-hidden="true" className="mt-1 size-2 shrink-0 rounded-full bg-brand-blue" />}
                            </span>
                            <span className="block text-sm">{t(alert.message, { place: alert.place, value: alert.value, category: alert.category ? t(`aqi.${alert.category}`) : '', status: typeof alert.value === 'string' ? t(`reportForm.review.${alert.value}`) : '' })}</span>
                            <span className="block text-xs text-stone-600">{alert.place} · {new Date(alert.time).toLocaleString(i18n.resolvedLanguage ?? i18n.language)}</span>
                            <span className="block text-xs font-medium text-stone-700">{t(alert.action)}</span>
                            <span className="block text-xs text-stone-500">{t(alert.source === 'modelled' ? 'alerts.sourceModelled' : alert.source === 'forecast' ? 'alerts.sourceForecast' : 'alerts.sourceReport')}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 sm:px-6 md:pb-8">
        <Outlet />
      </main>

      <footer className="border-t border-stone-300 bg-white px-4 py-4 text-center text-sm text-stone-600 md:px-6">
        <div className="mx-auto max-w-6xl space-y-2">
          <div>{t('footer.attribution')}</div>
          <Link to="/officer" className="text-xs text-stone-600 underline underline-offset-2">{t('footer.officerLogin')}</Link>
        </div>
      </footer>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-stone-300 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {navigation.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex min-h-16 items-center justify-center px-1 text-center text-xs font-semibold no-underline ${
                isActive ? 'text-brand-blue' : 'text-stone-700'
              }`
            }
          >
            {t(label)}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
