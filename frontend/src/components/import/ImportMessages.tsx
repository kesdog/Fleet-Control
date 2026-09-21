import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ImportIssue } from '../../api/client'

type Tone = 'error' | 'warning' | 'info'

export function Messages({ heading, messages, tone }: { heading: string; messages: string[]; tone: Tone }) {
  if (!messages.length) return null
  return <section className={`import-messages is-${tone}`} aria-label={heading}>{tone === 'error' ? <AlertTriangle size={17} aria-hidden="true" /> : null}<div><strong>{heading}</strong><ul>{messages.map((message) => <li key={message}>{message}</li>)}</ul></div></section>
}

export function IssueList({ heading, issues, tone }: { heading: string; issues: ImportIssue[]; tone: Tone }) {
  const { t } = useTranslation()
  if (!issues.length) return null
  return <section className={`import-messages is-${tone}`} aria-label={heading}>{tone === 'error' ? <AlertTriangle size={17} aria-hidden="true" /> : null}<div><strong>{heading}</strong><ul>{issues.map((issue, index) => <li key={`${issue.code}-${issue.row_number}-${index}`}><span className="import-issue-message">{issue.message}</span>{issue.code ? <code className="import-issue-code">{issue.code}</code> : null}{issue.file ? <span className="import-issue-context">{t('import.issueFile')}: {issue.file}</span> : null}{issue.column ? <span className="import-issue-context">{t('import.issueColumn')}: {issue.column}</span> : null}{issue.row_number != null ? <span className="import-issue-context">{t('import.issueRow')}: {issue.row_number}</span> : null}</li>)}</ul></div></section>
}
