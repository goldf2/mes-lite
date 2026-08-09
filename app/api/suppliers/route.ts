import { createPartyRouteHandlers } from '@/modules/configuration/http/party-route-handlers'

const handlers = createPartyRouteHandlers('supplier')

export const { GET, POST, PUT, DELETE } = handlers
