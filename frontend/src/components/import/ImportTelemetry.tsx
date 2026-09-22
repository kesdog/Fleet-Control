import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cancelImport, commitImport, getImportProgress, previewImport, startImport, updateImportMapping, validateImport, type ImportMapping, type ImportPreview, type ImportProgress, type ImportValidation, type VesselSummary } from '../../api/client'
import { asApiError } from '../../api/errors'
import '../importTelemetry.css'
import { UploadStep } from './UploadStep'
import { DetectStep } from './DetectStep'
import { MappingStep } from './MappingStep'
import { ValidationStep } from './ValidationStep'
import { ReviewStep } from './ReviewStep'

type ImportTelemetryProps = {
  vessels: VesselSummary[]
  onClose: () => void
  onCommitted: (imo: string, samplesImported: number) => void
  onNotify: (message: string, tone: 'success' | 'error') => void
}

type Step = 'upload' | 'detect' | 'map' | 'validate' | 'review'

const steps: Step[] = [
  'upload', 'detect', 'map', 'validate', 'review',
]

function defaultMapping(preview: ImportPreview): ImportMapping {
  return Object.fromEntries(preview.files.map((file) => [file.filename, {
    semantic_fields: Object.fromEntries(file.columns.flatMap((column) => column.semantic_field ? [[column.source_column, column.semantic_field]] : [])),
    unit_overrides: Object.fromEntries(file.columns.flatMap((column) => column.requires_unit_mapping ? [[column.source_column, '']] : [])),
  }]))
}

