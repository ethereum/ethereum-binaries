import fs from 'fs'
import path from 'path'
import { ClientConfig } from '../types'
const clientFiles = fs.readdirSync(__dirname)

const clients : ClientConfig[] = [
  {
    name: 'prysm.validator', 
    displayName: 'Prysm Validator',
    repository: 'https://github.com/prysmaticlabs/prysm', 
    isPackaged: false,
    filter: ({ fileName } : any) => fileName.includes('validator')
  },
  {
    name: 'prysm.validator',
    displayName: 'Prysm Validator',
    dockerimage: 'gcr.io/prysmaticlabs/prysm/validator',
    ports: ['4000', '13000', '12000/udp'],
  },
  {
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
  },
  {
    name: 'zokrates',
    displayName: 'ZoKrates',
    dockerimage: 'zokrates/zokrates',
    entryPoint: './zokrates'
  }
]

for (const client of clientFiles) {
  if (!client.startsWith('index')) {
    try {
      let config = require('./'+client).default
      clients.push(config)
    } catch (error) {
      
    }
  }
}
export { clients }