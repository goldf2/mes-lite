import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma'
import {
  createDocumentCategory,
  deleteDocumentCategory,
  DocumentCategoryError,
  listDocumentCategories,
} from '../lib/document-categories'

async function main() {
  const suffix = Date.now().toString()
  let rootId = ''
  let childId = ''
  let materialId = ''
  let documentId = ''

  try {
    const root = await createDocumentCategory(prisma, { name: `验证指导书-${suffix}` })
    rootId = root.id
    const child = await createDocumentCategory(prisma, {
      name: '机床作业',
      parentId: root.id,
    })
    childId = child.id

    const categories = await listDocumentCategories(prisma)
    const savedChild = categories.find((category) => category.id === child.id)
    assert.equal(savedChild?.parent?.id, root.id)
    assert.equal(savedChild?.parent?.name, root.name)

    await assert.rejects(
      () => createDocumentCategory(prisma, { name: '机床作业', parentId: root.id }),
      (error) => error instanceof DocumentCategoryError && error.status === 409,
    )
    await assert.rejects(
      () => createDocumentCategory(prisma, { name: '三级类别', parentId: child.id }),
      (error) => error instanceof DocumentCategoryError && error.status === 400,
    )

    const material = await prisma.material.create({
      data: {
        code: `VERIFY-DOCUMENT-CATEGORY-${suffix}`,
        name: '产品文档类别验证',
        category: 'FINISHED',
        unit: '件',
        stockUnit: '件',
        valuationUnit: '件',
      },
    })
    materialId = material.id

    const document = await prisma.workInstruction.create({
      data: {
        title: '产品文档类别验证',
        materialId: material.id,
        categoryId: child.id,
        note: '通用备注验证',
      },
      include: { category: { include: { parent: true } } },
    })
    documentId = document.id
    assert.equal(document.category.parent?.id, root.id)
    assert.equal(document.note, '通用备注验证')

    await assert.rejects(
      () => deleteDocumentCategory(prisma, child.id),
      (error) => error instanceof DocumentCategoryError && error.status === 409,
    )
    await assert.rejects(
      () => deleteDocumentCategory(prisma, root.id),
      (error) => error instanceof DocumentCategoryError && error.status === 409,
    )

    await prisma.workInstruction.delete({ where: { id: document.id } })
    documentId = ''
    await prisma.material.delete({ where: { id: material.id } })
    materialId = ''
    await deleteDocumentCategory(prisma, child.id)
    childId = ''
    await deleteDocumentCategory(prisma, root.id)
    rootId = ''

    console.log('产品文档类别验证通过：支持两级配置、同层防重、引用保护，文档使用备注承载通用说明。')
  } finally {
    if (documentId) await prisma.workInstruction.deleteMany({ where: { id: documentId } })
    if (materialId) await prisma.material.deleteMany({ where: { id: materialId } })
    if (childId) await prisma.documentCategory.deleteMany({ where: { id: childId } })
    if (rootId) await prisma.documentCategory.deleteMany({ where: { id: rootId } })
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
