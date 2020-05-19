const { ClientManager } = require('../dist/index.js')

const run = async () => {
  const cm = new ClientManager()
  const client = await cm.getClient('geth', 'latest')
  const result = await cm.execute(client, 'account new', {
    timeout: 20 * 1000, // user has 20 seonds to enter password
    stdio: 'inherit' // NOTE: without 'inherit' "account new" will expect stdin input for password and will always time out
  })
  console.log('result', result)
}
run()