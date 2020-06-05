import { IRelease } from "ethpkg";
import { ChildProcess } from "child_process";
import { CLIENT_STATE } from "./Client/BaseClient";
import { EventEmitter } from "events";

export { IRelease }

export interface FilterConfig {
  name: {
    includes?: string | Array<string>;
    excludes?: string | Array<string>;
  }
}

export declare type FilterFunction = (release: IRelease) => boolean;

export interface ReleaseFilterOptions {
  version?: string;
  platform?: string;
  packagesOnly?: boolean;
}

export interface DownloadOptions extends ReleaseFilterOptions {
  listener?: StateListener;
  cachePath?: string;
  useDocker?: boolean;
  isPackaged?: boolean
}

export type  GetClientOptions = DownloadOptions

export interface ProcessOptions {
  listener?: StateListener
  stdio?: 'inherit' | 'pipe'
  tty?: boolean
  timeout?: number
}

export interface JobDetails {
  jobId?: string
}

export type ClientStartOptions = DownloadOptions & ProcessOptions & JobDetails

export interface CommandOptions extends ProcessOptions {
  useBash?: boolean // is the command a bash command
  useEntrypoint?: boolean // is the command input for entrypoint
  volume?: string // docker -v 
}

export interface IClient extends EventEmitter {
  readonly id: string;
  info(): ClientInfo
  start(flags: string[], options: ClientStartOptions): Promise<void>;
  stop(): Promise<void>;
  execute(command: string, options?: CommandOptions): Promise<Array<string>> 
}

export declare type LogFilter = (log: string) => boolean;

export interface ClientDependencies {
  runtime?: any[]
  client?: any[]
}

export interface ClientBaseConfig {
  name: string;
  displayName: string;
  flags?: string[]; // default flags to start the client with
  ports? : string[] | { [index: string] : string }; // ports a client uses
  dependencies?: ClientDependencies 
}

export interface DockerConfig extends ClientBaseConfig {
  dockerimage: string;
  entryPoint?: string | 'auto'; // let ethbinary detect the entrypoint
  service?: boolean;
}

export interface PackageConfig extends ClientBaseConfig {
  repository: string;
  prefix?: string;
  filter?: FilterFunction | FilterConfig;
  binaryName?: string; // the name of binary in package - e.g. 'geth'; auto-expanded to geth.exe if necessary
  publicKey?: string;
  isPackaged?: boolean;
  extract?: boolean; // if true all package contents are extracted
}

export function instanceofDockerConfig(object: any): object is DockerConfig {
  return typeof object === 'object' && ('dockerimage' in object)
}

export function instanceofPackageConfig(object: any): object is PackageConfig {
  return typeof object === 'object' && ('repository' in object)
}

export type ClientConfig = PackageConfig | DockerConfig

export function instanceofClientConfig(object: any): object is ClientConfig {
  return typeof object === 'object' && ('name' in object && ('repository' in object || 'dockerimage' in object))
}

export declare type StateListener = (newState: string, args?: any) => void;


export interface ClientInfo {
  id: string // generated internal uuid
  type: 'docker' | 'binary'
  state: CLIENT_STATE
  started: number // timestamp
  stopped: number // timestamp
  ipc?: string // ipc path (named pipe / socket) if it can be detected
  rpcUrl?: string // url to rpc server
  binaryPath?: string // can be undefined for docker clients
  processId: string // container id for docker clients
  logs: string[]
}

export function instanceofClientInfo(object: any): object is ClientInfo {
  return typeof object === 'object' && ('processId' in object && 'id' in object)
}


export interface ManagedProcess {
  processId: string;
  process: ChildProcess;
  clientId: string;
}

