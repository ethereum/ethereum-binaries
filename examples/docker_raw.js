const { default: ClientManager } = require('../dist/index.js')

const run = async () => {

  ClientManager.addClientConfig({
    name: 'nodejs',
    displayName: 'Node.js',
    dockerimage: 'node:10',
    entryPoint: 'auto',
    service: false
  })

  const client = await ClientManager.getClient('nodejs', {
    listener: (newState, args) => console.log('new state', newState, args ? args.progress : 0)
  })

  await ClientManager.startClient(client)

  let result
  result = await ClientManager.execute(client, 'ls -la', {
    stdio: 'pipe',
    useBash: true,
    useEntrypoint: false
  })
  console.log('If "pipe" is used for stdio - logs will be returned as array:')
  console.log(result)

  result = await ClientManager.execute(client, 'node -e "console.log(2+2)"', {
    stdio: 'inherit',
    useBash: true,
    useEntrypoint: false
  })

}
run()