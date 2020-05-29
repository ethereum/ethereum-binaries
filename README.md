<p align="center">
  <a href="https://circleci.com/gh/PhilippLgh/ethereum-binaries"><img src="https://img.shields.io/circleci/project/github/PhilippLgh/ethereum-binaries/master.svg" alt="Build Status"></a>
  <a href="https://npmcharts.com/compare/ethbinary?minimal=true"><img src="https://img.shields.io/npm/dm/ethbinary.svg" alt="Downloads"></a>
  <a href="https://www.npmjs.com/package/ethbinary"><img src="https://img.shields.io/npm/v/ethbinary.svg" alt="Version"></a>
  <a href="https://www.npmjs.com/package/ethbinary"><img src="https://img.shields.io/npm/l/ethbinary.svg" alt="License"></a>
  <br>
</p>

# Ethereum Binaries

Fast, easy and secure Ethereum binary management.

- [X] 🎁 **Package Extraction**
- [x] 🔐 **Binary Verification**
- [x] ♨️ **Runtime Detection** 🐍
- [X] 🐳 **Docker Support** 
- [X] ⏰ **Lifecycle Events [ IPC_READY | SYNCED | STOPPED ... ]** 
- [x] ☁️ **Auto Update**
- [x] ⚡ **Caching**
- [x] 🐙 **Version Management**
- [x] 🌈 **Multi Client Support**

# Docs

