export type ApiError = Error & {
  name: 'ApiError'
  status?: number
  code?: string
}

type ErrorDetail = { code?: unknown; message?: unknown; msg?: unknown }
type ErrorBody = { detail?: unknown }

const fallbackMessage = (status?: number) => status ? `Request failed: ${status}` : 'Something went wrong. Please try again.'

function createApiError(message: string, options: { status?: number; code?: string } = {}): ApiError {
  const error = new Error(message) as ApiError
  error.name = 'ApiError'
  error.status = options.status
  error.code = options.code
  return error
}

function isErrorDetail(value: unknown): value is ErrorDetail {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validationMessage(detail: unknown[]): string | undefined {
  const messages = detail
    .map((entry) => isErrorDetail(entry) && typeof entry.msg === 'string' ? entry.msg : undefined)
    .filter((message): message is string => Boolean(message))
  return messages.length ? messages.join(', ') : undefined
}

/** Converts HTTP responses and arbitrary thrown values into a safe, typed UI error. */
export async function toApiError(error: unknown): Promise<ApiError> {
  if (isApiError(error)) return error

  if (error instanceof Response) {
    const fallback = fallbackMessage(error.status)
    try {
      const body = await error.json() as ErrorBody
      if (isErrorDetail(body.detail)) {
        return createApiError(
          typeof body.detail.message === 'string' ? body.detail.message : fallback,
          { status: error.status, code: typeof body.detail.code === 'string' ? body.detail.code : undefined },
        )
      }
      if (typeof body.detail === 'string') return createApiError(body.detail, { status: error.status })
      if (Array.isArray(body.detail)) return createApiError(validationMessage(body.detail) ?? fallback, { status: error.status })
    } catch {
      // Keep the concise HTTP status when a proxy or server returns non-JSON.
    }
    return createApiError(fallback, { status: error.status })
  }

  if (error instanceof TypeError) {
    return createApiError('Network request failed. Check your connection and try again.', { code: 'network_error' })
  }
  if (error instanceof Error) return createApiError(error.message || fallbackMessage())
  return createApiError(fallbackMessage())
}

/** Synchronous converter for errors already received by UI catch blocks. */
export function asApiError(error: unknown): ApiError {
  if (isApiError(error)) return error
  if (error instanceof TypeError) return createApiError('Network request failed. Check your connection and try again.', { code: 'network_error' })
  if (error instanceof Error) return createApiError(error.message || fallbackMessage())
  return createApiError(fallbackMessage())
}

function isApiError(error: unknown): error is ApiError {
  return error instanceof Error && error.name === 'ApiError'
}