export function ImportTelemetry({ vessels, onClose, onCommitted, onNotify }: ImportTelemetryProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>('upload')
  const [sessionId, setSessionId] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [mapping, setMapping] = useState<ImportMapping>({})
  const [validation, setValidation] = useState<ImportValidation | null>(null)
  const [imo, setImo] = useState('')
  const [name, setName] = useState('')
  const [replaceConfirmed, setReplaceConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [enrichmentProgress, setEnrichmentProgress] = useState<ImportProgress | null>(null)

  const currentIndex = steps.indexOf(step)
  const replacing = vessels.some((vessel) => vessel.imo === imo.trim())
  const needsUnitConfirmation = preview?.files.some((file) => file.fields_requiring_confirmation.some((column) => !mapping[file.filename]?.unit_overrides[column])) ?? false
  const notifyApiError = (error: unknown, fallbackKey: string) => {
    const apiError = asApiError(error)
    const key = apiError.code ? `apiErrors.${apiError.code}` : fallbackKey
    onNotify(t(key, { defaultValue: apiError.message || t(fallbackKey) }), 'error')
  }

  useEffect(() => {
    if (!committing || !sessionId) return
    let cancelled = false
    const refreshProgress = async () => {
      try {
        const progress = await getImportProgress(sessionId)
        if (!cancelled) setEnrichmentProgress(progress)
      } catch {
        // The commit may not have persisted its progress record yet.
      }
    }
    void refreshProgress()
    const interval = window.setInterval(() => void refreshProgress(), 1_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [committing, sessionId])

  const close = async () => {
    if (busy) return
    if (sessionId) {
      try { await cancelImport(sessionId) }
      catch (error) { notifyApiError(error, 'import.discardError') }
    }
    onClose()
  }

  const selectFiles = (nextFiles: File[]) => {
    setFiles(nextFiles.filter((file) => file.name.toLowerCase().endsWith('.csv')))
  }

  const upload = async () => {
    if (!files.length) return
    setBusy(true)
    try {
      const session = await startImport(files)
      setSessionId(session.session_id)
      const nextPreview = await previewImport(session.session_id)
      setPreview(nextPreview)
      setMapping(defaultMapping(nextPreview))
      setStep('detect')
    } catch (error) {
      notifyApiError(error, 'import.uploadError')
    } finally { setBusy(false) }
  }

  const saveMapping = async () => {
    if (!sessionId || needsUnitConfirmation) return
    setBusy(true)
    try {
      await updateImportMapping(sessionId, mapping)
      setStep('validate')
    } catch (error) {
      notifyApiError(error, 'import.mappingError')
    } finally { setBusy(false) }
  }

  const validate = async () => {
    if (!sessionId) return
    setBusy(true)
    try {
      const result = await validateImport(sessionId)
      setValidation(result)
      const errors = result.issues.filter((issue) => issue.severity === 'error')
      if (errors.length) onNotify(t('import.validationFailedToast', { count: errors.length }), 'error')
      else setStep('review')
    } catch (error) {
      notifyApiError(error, 'import.validationError')
    } finally { setBusy(false) }
  }

  const commit = async () => {
    if (!sessionId || !imo.trim() || validation?.issues.some((issue) => issue.severity === 'error') || (replacing && !replaceConfirmed)) return
    setEnrichmentProgress({ session_id: sessionId, status: 'VALIDATED', imo: imo.trim(), enrichment_days_completed: 0, enrichment_days_total: 0 })
    setCommitting(true)
    setBusy(true)
    try {
       const result = await commitImport(sessionId, imo.trim(), name.trim(), replacing ? 'REPLACE' : 'CREATE')
       setSessionId('')
       setEnrichmentProgress(null)
      onCommitted(result.imo, result.samples_imported)
    } catch (error) {
      notifyApiError(error, 'import.commitError')
    } finally { setBusy(false); setCommitting(false) }
  }

  const setSemanticField = (filename: string, column: string, semantic: string) => {
    setMapping((current) => {
      const semanticFields = { ...current[filename]?.semantic_fields }
      if (semantic) semanticFields[column] = semantic
      else delete semanticFields[column]
      return { ...current, [filename]: { ...current[filename], semantic_fields: semanticFields } }
    })
  }

  const setUnit = (filename: string, column: string, unit: string) => {
    setMapping((current) => ({ ...current, [filename]: { ...current[filename], unit_overrides: { ...current[filename]?.unit_overrides, [column]: unit } } }))
  }

  return <main className="import-view" aria-labelledby="import-title">
    <header className="import-topbar"><div><p className="eyebrow">{t('import.intake')}</p><h1 id="import-title">{t('import.title')}</h1></div><button type="button" className="import-close" onClick={() => void close()} disabled={busy}><X size={18} aria-hidden="true" /><span>{t('import.close')}</span></button></header>
    <ol className="import-progress" aria-label={t('import.progress')}>
      {steps.map((item, index) => <li key={item} className={index < currentIndex ? 'is-complete' : index === currentIndex ? 'is-current' : ''}><span>{index < currentIndex ? <Check size={13} aria-hidden="true" /> : index + 1}</span>{t(`import.${item}`)}</li>)}
    </ol>

    <section className="import-stage">{step === 'upload' ? <UploadStep files={files} busy={busy} onSelectFiles={selectFiles} onUpload={() => void upload()} /> : null}{step === 'detect' && preview ? <DetectStep preview={preview} onBack={() => setStep('upload')} onContinue={() => setStep('map')} /> : null}{step === 'map' && preview ? <MappingStep preview={preview} mapping={mapping} needsUnitConfirmation={needsUnitConfirmation} busy={busy} onSemanticField={setSemanticField} onUnit={setUnit} onBack={() => setStep('detect')} onSave={() => void saveMapping()} /> : null}{step === 'validate' ? <ValidationStep validation={validation} busy={busy} onBack={() => setStep('map')} onValidate={() => void validate()} /> : null}{step === 'review' && validation ? <ReviewStep validation={validation} imo={imo} name={name} replacing={replacing} replaceConfirmed={replaceConfirmed} busy={busy} committing={committing} progress={enrichmentProgress} onImoChange={(value) => { setImo(value); setReplaceConfirmed(false) }} onNameChange={setName} onReplaceConfirmedChange={setReplaceConfirmed} onBack={() => setStep('validate')} onCommit={() => void commit()} /> : null}</section>
  </main>
}
