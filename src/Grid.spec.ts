import { assert } from 'chai'
import { Grid } from './Grid'

describe('Grid', function(){

  describe('startClient', () => {
    it('does something', async () => {
      const grid = new Grid()
      const releases = await grid.getClientVersions('geth')
      console.log('releases', releases.slice(0, 2))
    })
  })

})