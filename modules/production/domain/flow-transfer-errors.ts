export class FlowTransferDomainError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message)
    this.name = 'FlowTransferDomainError'
  }
}
const expectedFlowTransferError = /库存|库位|物料|员工|转移|数量/

export async function runFlowTransferDomainOperation<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof FlowTransferDomainError) throw error
    if (error instanceof Error && expectedFlowTransferError.test(error.message)) {
      throw new FlowTransferDomainError(error.message)
    }
    throw error
  }
}
