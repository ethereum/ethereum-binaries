const puppeth_config = {
  name: 'puppeth',
  displayName: 'Puppeth',
  repository: 'azure:gethstore',
  filter: {
    name: {
      excludes: ['unstable', 'swarm', 'mips', 'arm']
    }
  },
  prefix: `geth-alltools`,
  binaryName: 'puppeth',
}

export default puppeth_config