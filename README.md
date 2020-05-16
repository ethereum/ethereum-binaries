# Ethereum Binaries

The easiest and safest way to interact with Ethereum clients & binaries or control them from your code.

- [X] 🎁 **Package Extraction**
- [x] 🔐 **Binary Verification**
- [x] ♨️ **Runtime Detection** 🐍
- [X] 🐳 **Docker Support** 
- [X] ⏰ **Lifecycle Events [ IPC_READY | SYNCED | STOPPED ... ]** 
- [x] ☁️ **Auto Update**
- [x] ⚡ **Caching**
- [x] 🐙 **Version Management**
- [x] 🌈 **Multi Client Support**

# 🚀 Fast Start 🚀

## Installation
```shell
npm install -g ethbinary
```

#### Example: Start Geth 
```shell
ethbinary geth@latest --goerli
```


Will download the latest version of geth and start geth with a connection to the goerli testnet:

![Fast Start Gif](r./../img/fast_start.gif?raw=true "Title")


### Need a pre-funded test account?
```shell
npm create eth-test-account
```

### Supported Clients


## Use in CLI

```shell

```

## Use as Module

### Example
```javascript
const { ClientManager } = require('ethbinary')
const cm = new ClientManager()
console.log('state 1', await cm.status()) // { clients: '[]' }
const clientInfo = await cm.startClient('geth', 'latest', ['--goerli'])
console.log('state 2', await cm.status()) // [{"id":"1sLljJfFO9hr43d-","started":1589624226599,"processId":98957,"binaryPath":"/../geth_1.9.14"}]
const result = await cm.stopClient(clientInfo.id)
console.log('state 3', await cm.status())  // { clients: '[]' }
```

### API

#### public async getClientVersions(clientName: string) : Promise<Array<IRelease>>

#### public async getClient(clientName: string, version: string, options?: DownloadOptions) : Promise<binaryPath>

#### public async startClient(clientName: string, version: string, flags?: string[], options?: DownloadOptions) : Promise<ClientInfo>

#### public async stopClient(clientId: string)

## Use with Docker

## Use in CI

