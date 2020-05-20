import fs from 'fs'
import path from 'path'
import Docker, { Container } from 'dockerode'
import { bufferToStream } from './utils';
import { StateListener } from './types';
import ethpkg, { IPackage } from 'ethpkg'
import { PROCESS_EVENTS } from './events';
import { Stream } from 'stream';

const STATUS = {
  DOWNLOAD_COMPLETE: 'Download complete',
  VERIFYING_CHECKSUM: 'Verifying Checksum',
  DOWNLOADING: 'Downloading',
  PULLING_FS_LAYER: 'Pulling fs layer',
  PULL_COMPLETE: 'Pull complete',
  EXTRACTING: 'Extracting',
}

export interface ContainerConfig {
  dispose?: boolean;
  ports?: string[];
  overwriteEntrypoint?: boolean;
  autoPort?: boolean;
}

export interface GetImageOptions {
  listener?: StateListener
}

export default class DockerManager {
  private _docker: any;
  constructor(private prefix = 'ethbinary') {

  }

  public connect() {
    const socket = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
    const stats = fs.statSync(socket);
    if (!stats.isSocket()) {
      throw new Error('Could not establish Docker connection - is Docker running?');
    }
    this._docker = new Docker({ socketPath: socket });
  }

  public isValidRepoTag(imageTag: string) {
    // FIXME validate docker url
    return true
  }

  private pullImage = async (repoTag: string, listener: StateListener) => {
    listener(PROCESS_EVENTS.PULL_DOCKER_IMAGE_STARTED)
    return new Promise((resolve, reject) => {
      this._docker.pull(repoTag, (err: Error, stream: Stream) => {
        this._docker.modem.followProgress(stream, onFinished, onProgress);
        function onFinished(err: Error, output: Array<any>) {
          listener(PROCESS_EVENTS.PULL_DOCKER_IMAGE_FINISHED)
          //output is an array with output json parsed objects
          resolve(output)
        }
        function onProgress(event: any) {
          // downloads are done in parallel with id referencing a specific download
          const { status, progressDetail, id } = event
          if (status === STATUS.DOWNLOADING && progressDetail) {
            const { current, total } = progressDetail
            listener(PROCESS_EVENTS.PULL_DOCKER_IMAGE_PROGRESS, {
              id,
              status,
              progress: (100 * (current / total)),
              progressDetail
            })
          }
        }
      })
    })
  }

  /**
 * if docker hub => pull image
 * if dockerfile => build
 * if available => return local image
 * @param imageName 
 * @param param1 
 */
  async getImage(imageName: string, {
    listener = (state: string, args: any) => { }
  } = {}) {
    throw new Error('not implemented')
  }

