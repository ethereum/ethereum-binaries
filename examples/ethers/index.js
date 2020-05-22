const { getClient, CLIENT_STATE } = require('../../dist/index.js')
const ethers = require('ethers')

const runIpc = async () => {
  const geth = await getClient('geth')
  await geth.start(['--goerli'])
  await geth.whenState(CLIENT_STATE.IPC_READY)
  const provider = new ethers.providers.IpcProvider(geth.ipc)
  const network = await provider.getNetwork() // network { name: 'goerli', chainId: 5, ensAddress: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' }
  // send tx, interact with or deploy contracts here...
  await geth.stop()
}

const runRpc = async () => {
  const geth = await getClient('geth')
  // note that --http is new syntax for deprecated --rpc
  await geth.start(['--dev', '--http'])
  await geth.whenState(CLIENT_STATE.HTTP_RPC_READY)
  const provider = new ethers.providers.JsonRpcProvider(geth.rpcUrl)
  const network = await provider.getNetwork() // network { chainId: 1337, name: 'unknown' }
  await geth.stop()
}

runRpc()
