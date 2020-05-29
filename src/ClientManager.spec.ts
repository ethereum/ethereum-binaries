import { assert } from 'chai'
import { MultiClientManager as ClientManager } from './index'

describe('ClientManager', function() {
  this.timeout(60 * 1000)

  describe('stopClient', () => {
    it('stops running binaries', async () => {
      const cm = ClientManager.getInstance()
      const client = await cm.getClient('geth')
      await cm.startClient(client)
      await cm.stopClient(client)
    })
    it.skip('stops running docker clients', async () => {
      const cm = ClientManager.getInstance()
      const client = await cm.getClient('prysm')
      await cm.startClient(client)
      await cm.stopClient(client)
    })
  })

})