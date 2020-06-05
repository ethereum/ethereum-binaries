const { getClient } = require('../dist/index.js')

const run = async () => {
  const puppeth = await getClient('puppeth')
  await puppeth.start()
  console.log('binary started')
  await puppeth.whenState(log => log.includes('Please specify a network name '))
  await puppeth.input('foobar')
  await puppeth.stop()
}
run()