const { getClient } = require('../dist/index.js')

const run = async () => {
  const geth = await getClient('geth')
  await geth.start('--goerli')
  await geth.stop()
}
run()