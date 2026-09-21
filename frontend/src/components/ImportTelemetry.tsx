import { useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, FileUp, LoaderCircle, Upload, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cancelImport, commitImport, previewImport, startImport, updateImportMapping, validateImport, type ImportMapping, type ImportPreview, type ImportValidation, type VesselSummary } from '../api/client'
import './importTelemetry.css'

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

const semanticFields = [
  'timestamp', 'latitude', 'longitude', 'sog', 'course', 'heading',
] as const

const speedUnits = ['kn', 'km/h', 'mph', 'm/s']

function defaultMapping(preview: ImportPreview): ImportMapping {
  return Object.fromEntries(preview.files.map((file) => [file.filename, {
    semantic_fields: Object.fromEntries(file.columns.flatMap((column) => column.semantic_field ? [[column.source_column, column.semantic_field]] : [])),
    unit_overrides: Object.fromEntries(file.columns.flatMap((column) => column.requires_unit_mapping ? [[column.source_column, '']] : [])),
  }]))
}

function Messages({ heading, messages, tone }: { heading: string; messages: string[]; tone: 'error' | 'warning' | 'info' }) {
  if (!messages.length) return null
  return <section className={`import-messages is-${tone}`} aria-label={heading}>
    {tone === 'error' ? <AlertTriangle size={17} aria-hidden="true" /> : null}
    <div><strong>{heading}</strong><ul>{messages.map((message) => <li key={message}>{message}</li>)}</ul></div>
  </section>
}

