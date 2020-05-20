import { MultiClientManager, SingleClientManager } from './ClientManager'
export { SingleClientManager, MultiClientManager }

const instance = MultiClientManager.getInstance()
export default instance