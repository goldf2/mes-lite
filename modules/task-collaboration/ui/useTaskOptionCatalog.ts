'use client'

import { type Dispatch, type SetStateAction, useCallback, useState } from 'react'
import { fetchTaskOptions } from '../client/task-collaboration-api'
import type {
  ResolvedTaskPermissions,
  TaskOptionItem,
  TaskOptionType,
  TaskRecord,
} from '../contracts/task-collaboration'
import { mergeOptionItems, seedOptionsFromTask } from '../model/task-collaboration-view'

export function useTaskOptionCatalog(permissions: ResolvedTaskPermissions) {
  const [materialOptions, setMaterialOptions] = useState<TaskOptionItem[]>([])
  const [employeeOptions, setEmployeeOptions] = useState<TaskOptionItem[]>([])
  const [supplierOptions, setSupplierOptions] = useState<TaskOptionItem[]>([])
  const [orderOptions, setOrderOptions] = useState<TaskOptionItem[]>([])
  const [salesOrderOptions, setSalesOrderOptions] = useState<TaskOptionItem[]>([])
  const [dispatchOptions, setDispatchOptions] = useState<TaskOptionItem[]>([])
  const [workCenterOptions, setWorkCenterOptions] = useState<TaskOptionItem[]>([])
  const [fileOptions, setFileOptions] = useState<TaskOptionItem[]>([])

  const searchOptionsByType = useCallback(
    async (type: TaskOptionType, searchKeyword = '', taskId?: string) => {
      const canQueryByType: Record<TaskOptionType, boolean> = {
        materials: permissions.canReadMaterials,
        employees: permissions.canReadEmployees,
        suppliers: permissions.canReadSuppliers,
        orders: permissions.canReadOrders,
        salesOrders: permissions.canReadSalesOrders,
        dispatches: permissions.canReadDispatches,
        workCenters: permissions.canReadWorkCenters,
        files: permissions.canReadAttachments,
      }
      if (!canQueryByType[type]) return
      try {
        const fetched = await fetchTaskOptions({
          type,
          keyword: searchKeyword,
          taskId,
        })
        const setterByType: Record<TaskOptionType, Dispatch<SetStateAction<TaskOptionItem[]>>> = {
          materials: setMaterialOptions,
          employees: setEmployeeOptions,
          suppliers: setSupplierOptions,
          orders: setOrderOptions,
          salesOrders: setSalesOrderOptions,
          dispatches: setDispatchOptions,
          workCenters: setWorkCenterOptions,
          files: setFileOptions,
        }
        setterByType[type]((current) => mergeOptionItems(current, fetched))
      } catch {
        // 保留当前已加载与已选身份，不清空
      }
    },
    [permissions],
  )

  const primeOptionsForTask = useCallback(
    async (task: TaskRecord | null) => {
      const seeded = seedOptionsFromTask(task)
      setMaterialOptions((cur) => mergeOptionItems(cur, seeded.materials))
      setEmployeeOptions((cur) => mergeOptionItems(cur, seeded.employees))
      setSupplierOptions((cur) => mergeOptionItems(cur, seeded.suppliers))
      setOrderOptions((cur) => mergeOptionItems(cur, seeded.orders))
      setSalesOrderOptions((cur) => mergeOptionItems(cur, seeded.salesOrders))
      setDispatchOptions((cur) => mergeOptionItems(cur, seeded.dispatches))
      setWorkCenterOptions((cur) => mergeOptionItems(cur, seeded.workCenters))
      setFileOptions((cur) => mergeOptionItems(cur, seeded.files))

      await Promise.all([
        searchOptionsByType('materials', ''),
        searchOptionsByType('employees', ''),
        searchOptionsByType('suppliers', ''),
        searchOptionsByType('orders', ''),
        searchOptionsByType('salesOrders', ''),
        searchOptionsByType('dispatches', ''),
        searchOptionsByType('workCenters', ''),
        task?.id ? searchOptionsByType('files', '', task.id) : Promise.resolve(),
      ])
    },
    [searchOptionsByType],
  )

  return {
    materialOptions,
    employeeOptions,
    supplierOptions,
    orderOptions,
    salesOrderOptions,
    dispatchOptions,
    workCenterOptions,
    fileOptions,
    searchOptionsByType,
    primeOptionsForTask,
  }
}
