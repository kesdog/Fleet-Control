import { useEffect, useState } from 'react'

export type Notification = { message: string; tone: 'success' | 'error' }

export function useNotifications() {
  const [notification, setNotification] = useState<Notification | null>(null)

  useEffect(() => {
    if (!notification) return
    const timer = window.setTimeout(() => setNotification(null), 5_000)
    return () => window.clearTimeout(timer)
  }, [notification])

  return { notification, notify: (message: string, tone: Notification['tone']) => setNotification({ message, tone }), dismissNotification: () => setNotification(null) }
}
