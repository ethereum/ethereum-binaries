import {Command, command, metadata} from 'clime'
import { MultiClientManager as ClientManager } from '../../ClientManager'

@command({
  description: 'Lists the supported clients',
})
export default class extends Command {
  @metadata
  public async execute(){
    const availableClients = await ClientManager.getInstance().getAvailableClients()
    console.log('Supported clients: ', availableClients)
    console.log('\n')
  }
}