export function ImportTelemetry({ vessels, onClose, onCommitted, onNotify }: ImportTelemetryProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
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

  const currentIndex = steps.indexOf(step)
  const replacing = vessels.some((vessel) => vessel.imo === imo.trim())
  const needsUnitConfirmation = preview?.files.some((file) => file.fields_requiring_confirmation.some((column) => !mapping[file.filename]?.unit_overrides[column])) ?? false

  const close = async () => {
    if (busy) return
    if (sessionId) {
      try { await cancelImport(sessionId) }
      catch (error) { onNotify(error instanceof Error ? error.message : t('import.discardError'), 'error') }
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
      onNotify(error instanceof Error ? error.message : t('import.uploadError'), 'error')
    } finally { setBusy(false) }
  }

  const saveMapping = async () => {
    if (!sessionId || needsUnitConfirmation) return
    setBusy(true)
    try {
      await updateImportMapping(sessionId, mapping)
      setStep('validate')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('import.mappingError'), 'error')
    } finally { setBusy(false) }
  }

  const validate = async () => {
    if (!sessionId) return
    setBusy(true)
    try {
      const result = await validateImport(sessionId)
      setValidation(result)
      if (!result.errors.length) setStep('review')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('import.validationError'), 'error')
    } finally { setBusy(false) }
  }

  const commit = async () => {
    if (!sessionId || !imo.trim() || validation?.errors.length || (replacing && !replaceConfirmed)) return
    setBusy(true)
    try {
      const result = await commitImport(sessionId, imo.trim(), name.trim(), replacing ? 'REPLACE' : 'CREATE')
      setSessionId('')
      onCommitted(result.imo, result.samples_imported)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : t('import.commitError'), 'error')
    } finally { setBusy(false) }
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

    <section className="import-stage">
      {step === 'upload' ? <>
        <div className="import-stage-heading"><p className="eyebrow">01 / {t('import.upload')}</p><h2>{t('import.stageUpload')}</h2><p>{t('import.uploadDescription')}</p></div>
        <input ref={inputRef} className="sr-only" type="file" accept=".csv,text/csv" multiple onChange={(event) => selectFiles(Array.from(event.target.files ?? []))} />
        <button type="button" className="import-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectFiles(Array.from(event.dataTransfer.files)) }}><Upload size={28} aria-hidden="true" /><strong>{t('import.chooseFiles')}</strong><span>{t('import.fileHint')}</span></button>
        {files.length ? <ul className="import-file-list">{files.map((file) => <li key={`${file.name}-${file.size}`}><FileUp size={16} aria-hidden="true" /><span>{file.name}</span><small>{Math.ceil(file.size / 1024)} KB</small></li>)}</ul> : null}
        <div className="import-stage-actions"><span /><button type="button" className="import-primary" onClick={() => void upload()} disabled={!files.length || busy}>{busy ? <LoaderCircle className="is-spinning" size={16} /> : null}{t('import.inspect')} <ArrowRight size={16} /></button></div>
      </> : null}

      {step === 'detect' && preview ? <>
        <div className="import-stage-heading"><p className="eyebrow">02 / {t('import.detect')}</p><h2>{t('import.stageDetect')}</h2><p>{t('import.detectDescription')}</p></div>
        {preview.files.map((file) => <article className="import-file-preview" key={file.filename}><div className="import-file-heading"><div><h3>{file.filename}</h3><p>{t('import.rows', { count: file.row_count })}{file.timestamp_range ? ` | ${file.timestamp_range[0]} to ${file.timestamp_range[1]}` : ''}</p></div><span>{t('import.columns', { count: file.source_columns.length })}</span></div><Messages heading={t('import.inspectionWarnings')} messages={file.warnings} tone="warning" /><div className="import-column-tags">{file.columns.map((column) => <span key={column.source_column} className={column.requires_unit_mapping ? 'needs-confirmation' : ''}>{column.source_column}{column.semantic_field ? ` -> ${column.semantic_field}` : ` -> ${t('import.metric')}`}</span>)}</div><details><summary>{t('import.previewRows')}</summary><div className="import-table-wrap"><table><thead><tr>{file.source_columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{file.sample_rows.map((row, index) => <tr key={index}>{file.source_columns.map((column) => <td key={column}>{row[column]}</td>)}</tr>)}</tbody></table></div></details></article>)}
        <div className="import-stage-actions"><button type="button" className="import-secondary" onClick={() => setStep('upload')}><ArrowLeft size={16} />{t('import.back')}</button><button type="button" className="import-primary" onClick={() => setStep('map')}>{t('import.confirmMappings')} <ArrowRight size={16} /></button></div>
      </> : null}

      {step === 'map' && preview ? <>
        <div className="import-stage-heading"><p className="eyebrow">03 / {t('import.map')}</p><h2>{t('import.stageMap')}</h2><p>{t('import.mapDescription')}</p></div>
        {preview.files.map((file) => <article className="import-mapping-card" key={file.filename}><h3>{file.filename}</h3><div className="import-mapping-grid"><span>{t('import.sourceColumn')}</span><span>{t('import.field')}</span><span>{t('import.sourceUnit')}</span>{file.columns.map((column) => <div className="import-mapping-row" key={column.source_column}><strong>{column.source_column}</strong><select aria-label={`${column.source_column} ${t('import.field')}`} value={mapping[file.filename]?.semantic_fields[column.source_column] ?? ''} onChange={(event) => setSemanticField(file.filename, column.source_column, event.target.value)}><option value="">{t('import.optionalMetric')}</option>{semanticFields.map((value) => <option key={value} value={value}>{t(`import.${value === 'sog' ? 'speed' : value}`)}</option>)}</select>{column.requires_unit_mapping ? <select aria-label={`${column.source_column} ${t('import.sourceUnit')}`} className={!mapping[file.filename]?.unit_overrides[column.source_column] ? 'is-required' : ''} value={mapping[file.filename]?.unit_overrides[column.source_column] ?? ''} onChange={(event) => setUnit(file.filename, column.source_column, event.target.value)}><option value="">{t('import.selectUnit')}</option>{speedUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select> : <span>{column.detected_unit ?? t('import.notApplicable')}</span>}</div>)}</div></article>)}
        {needsUnitConfirmation ? <Messages heading={t('import.actionRequired')} messages={[t('import.unitRequired')]} tone="error" /> : null}
        <div className="import-stage-actions"><button type="button" className="import-secondary" onClick={() => setStep('detect')}><ArrowLeft size={16} />{t('import.back')}</button><button type="button" className="import-primary" onClick={() => void saveMapping()} disabled={busy || needsUnitConfirmation}>{busy ? <LoaderCircle className="is-spinning" size={16} /> : null}{t('import.validateImport')} <ArrowRight size={16} /></button></div>
      </> : null}

      {step === 'validate' ? <>
        <div className="import-stage-heading"><p className="eyebrow">04 / {t('import.validate')}</p><h2>{t('import.stageValidate')}</h2><p>{t('import.validateDescription')}</p></div>
        {validation ? <><Messages heading={t('import.validationErrors')} messages={validation.errors} tone="error" /><Messages heading={t('import.validationWarnings')} messages={validation.warnings} tone="warning" /><section className="import-validation-summary"><div><strong>{validation.rows_accepted.toLocaleString()}</strong><span>{t('import.acceptedRows')}</span></div><div><strong>{validation.rows_rejected.toLocaleString()}</strong><span>{t('import.rejectedRows')}</span></div><div><strong>{validation.estimated_metrics.join(', ')}</strong><span>{t('import.estimatedAfterImport')}</span></div></section>{validation.errors.length ? <p className="import-help">{t('import.correctMapping')}</p> : <Messages heading={t('import.readyForReview')} messages={[t('import.validationPassed')]} tone="info" />}</> : <div className="import-empty-validation"><LoaderCircle className="is-spinning" size={22} /><p>{t('import.validationNotRun')}</p></div>}
        <div className="import-stage-actions"><button type="button" className="import-secondary" onClick={() => setStep('map')}><ArrowLeft size={16} />{t('import.backToMapping')}</button><button type="button" className="import-primary" onClick={() => void validate()} disabled={busy}>{busy ? <LoaderCircle className="is-spinning" size={16} /> : null}{validation?.errors.length ? t('import.validateAgain') : validation ? t('import.continueReview') : t('import.runValidation')} <ArrowRight size={16} /></button></div>
      </> : null}

      {step === 'review' && validation ? <>
        <div className="import-stage-heading"><p className="eyebrow">05 / {t('import.review')}</p><h2>{t('import.stageReview')}</h2><p>{t('import.reviewDescription')}</p></div>
        <section className="import-review"><label>IMO<input value={imo} onChange={(event) => { setImo(event.target.value); setReplaceConfirmed(false) }} placeholder="IMO1234567" autoComplete="off" /></label><label>{t('import.vesselName')} <small>{t('import.optional')}</small><input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('import.vesselName')} autoComplete="off" /></label></section>
        {replacing ? <label className="import-replace-confirmation"><input type="checkbox" checked={replaceConfirmed} onChange={(event) => setReplaceConfirmed(event.target.checked)} />{t('import.replaceConfirm')}</label> : null}
        <section className="import-review-summary"><div><span>{t('import.validatedRows')}</span><strong>{validation.rows_accepted.toLocaleString()}</strong></div><div><span>{t('import.mode')}</span><strong>{replacing ? t('import.replaceMode') : t('import.createMode')}</strong></div><div><span>{t('import.estimatedMetrics')}</span><strong>{validation.estimated_metrics.join(', ')}</strong></div></section>
        <div className="import-stage-actions"><button type="button" className="import-secondary" onClick={() => setStep('validate')}><ArrowLeft size={16} />{t('import.back')}</button><button type="button" className="import-primary" onClick={() => void commit()} disabled={busy || !imo.trim() || (replacing && !replaceConfirmed)}>{busy ? <LoaderCircle className="is-spinning" size={16} /> : null}{replacing ? t('import.replaceImport') : t('import.commitImport')} <Check size={16} /></button></div>
      </> : null}
    </section>
  </main>
}
