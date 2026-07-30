import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma'
import { sortByNaturalText } from '../lib/natural-sort'
import {
  getSystemSettings,
  NATURAL_MATERIAL_CODE_SORT_KEY,
  updateSystemSettings,
} from '../lib/system-settings'

async function main() {
  const existing = await prisma.systemSetting.findUnique({
    where: { key: NATURAL_MATERIAL_CODE_SORT_KEY },
  })

  try {
    const numericCodes = sortByNaturalText(
      [{ code: '12' }, { code: '2' }],
      (item) => item.code,
      'asc',
    )
    assert.deepEqual(numericCodes.map((item) => item.code), ['2', '12'])

    const mixedCodes = sortByNaturalText(
      [{ code: 'A10' }, { code: 'A2' }],
      (item) => item.code,
      'asc',
    )
    assert.deepEqual(mixedCodes.map((item) => item.code), ['A2', 'A10'])

    const descendingCodes = sortByNaturalText(
      [{ code: '12' }, { code: '2' }],
      (item) => item.code,
      'desc',
    )
    assert.deepEqual(descendingCodes.map((item) => item.code), ['12', '2'])

    const firstPage = sortByNaturalText(
      [{ code: '12' }, { code: '3' }, { code: '2' }],
      (item) => item.code,
      'asc',
    ).slice(0, 2)
    assert.deepEqual(firstPage.map((item) => item.code), ['2', '3'])

    await updateSystemSettings({ naturalMaterialCodeSortEnabled: true })
    assert.equal((await getSystemSettings()).naturalMaterialCodeSortEnabled, true)

    await updateSystemSettings({ naturalMaterialCodeSortEnabled: false })
    assert.equal((await getSystemSettings()).naturalMaterialCodeSortEnabled, false)

    console.log('数字自然排序验证通过：2 < 12、A2 < A10，分页前排序且系统开关可持久化。')
  } finally {
    if (existing) {
      await prisma.systemSetting.update({
        where: { key: NATURAL_MATERIAL_CODE_SORT_KEY },
        data: { value: existing.value },
      })
    } else {
      await prisma.systemSetting.deleteMany({
        where: { key: NATURAL_MATERIAL_CODE_SORT_KEY },
      })
    }
    await prisma.$disconnect()
  }
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
