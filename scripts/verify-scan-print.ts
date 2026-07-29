import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma'
import { classifyScan, normalizeScanCode } from '../lib/scanning'
import { pc310t203Profile } from '../app/components/scan-print/labelProfiles'
import { honeywell1900Profile } from '../app/components/scan-print/scannerAdapter'

async function main() {
  assert.equal(normalizeScanCode(' mat-P12-001\r\n'), 'P12-001')
  assert.deepEqual(classifyScan({
    rawValue: 'P12-001',
    expectedCode: 'MAT-P12-001',
    countedQty: 0,
    expectedQty: 2,
    quantity: 1,
  }), { code: 'P12-001', result: 'MATCHED' })
  assert.equal(classifyScan({
    rawValue: 'OTHER',
    expectedCode: 'P12-001',
    countedQty: 0,
    expectedQty: 2,
    quantity: 1,
  }).result, 'UNKNOWN')
  assert.equal(classifyScan({
    rawValue: 'P12-001',
    expectedCode: 'P12-001',
    countedQty: 2,
    expectedQty: 2,
    quantity: 1,
  }).result, 'OVER')

  assert.equal(pc310t203Profile.canvasWidthDots, 800)
  assert.equal(pc310t203Profile.canvasHeightDots, 1200)
  assert.equal(pc310t203Profile.dpi, 203)
  assert.equal(honeywell1900Profile.inputMode, 'USB HID Keyboard')

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let sessionId = ''
  let printJobId = ''
  try {
    const session = await prisma.scanCountSession.create({
      data: {
        sessionNo: `VERIFY-SC-${suffix}`,
        clientRequestId: `VERIFY-SESSION-${suffix}`,
        name: '自动验证',
        purpose: 'GENERAL_COUNT',
        referenceType: 'GENERAL',
        referenceId: 'VERIFY-CODE',
        expectedCode: 'VERIFY-CODE',
        expectedQty: 2,
        scannerModel: honeywell1900Profile.model,
      },
    })
    sessionId = session.id
    await prisma.scanCountEvent.create({
      data: {
        sessionId,
        clientEventId: `VERIFY-EVENT-${suffix}`,
        rawValue: 'VERIFY-CODE',
        code: 'VERIFY-CODE',
        quantity: 1,
        result: 'MATCHED',
      },
    })
    const counted = await prisma.scanCountSession.update({
      where: { id: sessionId },
      data: { countedQty: { increment: 1 } },
      include: { events: true },
    })
    assert.equal(counted.countedQty, 1)
    assert.equal(counted.events.length, 1)

    const printJob = await prisma.labelPrintJob.create({
      data: {
        jobNo: `VERIFY-LP-${suffix}`,
        clientRequestId: `VERIFY-PRINT-${suffix}`,
        templateType: 'GENERIC_100X150',
        referenceType: 'GENERAL',
        referenceId: 'VERIFY-CODE',
        printerModel: pc310t203Profile.model,
        printerDpi: pc310t203Profile.dpi,
        labelWidthMm: pc310t203Profile.labelWidthMm,
        labelHeightMm: pc310t203Profile.labelHeightMm,
        copies: 1,
        payloadJson: JSON.stringify({ code: 'VERIFY-CODE' }),
      },
    })
    printJobId = printJob.id
    assert.equal(printJob.printerDpi, 203)
    assert.equal(printJob.labelWidthMm, 100)
  } finally {
    if (sessionId) await prisma.scanCountSession.delete({ where: { id: sessionId } }).catch(() => undefined)
    if (printJobId) await prisma.labelPrintJob.delete({ where: { id: printJobId } }).catch(() => undefined)
    await prisma.$disconnect()
  }

  console.log('扫码与标签打印底座验证通过：计数分类、PC310T/Honeywell 1900 配置、数据库记录均符合预期。')
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
