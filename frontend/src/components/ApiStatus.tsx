import { useQuery } from '@tanstack/react-query'
import { Activity, Database, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getHealth } from '../api/client'

export function ApiStatus() {
  // The shell can use this component anywhere a non-blocking backend health indicator is useful.
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ['health'], queryFn: getHealth, retry: false, refetchInterval: 30_000 })
  const { t } = useTranslation()
  const ok = data?.status === 'ok'
  const label = isPending ? t('status.checking') : isError ? t('status.unavailable') : ok ? t('status.connected') : t('status.degraded')
  return <section className="api-status" aria-label={t('status.label')}><div className="status-heading"><Activity aria-hidden="true" size={16} /><span className={ok ? 'status-dot is-ok' : 'status-dot'} aria-hidden="true" /><span>{label}</span></div>{data ? <dl className="status-details"><div><dt><Database aria-hidden="true" size={14} />{t('status.database')}</dt><dd>{data.database === 'connected' ? t('status.connectedValue') : t('status.unavailableValue')}</dd></div><div><dt><Server aria-hidden="true" size={14} />{t('status.cache')}</dt><dd>{data.cache === 'initialized' ? t('status.initialized') : t('status.notInitialized')}</dd></div></dl> : null}{isError ? <button className="text-button" type="button" onClick={() => void refetch()}>{t('actions.retry')}</button> : null}</section>
}
