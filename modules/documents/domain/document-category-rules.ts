import type { DocumentCategoryRecord } from '../contracts/work-instruction'

export function normalizeDocumentCategoryName(name: string) {
  return name.trim().replace(/\s+/g, ' ')
}

export function documentCategoryLabel(category: Pick<DocumentCategoryRecord, 'name' | 'parent'>) {
  return category.parent ? `${category.parent.name} / ${category.name}` : category.name
}

export function documentCategoryOptions(categories: DocumentCategoryRecord[]) {
  const roots = categories.filter((category) => !category.parentId)
  const childrenByParent = new Map<string, DocumentCategoryRecord[]>()
  for (const category of categories) {
    if (!category.parentId) continue
    const children = childrenByParent.get(category.parentId) || []
    children.push(category)
    childrenByParent.set(category.parentId, children)
  }
  return roots.flatMap((root) => [
    { value: root.id, label: root.name },
    ...(childrenByParent.get(root.id) || []).map((child) => ({
      value: child.id,
      label: `${root.name} / ${child.name}`,
    })),
  ])
}
