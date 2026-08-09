import {
  getRegisteredPageDefinition,
  registeredPageDefinitions,
  resolveRegisteredPageKey,
  type PageModuleDefinition,
  type PageModuleKind,
  type PageOpenMode,
  type PageOpenSource,
  type PagePresentationDefinition,
} from './page-registry'

export type {
  PageModuleDefinition,
  PageModuleKind,
  PageOpenMode,
  PageOpenSource,
  PagePresentationDefinition,
} from './page-registry'

const defaultPagePresentation: PagePresentationDefinition = {
  navigation: 'page',
  content: 'dialog',
  command: 'inline',
  allowFullscreen: true,
  allowOpenAsPage: true,
}

export const pageModuleDefinitions: readonly PageModuleDefinition[] = registeredPageDefinitions

export function getPageModuleDefinition(key: string): PageModuleDefinition {
  return getRegisteredPageDefinition(key)
}

export function getPagePresentationDefinition(key: string): PagePresentationDefinition {
  return { ...defaultPagePresentation, ...(getRegisteredPageDefinition(key).presentation || {}) }
}

export function resolvePageOpenMode(key: string, source: PageOpenSource): PageOpenMode {
  return getPagePresentationDefinition(key)[source]
}

export function resolvePageModuleKey(tab: string, materialSection?: string) {
  return resolveRegisteredPageKey(tab, materialSection)
}
