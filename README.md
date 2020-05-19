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

# Supported Clients & Binaries


# Installation
```shell
npm install -g ethbinary
```

# Quickstart 🚀

#### Example: Start Geth 
```shell
ethbinary geth@latest --goerli
```

Will download the latest version of geth and start geth with a connection to the goerli testnet:

![Fast Start Gif](r./../img/fast_start.gif?raw=true "Title")


#### Need a pre-funded test account?
```shell
npm create eth-test-account
```

# Use in CLI

### Overview

```shell
  USAGE

    ethbinary client <subcommand>

  SUBCOMMANDS

    download - Downloads a client   
    exec     - Executes a command on a client      
    list     - Lists the supported clients
    start    - Starts a client 
```

### Start a client

#### Client Specifier Syntax

```shell
ethbinary <client>@<version_tag> <flags>
```

#### Verbose syntax:
```shell
USAGE

  ethbinary client start <client> [version=latest] [...options]

PARAMETERS

  client  - client name   
  version - client version

OPTIONS

  -f, --flags <flags> - client flags
```

### Execute a Command

#### Example Create Account

```shell
ethbinary client exec geth latest "account new"
```

# Use as Module

### Example
```javascript
const { ClientManager } = require('ethbinary')
const cm = new ClientManager()
console.log('state 1', await cm.status()) // { clients: '[]' }
const client = await cm.getClient('geth', 'latest')
await cm.startClient(client, ['--goerli'])
console.log('state 2', await cm.status()) // [{"id":"1sLljJfFO9hr43d-","started":1589624226599,"processId":"98957","binaryPath":"/../geth_1.9.14"}]
const result = await cm.stopClient(client)
console.log('state 3', await cm.status())  // { clients: '[]' }
```

### API

#### ClientInfo

```typescript
interface ClientInfo {
  id: string // generated internal uuid
  type: 'docker' | 'binary'
  state: 'INIT' | 'STARTED' | 'STOPPED' | 'ERROR'
  started: number // timestamp
  stopped: number // timestamp
  binaryPath: string // path to extracted binary, runtime or docker container name
  processId: string // process id for started binaries or container id for docker clients
}
```

#### ClientManager

##### `public async getClientVersions(clientName: string) : Promise<IRelease[]>`

Returns the release list for a client.

##### `public async getClient(clientName: string, version: string, options?: DownloadOptions) : Promise<ClientInfo>`

Uses a cached client, or downloads an updated one / pulls image and returns `ClientInfo`.
If version is `latest` and a newer version than the one on the system exists, it will download the newer version automatically. 
If binary can be extracted from a package it will be extracted and written to `cachePath`.
If the client uses a runtime such as Java it will extract all package contents and `binaryPath` will point to the Java runtime.
If the client is distributed as a docker image `binaryPath` will be set to the name of the existing or generated Docker container.

##### `public async startClient(clientId: string | ClientInfo,, version: string, flags?: string[], options?: DownloadOptions) : Promise<ClientInfo>`
Uses `getClient` internally but also starts a new child process for the client binary.

##### `public async stopClient(clientId: string | ClientInfo,) : Promise<ClientInfo>`
Stops the process(es) and container(s) associated with a client.
Throws if no process is found.

# Use with Docker

### Clients

`ethbinary` supports the execution of dockerized clients i.e. binaries that are distributed as Docker images.
If a dockerized client is started, the `processId` of the `ClientInfo` object returned will be the respective container id.

### Wrapping Binaries

# Use in CI

# Binary Verification

# Extension

Client support is handled through a `ClientConfiguration`.

There are two types of clients: Dockerized and PackagedBinary and each has their own configuration.

### Base Config

```typescript
export interface ClientBaseConfig {
  name: string;
  displayName: string;
  flags?: string[]
}
```

### Packaged Binaries

A `ClientConfiguration` for a `PackagedBinary` client has the form:

```typescript
export interface PackageConfig extends ClientBaseConfig {
  repository: string;
  prefix?: undefined;
  filter?: FilterFunction;
  binaryName?: string;
  publicKey?: string;
}
```

#### repository : `<repo specifier> | url`



#### prefix : `string`

The `prefix` is a server-side executed filter. Usually implemented as string matching on the file's key or path.
AWS S3: https://docs.aws.amazon.com/AmazonS3/latest/dev/ListingKeysHierarchy.html
Azure Blob storage: https://docs.microsoft.com/en-us/rest/api/storageservices/list-blobs#uri-parameters

#### filter : `predicate`

Contrary to `prefix`, `filter` specifies a predicate function that is executed client-side. Note that data, which is filtered out client-side, is unnecessarily transferred.
If this can be avoided by using a `prefix` it should be implemented. 

#### binaryName : `string`

The name or relative path of the binary within the package - e.g. 'geth'.
The name is auto-expanded to geth.exe if necessary.

### Dockerized Clients

Are binaries that are distributed as Docker images.

The configuration for a Dockerized client has the following properties:

```typescript
export interface DockerConfig extends ClientBaseConfig {
  dockerfile: string;
  entryPoint?: string;
  service: boolean;
}
```

#### dockerfile : `path | url`
`path` a new image will be created based on the locally available `Dockerfile`

`url` the image is pulled from the registry

#### entryPoint : `path | 'auto'`

`path` similar to `binaryName`, the `entryPoint` helps to locate the binary inside of the docker container.

`'auto'` ethbinary will try to automatically detect the container's entryPoint based on container metadata.

#### service : `true | false`

`true` the binary specified by `entryPoint` is executed to start the service.

`false` the container is started and waits for the implementing client to issue comands via `execute` on the `entryPoint`

