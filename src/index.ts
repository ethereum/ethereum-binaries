import { MultiClientManager, SingleClientManager, getClient, SHARED_DATA } from './ClientManager'
export { SingleClientManager, MultiClientManager, getClient }

export * from './types'
export { CLIENT_STATE } from './Client/BaseClient'

export { PROCESS_EVENTS } from './events'

export * as ethpkg from 'ethpkg'

export { SHARED_DATA }

const instance = MultiClientManager.getInstance()
export default instance
