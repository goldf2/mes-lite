const MAX_CONTENT_JSON_LENGTH = 1_000_000

export class DocumentContentValidationError extends Error {}

export const EMPTY_DOCUMENT_JSON = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph' }],
})

type DocumentNode = {
  type?: unknown
  text?: unknown
  content?: unknown
}

function collectText(node: unknown, output: string[]) {
  if (!node || typeof node !== 'object') return

  const documentNode = node as DocumentNode
  if (typeof documentNode.text === 'string') output.push(documentNode.text)
  if (!Array.isArray(documentNode.content)) return

  for (const child of documentNode.content) collectText(child, output)
  if (documentNode.type === 'paragraph' || documentNode.type === 'heading' || documentNode.type === 'listItem') {
    output.push('\n')
  }
}

export function normalizeDocumentContent(contentJson?: string | null) {
  const source = contentJson?.trim()
  if (!source) return { contentJson: null, contentText: null }
  if (source.length > MAX_CONTENT_JSON_LENGTH) throw new DocumentContentValidationError('在线正文不能超过 1 MB')

  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    throw new DocumentContentValidationError('在线正文格式无效')
  }

  if (!parsed || typeof parsed !== 'object' || (parsed as DocumentNode).type !== 'doc') {
    throw new DocumentContentValidationError('在线正文格式无效')
  }

  const output: string[] = []
  collectText(parsed, output)
  const contentText = output.join('').replace(/\n{3,}/g, '\n\n').trim()

  return {
    contentJson: JSON.stringify(parsed),
    contentText: contentText || null,
  }
}
