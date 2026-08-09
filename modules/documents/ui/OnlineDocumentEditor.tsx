'use client'

import { useEffect } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { EMPTY_DOCUMENT_JSON } from '@/lib/document-content'

function parseDocument(value?: string | null) {
  try {
    const parsed = value ? JSON.parse(value) : JSON.parse(EMPTY_DOCUMENT_JSON)
    return parsed?.type === 'doc' ? parsed : JSON.parse(EMPTY_DOCUMENT_JSON)
  } catch {
    return JSON.parse(EMPTY_DOCUMENT_JSON)
  }
}

function ToolbarButton({
  active = false,
  disabled = false,
  label,
  onClick,
}: {
  active?: boolean
  disabled?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  )
}

export default function OnlineDocumentEditor({
  value,
  onChange,
  editable = true,
  minHeight = '18rem',
}: {
  value?: string | null
  onChange?: (value: string) => void
  editable?: boolean
  minHeight?: string
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: parseDocument(value),
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'mes-online-document-content outline-none',
        role: editable ? 'textbox' : 'document',
        'aria-label': editable ? '在线正文编辑区' : '在线正文',
        'aria-multiline': editable ? 'true' : 'false',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange?.(JSON.stringify(currentEditor.getJSON()))
    },
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(editable)
    editor.setOptions({
      editorProps: {
        attributes: {
          class: 'mes-online-document-content outline-none',
          role: editable ? 'textbox' : 'document',
          'aria-label': editable ? '在线正文编辑区' : '在线正文',
          'aria-multiline': editable ? 'true' : 'false',
        },
      },
    })
  }, [editable, editor])

  useEffect(() => {
    if (!editor) return
    const next = parseDocument(value)
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) {
      editor.commands.setContent(next, { emitUpdate: false })
    }
  }, [editor, value])

  if (!editor) {
    return <div className="rounded-lg border border-gray-200 bg-gray-50" style={{ minHeight }} />
  }

  return (
    <div className={`overflow-hidden rounded-lg border ${editable ? 'border-blue-200 bg-white' : 'border-gray-200 bg-white'}`}>
      {editable && (
        <div className="flex flex-wrap gap-1.5 border-b border-gray-200 bg-gray-50 p-2">
          <ToolbarButton label="正文" active={editor.isActive('paragraph')} onClick={() => editor.chain().focus().setParagraph().run()} />
          <ToolbarButton label="标题 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
          <ToolbarButton label="标题 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
          <ToolbarButton label="加粗" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
          <ToolbarButton label="斜体" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
          <ToolbarButton label="项目列表" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
          <ToolbarButton label="编号列表" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
          <ToolbarButton label="引用" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
          <ToolbarButton label="代码" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
          <ToolbarButton label="撤销" disabled={!editor.can().chain().focus().undo().run()} onClick={() => editor.chain().focus().undo().run()} />
          <ToolbarButton label="重做" disabled={!editor.can().chain().focus().redo().run()} onClick={() => editor.chain().focus().redo().run()} />
        </div>
      )}
      <div className="px-4 py-3" style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
