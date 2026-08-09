export class SalesDomainError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message)
  }
}

const expectedSalesError = /客户|物料|库存|库位|出库数量|归档|关联|销售订单|发货数量|退货对象/

export async function runSalesDomainOperation<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof SalesDomainError) throw error
    if (error instanceof Error && expectedSalesError.test(error.message)) {
      throw new SalesDomainError(error.message)
    }
    throw error
  }
}
