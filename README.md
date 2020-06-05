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

<table>
  <tbody>
    <tr>
      <td align="center" valign="top">
        <img align="center" height="100" src="https://geth.ethereum.org/static/images/mascot.png" alt="geth logo">
        <br>
        <a href="https://geth.ethereum.org/">Geth</a>
      </td>
      <td align="center" valign="top">
        <img align="center" height="100" src="https://prylabs.net/assets/stripedprysm.svg" alt="prysm logo">
        <br>
        <a href="https://prysmaticlabs.com/">Prysm</a>
      </td>
        <td align="center" valign="top">
        <img align="center" height="100" src="https://avatars0.githubusercontent.com/u/32980830?s=280&v=4" alt="puppeth logo">
        <br>
        <a href="https://github.com/puppeth">Puppeth</a>
      </td>
      </td>
        <td align="center" valign="top">
        <img align="center" height="100" src="https://camo.githubusercontent.com/0f1377ae214406b57e0743067901098502e01d3c/687474703a2f2f7777772e726564616b74696f6e2e74752d6265726c696e2e64652f66696c6561646d696e2f66673330382f69636f6e732f70726f6a656b74652f6c6f676f732f5a6f4b72617465735f6c6f676f2e737667" alt="zokrates logo">
        <br>
        <a href="https://github.com/Zokrates/ZoKrates">ZoKrates</a>
      </td>
     </tr>
  </tbody>
</table>

**Supported clients can be referenced by their name and used directly. For all other binaries see  [`Extension`](#extension)**

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
await geth.start('--goerli')
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

# Binary Types

There are different types of binaries / programs that all require different implementation and interaction strategies.
An attempt to classify them based on interactivity might look like this:

### Services

Services or daemons are binaries that are started as background processes. They usually don't require *interaction*.

`geth` for example can be started as a service. Interaction with the service is happening in this case only via the separate HTTP/IPC RPC API or not at all.

**The interaction pattern is:**
```javascript
service.start()
service.whenState(/*rpc ready*/)
// do something with API
service.stop() // optional
```

### Wizards / Assistants / REPL

Wizards are programs that prompt the user interactively for input and perform operations in between those prompts or after they've received a full configuration processing all responses.
read–eval–print loop (REPL) programs fall into this category because they constantly require user input and perform actions only after interaction.

`puppeth` for example is an interactive wizard.

**The interaction pattern is:**

#### Full user-interaction
```javascript
const puppeth = await getClient('puppeth')
await puppeth.start({
  stdio: 'inherit' // pass control to terminal: user interacts via stdin & stdout 
})
```

#### Automation
```javascript
const puppeth = await getClient('puppeth')
await puppeth.start()
await puppeth.whenState(log => log.includes('Please specify a network name ')) // parse logs to determine custom state
await puppeth.input('my-network-name') // write response to stdin
await puppeth.whenState(/*...*/) // wait again
await puppeth.input(/*...*/) // respond again
```

### Servers

Programs that offer functionality via an API to users or other programs are called `servers` for simplicity.
The calling program is called the `client` in the traditional client-server-model. ethbinary takes the `client` role when it is interacting with other programs and performing calls to their API.

The `ZoKrates` compiler is an example for a program that receives a single command, processes it and returns a result.

**The interaction pattern is:**
```javascript
const zokrates = await getClient('zokrates')
fs.writeFileSync(path.join(__dirname, 'test.zok'),   `
def main(private field a, field b) -> (field):
  field result = if a * a == b then 1 else 0 fi
  return result
`)
await zokrates.execute(`compile -i ${SHARED_DATA}/test.zok`) 
await zokrates.execute(`setup`) 
await zokrates.execute('compute-witness -a 337 113569') 
await zokrates.execute('generate-proof') 
await zokrates.execute(`export-verifier`) 
await zokrates.execute(`cp ./verifier.sol ${SHARED_DATA}`, { useBash: true, useEntrypoint: false })
```
Where a sequence of commands ins executed with `.execute`

### Hybrid

Of course, some binaries can implement multiple behaviors and act as a service, execute commands and provide server functionality.

`geth` is such an example:

`geth account new` - issues a command which can also be interactive e.g. ask for password

`geth` will start the service


# Extension

ethbinary was created with extension in mind.
If your client is not (yet) supported, chances are good you can still make use of this module and benefit from all of its helpers:

Some ad-hoc integrations will just magically work out of the box (more likely, if your project follows best practices).

Some integrations require a little extra work.

This is an example how a GitHub hosted binary can be added on the fly in case it's not available:

```typescript
const cm = new SingleClientManager()
const clientConfig = { 
  name: 'prysm.validator', 
  repository: 'https://github.com/prysmaticlabs/prysm', 
  isPackaged: false,
  filter: ({ fileName }) => fileName.includes('validator')
}
const validator = await cm.getClient(clientConfig, {
  version: '1.0.0-alpha.6',
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
// we will now get all release assets from the prysm github repository, ordered by latest version
const versions = await cm.getClientVersions({
  packagesOnly: false // prysm binaries are not packaged => return raw assets
})

// prysm assets contain .sig, .sha256, .exe files among other things
// if we want the latest binary we can just search e.g. for the first file with .exe or no extension 
// but let's say there is a bug in the .beta.8 so we search for .beta.6
const latest = versions.find(release => {
  const ext = getFileExtension(release.fileName)
  const hasBinaryExtension = (ext === undefined || ext === '.exe')
  return hasBinaryExtension && release.fileName.includes('validator') && release.version === '1.0.0-alpha.6'
})

// here, we could check our cache if the binary already exists...
const clientPath = `path/to/${latest.fileName}`

// to keep our dependency footprint small we can use the re-exported ethpkg module
// which is the package manager used internally by ethbinary to manage (find, download, extract, verify...) assets
const data = await ethpkg.download(latest.location, onProgress)
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

# Events

ethbinary uses a an event listener mechanism to be notified about the different events during binary preparation.
Most of the subroutines have 2-3 event(stage)s: `started`, `progress`, `finished`

An event log for a binary download might look like this:
```javascript
resolve_package_started // api request is made + cache is checked
fetching_release_list_started // api response is processed: json / xml parsing
fetching_release_list_finished // remote releases are merged with cached releases
filter_release_list_started // invalid releases are removed, version + platform info is extracted, custom filter functions are applied
sort_releases_started // releases are sorted by semver version & release date
sort_releases_finished
filter_release_list_finished
resolve_package_finished // the latest release info is available
download_started // the asset for the latest release are downloaded
download_progress
download_finished
extraction_started // the binary is detected inside the package and the binary or all contents are extracted 
extraction_progreess
extraction_finished
```

