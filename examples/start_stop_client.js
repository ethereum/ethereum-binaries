const { ClientManager } = require('../dist/index.js')

const run = async () => {
  const cm = new ClientManager()
  console.log('state 1', await cm.status())
  const clientInfo = await cm.startClient('geth', 'latest', ['--goerli'])
  console.log('state 2', await cm.status())
  const result = await cm.stopClient(clientInfo.id)
  console.log('state 3', await cm.status())
}
run()