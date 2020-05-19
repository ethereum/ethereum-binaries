import { BaseClient } from "./BaseClient"
import { Container } from "dockerode"
import DockerManager from "../DockerManager"
import { DockerConfig, ClientInfo, ClientStartOptions, CommandOptions } from "../types"
import { Stream } from "stream"

const collectLogs = (stream: Stream) : Promise<string[]> => new Promise((resolve, reject) => {
  const _data: string[] = []
  stream.on('data', (data: any) => {
    // remove all tty non-ascii control chars etc
    let printable = data.toString().replace(/[^ -~\r|\n]+/g, "")
    if (printable.includes('runtime exec failed')) {
      reject(new Error('Command failed:\n' + printable))
    }
    // console.log('data', data.toString())
    _data.push(printable)
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
    private _container: Container,
    private _dockerManager: DockerManager,
    private _config: DockerConfig
  ) { super() }
  info(): ClientInfo {
    return {
      id: this.id,
      type: 'docker',
      state: this._state,
      started: this._started,
      stopped: this._stopped,
      processId: this._container.id,
      binaryPath: this._config.entryPoint
    }
  }
  private async _getEntryPoint() {
    const { _config: config, _container: container } = this
    let entryPoint = config.entryPoint
    if (entryPoint === 'auto') {
      entryPoint = await this._dockerManager.detectEntryPoint(container)
      console.log('Entrypoint detected: ', entryPoint, 'based on container config')
    }
    return entryPoint
  }
  async start(flags: string[] = [], options: ClientStartOptions = {}): Promise<void> {
    await super.start(flags, options)
    const { _config: config, _container: container } = this

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
  }
  async stop(): Promise<void> {
    await super.stop()
    await this._container.stop()
  }
  async execute(command: string, {
    stdio = 'pipe',
    useBash = false, // default: await client.execute('ls -la') will NOT work
    useEntrypoint = true // default: await client.execute('--version') WILL work
  }: CommandOptions = {}): Promise<string[]> {
    const { _config: config, _container: container } = this
    const entryPoint = await this._getEntryPoint()

    const cmdArray = typeof command === 'string' ? command.split(' ') : command

    // bash -c string: If the -c option is present, then commands are read from string.  
    // If there  are  arguments  after  the  string,  they  are assigned to the positional parameters, starting with $0.
    let cmd
    if (useBash) {
      cmd = ['sh', '-c', useEntrypoint ? `${entryPoint} ${command}` : command]
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
      Tty: true
    })
    // send exec object to container and collect response from stream
    // stream can be multiplexed i.e. stderr and stdout are mixed over one transport (http)
    const stream = await exec.start()
    if (stdio === 'inherit') {
      container.modem.demuxStream(stream, process.stdout, process.stderr);
    }
    else if (stdio === 'pipe') {
      const logs = await collectLogs(stream)
      return logs
    } else {
      throw new Error('Invalid stdio param: ' + stdio)
    }

    return []
  }
}