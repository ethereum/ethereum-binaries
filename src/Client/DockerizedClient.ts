import path from 'path'
import { BaseClient, CLIENT_STATE } from "./BaseClient"
import { Container } from "dockerode"
import DockerManager from "../DockerManager"
import { DockerConfig, ClientInfo, ClientStartOptions, CommandOptions, GetClientOptions } from "../types"
import stream, { Stream } from "stream"
import { PROCESS_EVENTS } from "../events"
import logger from '../Logger'

const collectLogs = (stream: Stream, {
  clean = true
} = {}): Promise<string[]> => new Promise((resolve, reject) => {
  const _data: string[] = []
  stream.on('data', (data: any) => {
    // remove all tty non-ascii control chars etc
    if (clean) {
      // console.log('>>', JSON.stringify(data.toString()))
      let printable = data.toString().replace(/[^ -~\r|\n]+/g, "")
      _data.push(printable)
    }
    if (data.toString().includes('runtime exec failed')) {
      reject(new Error('Command failed:\n' + data.toString()))
    }
    // console.log('data', data.toString())
  })
  let isResolved = false
  const _resolve = () => {
    let logs = _data.join().split(/\r|\n/).filter(l => !!l)
    if (!isResolved) {
      isResolved = true
      resolve(logs)
    }
  }
  stream.on('end', _resolve)
  // if a service is started we wait either till timeout or condition: ipc established
  /*
  if (!useBash) {
    setTimeout(_resolve, 3000)
  }
  */
})

export class DockerizedClient extends BaseClient {
  constructor(
    private _container: any,
    private _dockerManager: DockerManager,
    private _config: DockerConfig,
    private _imageName: string
  ) { super() }

  static async create(dockerManager: DockerManager, config: DockerConfig, {
    version,
    listener
  } : GetClientOptions) {
    // lazy init to avoid crashes for non docker functionality
    if (!dockerManager.isConnected()) {
      dockerManager.connect()
    }
    const imageName = await dockerManager.getOrCreateImage(config.name, config.dockerimage, {
      listener
    })
    if (!imageName) {
      throw new Error('Docker image could not be found or created')
    }
    logger.log('image created', imageName)
    // only [a-zA-Z0-9][a-zA-Z0-9_.-] are allowed for container names 
    // but image name can be urls like gcr.io/prysmaticlabs/prysm/validator
    // Date.now() allows to have multiple instances of one image
    // const containerName = `ethbinary_${config.name}_container_${Date.now()}`
    const containerName = `ethbinary_${config.name}_container`
    const container = await dockerManager.createContainer(imageName, containerName, {
      overwrite: true, // overwrite existing container
      dispose: false, // if containers are disposed they cannot be analyzed afterwards, therefore it is better to clean them on start
      overwriteEntrypoint: true, // use shell instead of potentially configured binary
      autoPort: false, // don't map to any port
      // FIXME don't use default ports
      ports: ['8545', '30303', '30303/udp'],
      volume: `${path.resolve(process.cwd())}:/shared_data`
    })
    if (!container) {
      throw new Error('Docker container could not be created')
    }
    return new DockerizedClient(container, dockerManager, config, imageName)
  }

  info(): ClientInfo {
    return {
      id: this.id,
      type: 'docker',
      state: this._state,
      started: this._started,
      stopped: this._stopped,
      ipc: this._ipc,
      rpcUrl: this._rpcUrl,
      processId: this._container.id,
      binaryPath: this._config.entryPoint,
      logs: this._logs
    }
  }

  private async _getEntryPoint() : Promise<string | undefined>{
    const { _config: config, _container: container } = this
    if ('originalEntrypoint' in container) {
      // @ts-ignore
      return container.originalEntrypoint
    }
    let entryPoint = config.entryPoint
    if (entryPoint === 'auto') {
      entryPoint = await this._dockerManager.detectEntryPoint(container)
      console.log('entrypoint detected: ', entryPoint, 'based on container config')
    }
    return entryPoint
  }

