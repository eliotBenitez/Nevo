import { tableNodes } from 'prosemirror-tables'

function appendStyleAttr(attrs: Record<string, unknown>, snippet: string) {
  const existing = typeof attrs.style === 'string' ? attrs.style : ''
  attrs.style = existing ? `${existing}; ${snippet}` : snippet
}

export const tableNodeSpecs = tableNodes({
  tableGroup: 'block',
  cellContent: 'block+',
  cellAttributes: {
    formula: {
      default: null,
      getFromDOM: (dom) => dom.getAttribute('data-formula'),
      setDOMAttr: (value, attrs) => {
        if (typeof value === 'string' && value) {
          attrs['data-formula'] = value
        }
      },
    },
    align: {
      default: null,
      getFromDOM: (dom) => dom.getAttribute('data-align'),
      setDOMAttr: (value, attrs) => {
        if (typeof value === 'string' && value) {
          attrs['data-align'] = value
          appendStyleAttr(attrs, `text-align:${value}`)
        }
      },
    },
    background: {
      default: null,
      getFromDOM: (dom) => dom.getAttribute('data-background'),
      setDOMAttr: (value, attrs) => {
        if (typeof value === 'string' && value) {
          attrs['data-background'] = value
          appendStyleAttr(attrs, `background-color:${value}`)
        }
      },
    },
    borderColor: {
      default: null,
      getFromDOM: (dom) => dom.getAttribute('data-border-color'),
      setDOMAttr: (value, attrs) => {
        if (typeof value === 'string' && value) {
          attrs['data-border-color'] = value
          appendStyleAttr(attrs, `border-color:${value}`)
        }
      },
    },
    textColor: {
      default: null,
      getFromDOM: (dom) => dom.getAttribute('data-text-color'),
      setDOMAttr: (value, attrs) => {
        if (typeof value === 'string' && value) {
          attrs['data-text-color'] = value
          appendStyleAttr(attrs, `color:${value}`)
        }
      },
    },
    padding: {
      default: null,
      getFromDOM: (dom) => dom.getAttribute('data-padding'),
      setDOMAttr: (value, attrs) => {
        if (typeof value === 'string' && value) {
          attrs['data-padding'] = value
          appendStyleAttr(attrs, `padding:${value}`)
        }
      },
    },
  },
})
