const { SingleClientManager } = require('../dist/index.js')

const run = async () => {
  const cm = new SingleClientManager()
  const client = await cm.getClient('geth')
  const result = await cm.execute('account new', {
    timeout: 20 * 1000, // user has 20 seonds to enter password
    stdio: 'inherit' // NOTE: without 'inherit' "account new" will expect stdin input for password and will always time out
  })
  console.log('result', result)
}
run()