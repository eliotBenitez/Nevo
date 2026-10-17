import { definePlugin, transaction, type PluginEditorSnapshot } from '../../src/index'

interface DateCommand {
  id: string
  title: string
  options: Intl.DateTimeFormatOptions
}

const commands: DateCommand[] = [
  { id: 'date-short', title: 'Insert short date', options: { dateStyle: 'short' } },
  { id: 'date-long', title: 'Insert long date', options: { dateStyle: 'long' } },
  { id: 'time-short', title: 'Insert time', options: { timeStyle: 'short' } },
  { id: 'date-time', title: 'Insert date and time', options: { dateStyle: 'medium', timeStyle: 'short' } },
  { id: 'weekday', title: 'Insert weekday', options: { weekday: 'long' } },
  { id: 'month', title: 'Insert month', options: { month: 'long' } },
  { id: 'year', title: 'Insert year', options: { year: 'numeric' } },
  { id: 'iso-date', title: 'Insert ISO date', options: {} },
]

function formatDate(command: DateCommand, editor: PluginEditorSnapshot): string {
  const date = new Date(editor.now)
  if (command.id === 'iso-date') {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: editor.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find(part => part.type === type)?.value ?? ''
    return `${value('year')}-${value('month')}-${value('day')}`
  }
  return new Intl.DateTimeFormat(editor.locale, {
    ...command.options,
    timeZone: editor.timeZone,
  }).format(date)
}

export default definePlugin({
  setup(api) {
    for (const command of commands) {
      api.command({
        id: `${api.pluginId}.${command.id}`,
        title: command.title,
      }, (_input, { editor }) => {
        if (!editor) throw new Error('Quick Date requires an editor invocation')
        return transaction(editor.revision, [{
          type: 'insertText',
          text: formatDate(command, editor),
          from: 'selection.from',
          to: 'selection.to',
        }], { scrollIntoView: true })
      })
      api.slashItem({
        id: `${api.pluginId}.slash-${command.id}`,
        title: command.title,
        category: 'text',
        keywords: ['date', 'time', command.id],
      }, (_input, { editor }) => {
        if (!editor) throw new Error('Quick Date requires an editor invocation')
        return transaction(editor.revision, [{
          type: 'insertText',
          text: formatDate(command, editor),
          from: 'selection.from',
          to: 'selection.to',
        }], { scrollIntoView: true })
      })
    }
  },
})