  public async createImage(imageName: string, dockerFile: IPackage, listener: StateListener = (newState: string, arg: any) => undefined) {
    const buf = await dockerFile.toBuffer()
    // always prefix images for detection
    imageName = imageName.startsWith(`${this.prefix}_`) ? imageName : `${this.prefix}_${imageName}`
    const _stream = await this._docker.buildImage(bufferToStream(buf), {
      t: imageName
    })
    // parse stream and pass events to listener
    _stream.on('data', (chunk: any) => {
      try {
        let st = chunk.toString('utf8')
        // st = st.replace(/\r*\n*\s*\S*/g, '')
        st = st.replace(/\r?\n|\r/g, '')
        st = st.replace(/}/gi, '},')
        st = st.replace(',}', '}')
        let jsonString = `[${st}]`
        jsonString = jsonString.replace(',]', ']')
        const eventObjects = JSON.parse(jsonString)
        const logs = eventObjects.map((e: any) => e.stream ? e.stream.trim() : '').filter((log: string) => log)
        for (const log of logs) {
          listener(PROCESS_EVENTS.DOCKER_EVENT, { log: log })
        }
      } catch (error) {
        console.log('parse docker log error', error.message)
      }
    })
    const res = await new Promise((resolve, reject) => {
      this._docker.modem.followProgress(_stream, (err: Error, res: any) => err ? reject(err) : resolve(res));
    })
    if (res) {
      return imageName
    }
    return undefined
  }

  public async createImageFromDockerfile(imageNameUnprefixed: string, dockerFilePath: string, listener?: StateListener) {
    const dirPath = path.dirname(dockerFilePath)
    console.log('dir', dirPath)
    const pkg = await ethpkg.createPackage(dirPath, {
      type: 'tar',
      compressed: true,
      listener: (newState, args) => {
        // console.log('newState', newState, args)
      }
    })
    // TODO check pkg contains dockerfile
    const imageName = await this.createImage(imageNameUnprefixed, pkg, listener)
    return imageName
  }

  public async getOrCreateImage(imageNameUnprefixed: string, imageSpecifier: string, {
    listener = () => { }
  } : GetImageOptions = {}) {
    // TODO if version = 'cached' do NOT pull image but use existing
    // local Dockerfile
    if (fs.existsSync(imageSpecifier)) {
      return this.createImageFromDockerfile(imageNameUnprefixed, imageSpecifier, listener)
    }
    // docker url / repo tag
    else if (this.isValidRepoTag(imageSpecifier)) {
      console.log('image specifier', imageSpecifier)
      const repoTag = imageSpecifier
      const image = await this.pullImage(repoTag, listener)
      if (!image) {
        throw new Error('Image could not be pulled')
      }
      return repoTag // NOTE: unprefixed
    }
    else {
      throw new Error('Invalid Dockerfile / image specifier')
    }
  }

  public async getContainer(containerName: string, stopRunning = true): Promise<Container | undefined> {
    const containers = await this._docker.listContainers({ all: true });
    const containerInfo: Docker.ContainerInfo | undefined = containers.find((c: any) => c.Names[0] === `/${containerName}`)
    if (!containerInfo) {
      return undefined
    }
    const { Id, State, /*Names,*/ Image } = containerInfo
    const container = await this._docker.getContainer(Id)
    // handles "container already started"
    if (State !== 'stopped' && stopRunning) {
      try {
        await container.stop()
      } catch (error) {
        // ignore if stopped already
        // console.log('container could not be stopped:', error.message)
      }
    }
    return container
  }

  public async removeContainer(container: Container) {
    // force will stop if running
    return container.remove({ force: true })
  }

  public async createContainer(imageName: string, containerName: string, overwriteContainer = false, {
    dispose = false,
    autoPort = false,
    overwriteEntrypoint = true,
    ports = []
  } : ContainerConfig = {}) {
    // TODO  handle 'OCI runtime create failed: container_linux.go:346: starting container process caused "exec: \\"/bin/bash\\": stat /bin/bash: no such file or directory": unknown'
    // TODO  handle no such container - No such image: golang:1.13-alpine 
    const stopIfRunning = true

    // TODO save original entrypoint
    let container = await this.getContainer(containerName, stopIfRunning)
    if (!container || overwriteContainer) {
      if (container) {
        await this.removeContainer(container)
      }
      // https://docs.docker.com/engine/api/v1.40/#operation/ContainerCreate
      const containerConfig : any = {
        Image: imageName,
        name: containerName,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        // The -it runs Docker interactively (so you get a pseudo-TTY with STDIN)
        Tty: true, // keeps container running
        OpenStdin: true,
        // FIXME a problem that probably occurs is that ports get configured by the user in between init() and start()
        ExposedPorts: { },
        HostConfig: {
          // Automatically remove the container when the container's process exits (e.g. when stopped).
          AutoRemove: dispose,
          PortBindings: {}
        },
      }

      if (overwriteEntrypoint) {
        containerConfig['Entrypoint'] = ['/bin/sh']
      }

      // we auto-bind all ports that are exposed from the container to the host
      for (let port of ports) { 
        // "<port>/<tcp|udp|sctp>"
        if (!port.includes('/')) {
          port += '/tcp' // expand ports to tcp as default
        }

        // An object mapping ports to an empty object in the form:
        // {"<port>/<tcp|udp|sctp>": {}}
        containerConfig['ExposedPorts'][port] = {}

        // PortMap describes the mapping of container ports to host ports, 
        // using the container's port-number and protocol as key in the 
        // format <port>/<protocol>, for example, 80/udp
        // 127.0.0.1 - is more restrictive as the default 0.0.0.0 for security reasons
        // "8545/tcp": [{ "HostPort": "8545" }],
        containerConfig['HostConfig']['PortBindings'][port] = [ { 'HostIp': '127.0.0.1', 'HostPort': autoPort ? undefined : port.split('/')[0] } ]
      }
      // console.log('config', JSON.stringify(containerConfig, null, 2))
      try {
        container = await this._docker.createContainer(containerConfig)
      } catch (error) {
        console.log('create container error', error)
      }
    }
    if (overwriteEntrypoint) {
      // store overwritten entrypoint
      const image = await this._docker.getImage(imageName)
      const info = await image.inspect()
      const entryPoint = info.Config.Entrypoint
      // @ts-ignore
      container.originalEntrypoint = Array.isArray(entryPoint) ? entryPoint[0] : entryPoint
    }
    return container
  }

  /*
  public async getOrCreateContainer(imageName: string, containerName: string) {
    let container = await this.getContainer(containerName)
    if (container) {
      return container
    }
    const listener = () => { }
    // const image = await this.getImage(imageName, { listener })
  }
  */

  public async stopContainer(containerId: string) {
    const container = await this._docker.getContainer(containerId)
    return container.stop()
  }

  public async detectEntryPoint(container: Container) {
    const data = await container.inspect()
    if (data.Config.Entrypoint) {
      const entryPoint = data.Config.Entrypoint[0]
      return entryPoint
    }
    return undefined
  }

}