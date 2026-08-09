import { prisma } from '@/lib/prisma'
import type { ParsedCreateScanSessionInput, ParsedRecordScanEventInput } from '../contracts/scan-print'
import { ScanPrintServiceError } from '../domain/scan-print-errors'
import { classifyScan, normalizeScanCode, scanCountCompletionError, scanSessionNumber } from '../domain/scanning'
import { scanSessionInclude } from './scan-print-select'

export async function createScanSession(input: ParsedCreateScanSessionInput, createdBy: string | null) {
  const existing = await prisma.scanCountSession.findUnique({
    where: { clientRequestId: input.clientRequestId },
    include: scanSessionInclude,
  })
  if (existing) return existing
  const expectedCode = normalizeScanCode(input.expectedCode)
  return prisma.scanCountSession.upsert({
    where: { clientRequestId: input.clientRequestId },
    create: {
      sessionNo: scanSessionNumber(),
      clientRequestId: input.clientRequestId,
      name: input.name || null,
      purpose: input.purpose,
      referenceType: input.referenceType,
      referenceId: input.referenceId || expectedCode,
      expectedCode,
      expectedQty: input.expectedQty,
      scannerModel: input.scannerModel?.trim() || 'Honeywell Xenon 1900',
      createdBy,
    },
    update: {},
    include: scanSessionInclude,
  })
}

export async function recordScanEvent(sessionId: string, input: ParsedRecordScanEventInput) {
  return prisma.$transaction(async (tx) => {
    const existingEvent = await tx.scanCountEvent.findUnique({ where: { clientEventId: input.clientEventId } })
    if (existingEvent) {
      if (existingEvent.sessionId !== sessionId) throw new ScanPrintServiceError('扫码请求标识已被其他会话使用', 409)
      const existingSession = await tx.scanCountSession.findUniqueOrThrow({
        where: { id: existingEvent.sessionId }, include: scanSessionInclude,
      })
      return { data: existingSession, scanResult: existingEvent.result }
    }

    const session = await tx.scanCountSession.findUnique({ where: { id: sessionId } })
    if (!session) throw new ScanPrintServiceError('扫码会话不存在', 404)
    if (session.status !== 'OPEN') throw new ScanPrintServiceError('扫码会话已结束', 409)
    const classification = classifyScan({
      rawValue: input.rawValue,
      expectedCode: session.expectedCode,
      countedQty: session.countedQty,
      expectedQty: session.expectedQty,
      quantity: input.quantity,
    })
    await tx.scanCountEvent.create({
      data: {
        sessionId: session.id, clientEventId: input.clientEventId, rawValue: input.rawValue,
        code: classification.code, quantity: input.quantity, result: classification.result,
      },
    })
    const updated = classification.result === 'MATCHED'
      ? await tx.scanCountSession.update({
          where: { id: session.id }, data: { countedQty: { increment: input.quantity } }, include: scanSessionInclude,
        })
      : await tx.scanCountSession.findUniqueOrThrow({ where: { id: session.id }, include: scanSessionInclude })
    return { data: updated, scanResult: classification.result }
  })
}

export async function undoLastMatchedScan(sessionId: string) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.scanCountSession.findUnique({ where: { id: sessionId } })
    if (!session) throw new ScanPrintServiceError('扫码会话不存在', 404)
    if (session.status !== 'OPEN') throw new ScanPrintServiceError('扫码会话已结束', 409)
    const event = await tx.scanCountEvent.findFirst({
      where: { sessionId: session.id, result: 'MATCHED' }, orderBy: { createdAt: 'desc' },
    })
    if (!event) throw new ScanPrintServiceError('没有可撤销的有效扫码', 409)
    await tx.scanCountEvent.delete({ where: { id: event.id } })
    return tx.scanCountSession.update({
      where: { id: session.id },
      data: { countedQty: Math.max(0, session.countedQty - event.quantity) },
      include: scanSessionInclude,
    })
  })
}

export async function completeScanSession(sessionId: string) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.scanCountSession.findUnique({ where: { id: sessionId } })
    if (!before) throw new ScanPrintServiceError('扫码会话不存在', 404)
    if (before.status !== 'OPEN') throw new ScanPrintServiceError('扫码会话已结束', 409)
    const completionError = scanCountCompletionError(before)
    if (completionError) throw new ScanPrintServiceError(completionError, 409)
    const data = await tx.scanCountSession.update({
      where: { id: before.id }, data: { status: 'COMPLETED', completedAt: new Date() }, include: scanSessionInclude,
    })
    return { before, data }
  })
}
