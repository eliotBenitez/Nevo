type Translate = (key: string) => string

export function formatHistoryTimestamp(value: string, locale: string, t: Translate): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date)

  if (isSameCalendarDay(date, now)) return `${t('workspace.history.timeline.today')} ${time}`
  if (isSameCalendarDay(date, yesterday)) return `${t('workspace.history.timeline.yesterday')} ${time}`

  const calendarDate = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  }).format(date)
  return `${calendarDate} ${time}`
}

function isSameCalendarDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
}
