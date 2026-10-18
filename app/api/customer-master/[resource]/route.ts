import { customerMasterGet } from '@/modules/configuration/http/customer-master-http'
export const dynamic = 'force-dynamic'
export function GET(request: Request, context: { params: { resource: string } }) { return customerMasterGet(request, context.params.resource) }
