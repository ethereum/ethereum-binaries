import { MultiClientManager, SingleClientManager, getClient } from './ClientManager'
export { SingleClientManager, MultiClientManager, getClient }

export * from './types'
export { CLIENT_STATE } from './Client/BaseClient'


const instance = MultiClientManager.getInstance()
export default instance
