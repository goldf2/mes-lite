import { createPartyRouteHandlers } from '@/modules/configuration/http/party-route-handlers'

const handlers = createPartyRouteHandlers('customer')

export const { GET, POST, PUT, DELETE } = handlers
