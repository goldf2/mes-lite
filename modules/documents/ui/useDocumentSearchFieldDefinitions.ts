'use client'

import { useCallback, useEffect, useState } from 'react'
import { listDocumentFieldDefinitions } from '../client/documents-api'
import type { DocumentFieldDefinitionRecord } from '../contracts/document-field-schema'

export default function useDocumentSearchFieldDefinitions(onMessage: (message: string) => void) {
  const [definitions, setDefinitions] = useState<DocumentFieldDefinitionRecord[]>([])
  const refresh = useCallback(async () => {
    try {
      setDefinitions(await listDocumentFieldDefinitions())
    } catch (error) {
      onMessage(error instanceof Error ? error.message : '获取高级搜索字段失败')
    }
  }, [onMessage])
  useEffect(() => { void refresh() }, [refresh])
  return { definitions, refresh }
}
