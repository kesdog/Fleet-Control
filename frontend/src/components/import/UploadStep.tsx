import { ArrowRight, FileUp, LoaderCircle, Upload } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

type UploadStepProps = { files: File[]; busy: boolean; onSelectFiles: (files: File[]) => void; onUpload: () => void }

export function UploadStep({ files, busy, onSelectFiles, onUpload }: UploadStepProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const select = (next: FileList | File[]) => onSelectFiles(Array.from(next))
  return <><div className="import-stage-heading"><h2>{t('import.stageUpload')}</h2><p>{t('import.uploadDescription')}</p></div><input ref={inputRef} className="sr-only" type="file" accept=".csv,text/csv" multiple aria-label={t('import.chooseFiles')} onChange={(event) => select(event.target.files ?? [])} /><button type="button" className="import-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); select(event.dataTransfer.files) }}><Upload size={28} aria-hidden="true" /><strong>{t('import.chooseFiles')}</strong><span>{t('import.fileHint')}</span></button>{files.length ? <ul className="import-file-list">{files.map((file) => <li key={`${file.name}-${file.size}`}><FileUp size={16} aria-hidden="true" /><span>{file.name}</span><small>{Math.ceil(file.size / 1024)} KB</small></li>)}</ul> : null}<div className="import-stage-actions"><span /><button type="button" className="import-primary" onClick={onUpload} disabled={!files.length || busy}>{busy ? <LoaderCircle className="is-spinning" size={16} /> : null}{t('import.inspect')} <ArrowRight size={16} /></button></div></>
}
