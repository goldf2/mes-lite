export interface SopScreenshot {
  baseline: string
  file: string
}

export interface SopWorkflow {
  id: string
  title: string
  objective: string
  steps: string[]
  result: string
  pageKey: string
  resource: string
  roles: string[]
  screenshot: SopScreenshot
  lastVerifiedVersion: string
  screenshotUrl?: string
}

export interface SopChapter {
  id: string
  title: string
  workflows: SopWorkflow[]
}

export interface SopCatalog {
  schemaVersion: number
  version: string
  title: string
  recommendedSequence: string
  important: string
  governanceBoundaries: string[]
  chapters: SopChapter[]
  workflowCount: number
}
