/**
 * Date field the calendar should show: keeps a still-valid choice, picks the
 * only date field automatically, and otherwise leaves the choice to the user.
 */
export function resolveCalendarDateField(fieldIds: readonly string[], currentId: string): string {
  if (fieldIds.includes(currentId)) return currentId
  return fieldIds.length === 1 ? fieldIds[0] : ''
}
