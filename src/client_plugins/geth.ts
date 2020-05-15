const findIpcPathInLogs = (logs: any) => {
  let ipcPath
  for (const logPart of logs) {
    const found = logPart.includes('IPC endpoint opened')
    if (found) {
      ipcPath = logPart.split('=')[1].trim()
      // fix double escaping
      if (ipcPath.includes('\\\\')) {
        ipcPath = ipcPath.replace(/\\\\/g, '\\')
      }
      // console.log('Found IPC path: ', ipcPath)
      return ipcPath
    }
  }
  // console.log('IPC path not found in logs', logs)
  return null
}
let platform = process.platform === 'win32' ? 'windows' : process.platform

const geth_config = {
  type: 'client',
  order: 1,
  displayName: 'Geth',
  name: 'geth',
  repository: 'azure:gethstore',
  // @ts-ignore
  type: 'type:client',
  modifiers: {
    version: ({ version }: any) =>
      version
        .split('-')
        .slice(0, -1)
        .join('-')
  },
  filter: {
    name: {
      includes: [platform],
      excludes: ['unstable', 'alltools', 'swarm', 'mips', 'arm']
    }
  },
  prefix: `geth-${platform}`,
  binaryName: process.platform === 'win32' ? 'geth.exe' : 'geth',
  resolveIpc: (logs: any) => findIpcPathInLogs(logs),
}

export default geth_config