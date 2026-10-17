import type { BlockNode } from '../../types/note'
import { renderMermaidToSvg } from './mermaidToSvg'
import { renderMarkmapToExportSvg } from './markmapToSvg'
import { renderVegaToSvg } from './vegaToSvg'
import { renderMathToSvg } from './mathToSvg'

type SvgSourceNode = Pick<BlockNode, 'type' | 'attrs' | 'content'>

export function mathBlockLatex(node: SvgSourceNode): string {
  return String(node.attrs?.latex ?? (node.content ?? []).map(c => c.text ?? '').join(''))
}

/** Renders diagram/math nodes to SVG markup; shared by the DOCX serializer and its preview. */
export async function renderBlockSvg(node: SvgSourceNode): Promise<string | null> {
  switch (node.type) {
    case 'mermaid_block':
      return renderMermaidToSvg(String(node.attrs?.code ?? ''))
    case 'markmap_block':
      return renderMarkmapToExportSvg(String(node.attrs?.markdown ?? ''))
    case 'vega_block':
      return renderVegaToSvg(String(node.attrs?.spec ?? ''))
    case 'math_block':
      return renderMathToSvg(mathBlockLatex(node), true)
    case 'math_inline':
      return renderMathToSvg(String(node.attrs?.latex ?? ''), false)
    default:
      return null
  }
}