  private async _isRunning() {
    const { _config: config, _container: container } = this
    const info = await container.inspect()
    return info.State.Running
  }

  async start(flags: string[] = [], options: ClientStartOptions = {}): Promise<void> {
    await super.start(flags, options)
    const { _config: config, _container: container } = this

    const { listener = () => { } } = options
    listener(PROCESS_EVENTS.CLIENT_START_STARTED, { name: this._config.name, flags })
    const result = await this._container.start()

    // if the client is a service, we should also start the binary inside the container
    if (config.service) {
      // add flags
      flags = config.flags || []
      const entryPoint = await this._getEntryPoint()
      const cmd = [entryPoint, ...flags]
      const exec = await container.exec({
        cmd,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true
      })

      // send exec object to container and collect response from stream
      // stream can be multiplexed i.e. stderr and stdout are mixed over one transport (http)
      const stream = await exec.start()
      // TODO handle stdin
      if (options.stdio === 'inherit') {
        container.modem.demuxStream(stream, process.stdout, process.stderr);
      }
    }
    listener(PROCESS_EVENTS.CLIENT_START_FINISHED, { name: this._config.name, flags })
  }

  async stop(): Promise<void> {
    await super.stop()
    await this._container.stop()
  }

  async run(command: string, {
    stdio = 'pipe',
    timeout = undefined,
    tty = stdio === 'inherit',
    useBash = false, // default: await client.execute('ls -la') will NOT work
    useEntrypoint = true, // default: await client.execute('--version') WILL work
    volume = undefined
  }: CommandOptions = {}): Promise<string[]> {
    const image = this._imageName
    const cmd = command.split(' ')
    // console.log('execute command', cmd)
    const logs = await this._dockerManager.run(image, cmd, {
      stdio,
      volume
    })
    return logs
  }

  // https://github.com/apocas/dockerode/issues/520#issuecomment-520174673
  async execute(command: string = '', {
    stdio = 'pipe',
    timeout = undefined,
    tty = stdio === 'inherit',
    useBash = false, // default: await client.execute('ls -la') will NOT work
    useEntrypoint = true // default: await client.execute('--version') WILL work
  }: CommandOptions = {}): Promise<string[]> {
    const { _config: config, _container: container } = this
    const entryPoint = await this._getEntryPoint()

    // start container if not running already
    const isRunning = await this._isRunning()
    if (!isRunning) {
      await container.start()
      this._state = CLIENT_STATE.STARTED
    }

    let cmdArray = typeof command === 'string' ? command.split(' ') : command
    cmdArray = cmdArray.filter(arg => !!arg)

    // const info = await container.inspect()

    // bash -c string: If the -c option is present, then commands are read from string.  
    // If there  are  arguments  after  the  string,  they  are assigned to the positional parameters, starting with $0.
    let cmd
    if (useBash) {
      cmd = ['/bin/sh', '-c', useEntrypoint ? `${entryPoint} ${command}` : command]
    } else {
      cmd = useEntrypoint ? [entryPoint, ...cmdArray] : cmdArray
    }

    // create exec payload object
    const exec = await container.exec({
      cmd,
      // attach[Stream] means we want the container output
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: tty // docker sends multiplexed streams only if there no tty attached
    })

    // TODO implement timeout
    // send exec object to container and collect response from stream
    // stream can be multiplexed i.e. stderr and stdout are mixed over one transport (http)
    // const stream = await exec.start({ hijack: true, stdin: true })
    const stream = await exec.start()
    if (stdio === 'inherit') {
      if (tty) {
        stream.pipe(process.stdout)
      } else {
        container.modem.demuxStream(stream, process.stdout, process.stderr);
      }
      process.stdin.pipe(stream)
    }
    const logs = await collectLogs(stream)
    return logs
  }
}