Documentation is available at [github.io/ethereum-binaries](https://philipplgh.github.io/ethereum-binaries/#/)

# Supported Clients & Binaries
<p>
  <figure>
    <img align="center" height="100" src="https://geth.ethereum.org/static/images/mascot.png" alt="geth logo">
    <figcaption>Geth</figcaption>
  </figure>
</p>

# Intro

Binaries are an integral part of the Ethereum ecosystem. There are many amazing tools (Clef, ZoKrates, Puppeth, ...) that go even beyond the different client implementations (Geth, Prysm, Besu, Nethermind, ...).
However, managing them can be a very complex task. There are no standards for how binaries are distributed and you might find Docker images, binaries hosted on (GitHub, Azure, Bintray, AWS), or even have to build them from source yourself by installing the respective toolchains first and learning about language specific details.
Moreover, important steps such as binary verification with e.g. GPG are often skipped because it is too complex or inconvenient.
Interacting with these binaries, e.g. from a script file when they are running inside a container creates a whole new set of challenges.
The goal of this library is to create a unified interface to download, configure and interact with Ethereum binaries so that it's more about the `what` and less about `how`.

# Installation
```shell
npm install -g ethbinary
```

# Quickstart 🚀

```shell
ethbinary geth@latest --goerli
```

Will download the latest version of geth and start geth with a connection to the goerli testnet:

![Fast Start Gif](./img/fast_start.gif?raw=true)

# Examples

## CLI
```shell
ethbinary list //example: returns [ 'besu', 'ewasm', 'geth', 'prysm' ]

ethbinary download geth // will display version selector
ethbinary download geth@1.9.10 // short-hand specifier
ethbinary download geth --clientVersion 1.9.10 // equivalent to above syntax

ethbinary exec geth@latest "version" // the command MUST be one string for the parser to work
ethbinary exec geth@latest "account new" // is auto-attached to terminal so that stdin for password works
ethbinary exec geth --clientVersion latest "account new" // verbose syntax

ethbinary start geth // will start latest geth version with mainnet connection (geth default)
ethbinary start geth --goerli
ethbinary start geth@1.9.10 --goerli
```

## Module
### Minimal Start / Stop

```javascript
const { getClient } = require('ethbinary')
const geth = await getClient('geth')
await geth.start()
await geth.stop()
```

### ethers + ethbinary = ❤️

#### Ipc Provider

```javascript
const { getClient, CLIENT_STATE  } = require('ethbinary')
const ethers = require('ethers')

const geth = await getClient('geth')
await geth.start(['--goerli'])
await geth.whenState(CLIENT_STATE.IPC_READY)
const provider = new ethers.providers.IpcProvider(geth.ipc)
const network = await provider.getNetwork() // network { name: 'goerli', chainId: 5, ensAddress: '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' }
// send tx, interact with or deploy contracts here...
await geth.stop()
```

#### HTTP RPC Server

```javascript
const geth = await getClient('geth')
// note that --http is new syntax for deprecated --rpc
await geth.start(['--dev', '--http'])
await geth.whenState(CLIENT_STATE.HTTP_RPC_READY)
const provider = new ethers.providers.JsonRpcProvider(geth.rpcUrl)
const network = await provider.getNetwork() // network { chainId: 1337, name: 'unknown' }
await geth.stop()
```

### Multi Client API

```javascript
const { default: cm } = require('ethbinary') // get the client manager instance
const clientId = await cm.getClient('geth')
await cm.startClient(clientId, 'latest', ['--goerli'])
await cm.stopClient(clientId)
```

### More Examples

check out the other [examples](./examples)

# Extension

ethbinary was created with extension in mind.
If your client is not (yet) supported, chances are good you can still make use of this module and benefit from all of its helpers:
Some ad-hoc integrations will just magically work out of the box (more likely, if your project follows best practices).
Some integrations require a little extra work.

This is an example how a raw binary can be added on the fly in case it's not available:

```typescript
const cm = new SingleClientManager()
const clientConfig = { name: 'prysm.validator', repository: 'https://github.com/prysmaticlabs/prysm', filter: ({ fileName }) => fileName.includes('validator') }
const validator = await cm.getClient(clientConfig, {
  version: '1.0.0-alpha.6',
  isPackaged: false,
})
```

This is the same example, written in a rather verbose but detailed style (e.g. during development):

```typescript
const cm = new SingleClientManager()

// let's assume prysm is not supported..
// we add a new (minimal) config first 
// see docs or ./client-plugins for available configurations and properties
cm.addClientConfig({
  name: 'prysm.validator',
  repository: 'github:prysmaticlabs/prysm' // or 'https://github.com/prysmaticlabs/prysm'
  // dockerimage: 'gcr.io/prysmaticlabs/prysm/validator', // <= if it's a dockerized client
})

// now, we can already use methods like getClient, getClientVersions etc..
// most of the time we are done here. but let's try a manual integration
// prysm binaries are not packaged, but uploaded as raw binaries
// we opt-out of the packaged binary flow with `packagesOnly: false` and take care of release assets ourselves
// we will now get all release assets from the prysm github repository, ordered by latest version (if this information can be extracted)
const versions = await cm.getClientVersions({
  packagesOnly: false // prysm binaries are not packaged => return raw assets
})

// prysm assets contain .sig, .sha256, .exe files among other things
// if we want the latest binary we can just search e.g. for the first file with .exe or no extension 
// but let's pretend there is a bug in the .beta.8 so we search for .beta.6
const latest = versions.find(release => {
  const ext = getFileExtension(release.fileName)
  const hasBinaryExtension = (ext === undefined || ext === '.exe')
  return hasBinaryExtension && release.fileName.includes('validator') && release.version === '1.0.0-alpha.6'
})

// here, we could check our cache if the binary already exists...
const clientPath = `path/to/${latest.fileName}`

// to keep our dependency footprint small we can use the re-exported ethpkg module
// which is the package manager used internally by ethbinary to manage (find, download, extract, verify...) assets
const data = await ethpkg.download(_url, onProgress)
fs.writeFileSync(clientPath, data, {
  mode: parseInt('754', 8) // make sure binary is executable
})

// almost done: we create a client instance based on the binary 
const validator = await cm.getBinaryClient(clientPath)

// that's it - we can now interact with a lifecycle managed binary :tada: 
const version = await validator.execute(`--version`)
const result = await validator.execute(`accounts create -keystore-path "${__dirname}" --password="${password}"`)
// ...

```
