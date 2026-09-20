import { useRef, useState } from 'react'
import { commitImport, startImport, validateImport, type ImportValidation } from '../api/client'

type ImportTelemetryProps = { onCommitted: () => void }

export function ImportTelemetry({ onCommitted }: ImportTelemetryProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [sessionId, setSessionId] = useState('')
  const [validation, setValidation] = useState<ImportValidation | null>(null)
  const [imo, setImo] = useState('')
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const upload = async (files: File[]) => {
    if (!files.length) return
    setBusy(true); setMessage('Uploading and inspecting telemetry...'); setValidation(null)
    try {
      const session = await startImport(files)
      setSessionId(session.session_id)
      const result = await validateImport(session.session_id)
      setValidation(result)
      setMessage(result.errors.length ? 'Fix the reported CSV mapping or data issues before importing.' : `${result.rows_accepted} telemetry rows are ready to import.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to import telemetry.') }
    finally { setBusy(false) }
  }
  const commit = async () => {
    if (!sessionId || !imo || validation?.errors.length) return
    setBusy(true)
    try { await commitImport(sessionId, imo, name); setMessage(`Imported ${imo}.`); onCommitted(); setSessionId(''); setValidation(null); setImo(''); setName('') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to commit telemetry.') }
    finally { setBusy(false) }
  }
  return <section className="import-telemetry" aria-label="Import telemetry"><input ref={inputRef} className="sr-only" type="file" accept=".csv,text/csv" multiple onChange={(event) => void upload(Array.from(event.target.files ?? []))} /><button className="import-button" type="button" onClick={() => inputRef.current?.click()} disabled={busy}>{busy ? 'Working...' : 'Choose CSV files'}</button>{message ? <p>{message}</p> : null}{validation?.errors.map((error) => <p className="import-error" key={error}>{error}</p>)}{sessionId && !validation?.errors.length ? <div className="import-commit"><label>IMO<input value={imo} onChange={(event) => setImo(event.target.value)} placeholder="IMO1234567" /></label><label>Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Vessel name" /></label><button type="button" onClick={() => void commit()} disabled={busy || !imo}>Commit telemetry</button></div> : null}</section>
}
