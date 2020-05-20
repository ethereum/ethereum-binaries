import { assert } from 'chai'
import { MultiClientManager as ClientManager } from './index'

describe('ClientManager', function() {
  this.timeout(60 * 1000)

  describe('stopClient', () => {
    it('stops running binaries', async () => {
      const cm = ClientManager.getInstance()
      assert.lengthOf((await cm.status()).clients, 0)
      const client = await cm.getClient('geth')
      await cm.startClient(client)
      assert.lengthOf((await cm.status()).clients, 1)
      await cm.stopClient(client)
      assert.notEqual((await cm.status()).clients[0].stopped, 0)
    })
    it.skip('stops running docker clients', async () => {
      const cm = ClientManager.getInstance()
      assert.lengthOf((await cm.status()).clients, 0)
      const client = await cm.getClient('prysm')
      await cm.startClient(client)
      assert.lengthOf((await cm.status()).clients, 1)
      await cm.stopClient(client)
      assert.notEqual((await cm.status()).clients[0].stopped, 0)
    })
  })

})