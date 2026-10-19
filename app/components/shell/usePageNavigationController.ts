'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  readPageContinuity,
  writePageContinuity,
  type MaterialSection,
  type TabType,
} from '../../app-navigation'
import type { BomEditorTarget } from './WorkspacePageRendererRegistry'

interface PageNavigationControllerOptions {
  operatorId: string
  allowedTabs: TabType[]
  fallbackTab: TabType
  defaultMaterialSection: MaterialSection
  restorableMaterialSections: MaterialSection[]
  urlMaterialSections: MaterialSection[]
  pageContextKey?: string
  entryTab?: TabType
}

export default function usePageNavigationController({
  operatorId,
  allowedTabs,
  fallbackTab,
  defaultMaterialSection,
  restorableMaterialSections,
  urlMaterialSections,
  pageContextKey,
  entryTab,
}: PageNavigationControllerOptions) {
  const storageKey = `mes-lite.page-continuity.${operatorId}`
  const restoredContinuity = useMemo(() => readPageContinuity(storageKey), [storageKey])
  const restoredTab = restoredContinuity.tab
  const restoredMaterialSection = restoredContinuity.materialSection
  const [tab, setTab] = useState<TabType>(
    entryTab && allowedTabs.includes(entryTab) ? entryTab : restoredTab && allowedTabs.includes(restoredTab) ? restoredTab : fallbackTab,
  )
  const [materialSection, setMaterialSection] = useState<MaterialSection>(
    restoredMaterialSection && restorableMaterialSections.includes(restoredMaterialSection)
      ? restoredMaterialSection
      : defaultMaterialSection,
  )
  const [bomEditorTarget, setBomEditorTarget] = useState<BomEditorTarget | null>(null)
  const [urlReady, setUrlReady] = useState(false)
  const pageContentRef = useRef<HTMLDivElement>(null)
  const urlInitializedRef = useRef(false)
  const scopedBusinessPage = tab === 'businessWorkbench' && Boolean(pageContextKey)
  const businessOverview = scopedBusinessPage && pageContextKey === 'overview'
  const pageLocationKey = tab === 'materials'
    ? `${tab}:${materialSection}`
    : scopedBusinessPage ? `${tab}:${pageContextKey}` : tab

  useEffect(() => {
    if (urlInitializedRef.current) return
    urlInitializedRef.current = true
    const url = new URL(window.location.href)
    const requestedPage = url.searchParams.get('page') as TabType | null
    if (requestedPage && allowedTabs.includes(requestedPage)) setTab(requestedPage)
    if (requestedPage === 'materials') {
      const requestedSection = url.searchParams.get('section') as MaterialSection | null
      if (requestedSection && urlMaterialSections.includes(requestedSection)) {
        setMaterialSection(requestedSection)
      }
    }
    setUrlReady(true)
  }, [allowedTabs, urlMaterialSections])

  useEffect(() => {
    if (!urlReady) return
    const url = new URL(window.location.href)
    const shareablePage = tab === 'create' || tab === 'detail' ? 'orders' : tab
    url.searchParams.set('page', shareablePage)
    url.searchParams.delete('section')
    if (shareablePage !== 'orders' && shareablePage !== 'stocks') {
      url.searchParams.delete('view')
      url.searchParams.delete('q')
    }
    if (shareablePage !== 'orders') url.searchParams.delete('statuses')
    if (shareablePage !== 'stocks') {
      for (const key of ['stockType', 'customer', 'location', 'categories', 'invalid', 'stock']) {
        url.searchParams.delete(key)
      }
    }
    if (shareablePage === 'materials') url.searchParams.set('section', materialSection)
    window.history.replaceState(window.history.state, '', url)
  }, [materialSection, tab, urlReady])

  useEffect(() => {
    writePageContinuity(storageKey, { tab, materialSection })
  }, [materialSection, storageKey, tab])

  useEffect(() => {
    const content = pageContentRef.current
    if (!content) return

    const positions = readPageContinuity(storageKey).scrollPositions
    const saved = positions?.[pageLocationKey] || (businessOverview ? positions?.businessWorkbench : undefined)
    const restoreTarget = saved || (scopedBusinessPage ? { contentTop: 0, windowTop: 0 } : undefined)
    const targetCheckpoint = restoreTarget ? {
      contentTop: Number.isFinite(Number(restoreTarget.contentTop)) ? Math.max(0, Number(restoreTarget.contentTop)) : 0,
      windowTop: Number.isFinite(Number(restoreTarget.windowTop)) ? Math.max(0, Number(restoreTarget.windowTop)) : 0,
    } : undefined
    let restoring = false
    let settling = scopedBusinessPage
    let userMoved = false
    let saveFrame = 0
    let restoreCompleteFrame = 0
    let latestCheckpoint = {
      contentTop: content.scrollTop,
      windowTop: window.scrollY,
    }

    const saveCheckpoint = () => {
      const current = readPageContinuity(storageKey)
      writePageContinuity(storageKey, {
        scrollPositions: {
          ...(current.scrollPositions || {}),
          [pageLocationKey]: latestCheckpoint,
        },
      })
    }
    const scheduleSave = () => {
      if (restoring || settling) return
      latestCheckpoint = {
        contentTop: content.scrollTop,
        windowTop: window.scrollY,
      }
      if (saveFrame) return
      saveFrame = window.requestAnimationFrame(() => {
        saveFrame = 0
        saveCheckpoint()
      })
    }
    const saveBeforePageHide = () => {
      if (scopedBusinessPage && (settling || restoring) && targetCheckpoint) {
        latestCheckpoint = targetCheckpoint
        saveCheckpoint()
        return
      }
      latestCheckpoint = {
        contentTop: content.scrollTop,
        windowTop: window.scrollY,
      }
      saveCheckpoint()
    }
    const markUserMoved = () => {
      if (scopedBusinessPage) {
        settling = false
        restoring = false
      }
      if (!restoring) userMoved = true
    }
    const restoreCheckpoint = () => {
      if (!targetCheckpoint || userMoved) return
      restoring = true
      const { contentTop, windowTop } = targetCheckpoint
      content.scrollTop = contentTop
      window.scrollTo({ top: windowTop, behavior: 'auto' })
      latestCheckpoint = { contentTop, windowTop }
      if (restoreCompleteFrame) window.cancelAnimationFrame(restoreCompleteFrame)
      restoreCompleteFrame = window.requestAnimationFrame(() => {
        restoreCompleteFrame = 0
        restoring = false
        if (scopedBusinessPage && !settling) saveCheckpoint()
      })
    }

    content.addEventListener('scroll', scheduleSave, { passive: true })
    content.addEventListener('wheel', markUserMoved, { passive: true })
    content.addEventListener('touchstart', markUserMoved, { passive: true })
    window.addEventListener('scroll', scheduleSave, { passive: true })
    window.addEventListener('wheel', markUserMoved, { passive: true })
    window.addEventListener('touchstart', markUserMoved, { passive: true })
    window.addEventListener('pagehide', saveBeforePageHide)

    const firstRestoreFrame = window.requestAnimationFrame(restoreCheckpoint)
    const delayedRestore = window.setTimeout(() => {
      settling = false
      restoreCheckpoint()
    }, 500)
    return () => {
      if (saveFrame) saveCheckpoint()
      window.cancelAnimationFrame(firstRestoreFrame)
      if (restoreCompleteFrame) window.cancelAnimationFrame(restoreCompleteFrame)
      if (saveFrame) window.cancelAnimationFrame(saveFrame)
      window.clearTimeout(delayedRestore)
      content.removeEventListener('scroll', scheduleSave)
      content.removeEventListener('wheel', markUserMoved)
      content.removeEventListener('touchstart', markUserMoved)
      window.removeEventListener('scroll', scheduleSave)
      window.removeEventListener('wheel', markUserMoved)
      window.removeEventListener('touchstart', markUserMoved)
      window.removeEventListener('pagehide', saveBeforePageHide)
    }
  }, [businessOverview, pageLocationKey, scopedBusinessPage, storageKey])

  const openBomEditor = useCallback((materialId: string, bomId?: string) => {
    setBomEditorTarget({ materialId, bomId, requestId: Date.now() })
    setMaterialSection('bomWorkspace')
    setTab('materials')
  }, [])

  const clearBomEditorTarget = useCallback(() => setBomEditorTarget(null), [])

  return {
    tab,
    setTab,
    materialSection,
    setMaterialSection,
    bomEditorTarget,
    openBomEditor,
    clearBomEditorTarget,
    pageContentRef,
    pageLocationKey,
  }
}
