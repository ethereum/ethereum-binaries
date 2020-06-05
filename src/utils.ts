import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import stream from 'stream'
import { FilterFunction, FilterConfig } from './types'
const openpgp = require('openpgp')

export const uuid = (filePath?: string) => {
  // create stable ids without leaking path
  if (typeof filePath === 'string') {
    return crypto.createHash('md5').update(filePath).digest("hex")
  }
  // replace special chars to make url friendly
  return crypto.randomBytes(3 * 4).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export const normalizePlatform = (platform: string) => {
  if (['mac'].includes(platform.toLowerCase())) {
    platform = 'darwin'
  }
  else if (['win32'].includes(platform.toLowerCase())) {
    platform = 'windows'
  }
  return platform
}

export const createFilterFunction = (filterConfig?: FilterConfig): FilterFunction => {
  if (!filterConfig) {
    return () => true
  }
  if (typeof filterConfig === 'function') {
    return filterConfig
  }
  if (!filterConfig || !('name' in filterConfig)) {
    return (() => true)
  }
  const { name } = filterConfig
  if (typeof name.includes === 'string') {
    name.includes = [ name.includes ] 
  }
  if (typeof name.excludes === 'string') {
    name.excludes = [ name.excludes ] 
  }
  const includes : Array<string> = name.includes || []
  const excludes: Array<string> = name.excludes || []
  return ({ fileName, version }: any) => {
    if (!fileName) {
      return false
    }
    fileName = fileName.toLowerCase()
    const shouldFilter = (
      (!includes || includes.every(val => fileName.indexOf(val) >= 0)) &&
      (!excludes || excludes.every(val => fileName.indexOf(val) === -1))
    )
    // console.log(fileName, shouldFilter, excludes)
    return shouldFilter
  }
}

export const validateConfig = (clientConfig: any) => {
  if (!clientConfig) { return false }
  if (typeof clientConfig.name !== 'string') { return false }
  if (!clientConfig.repository && !clientConfig.dockerimage) {
    return false
  }
  return true
}

export const bufferToStream = (buf: Buffer) => {
  const readable = new stream.Readable()
  readable._read = () => { } // _read is required but you can noop it
  readable.push(buf)
  readable.push(null)
  return readable
}

export const verifyPGP = async (filePath: string, publicKeyArmored: string, detachedSignature: string) => {
  const readableStream = fs.createReadStream(filePath)
  const options = {
    message: openpgp.message.fromBinary(readableStream),              // CleartextMessage or Message object
    signature: await openpgp.signature.readArmored(detachedSignature), // parse detached signature
    publicKeys: (await openpgp.key.readArmored(publicKeyArmored)).keys // for verification
  }
  const result = await openpgp.verify(options)
  await openpgp.stream.readToEnd(result.data);
  const validity = await result.signatures[0].verified;
  if (validity) {
    return {
      isValid: true,
      signedBy: result.signatures[0].keyid.toHex()
    }
  } else {
    throw new Error('signature could not be verified');
  }
}

export const verifyBinary = async (binaryPath: string, armoredPublicKeys: string, detachedSig: string) => {
  const result = await verifyPGP(binaryPath, armoredPublicKeys, detachedSig)
  return result
}

const getJavaVersion = (javaBinPath: string) => {

}

export const resolveRuntimeDependency = (runtimeDependency : any = {}) => {
  const { name, version, type } = runtimeDependency
  if (name === 'Java') {
    if ('JAVA_HOME' in process.env) {
      const JAVA_HOME = process.env['JAVA_HOME']
      if (!JAVA_HOME) {
        return undefined
      }
      const JAVA_BIN = path.join(
        JAVA_HOME,
        'bin',
        process.platform === 'win32' ? 'java.exe' : 'java'
      )
      return fs.existsSync(JAVA_BIN) ? JAVA_BIN : undefined
    } else {
      // MAC:
      if (process.platform === 'darwin') {
        if (fs.existsSync('/Library/Java/JavaVirtualMachines/')) {
          const vms = fs.readdirSync('/Library/Java/JavaVirtualMachines/')
          // /Contents/Home/bin/java
          // console.log('found vms', vms)
        }
        // alternative tests
        // /usr/bin/java
        // /usr/libexec/java_home -V
        // execute 'which java'
        const javaPath = '/usr/bin/java'
        return fs.existsSync(javaPath) ? javaPath : undefined
      }
      // console.log(process.env.PATH.includes('java'))
    }
    return undefined
  }
  return undefined
}

export const extractPlatformFromString = (str : string) : 'windows' | 'darwin' | 'linux' | undefined => {
  str = str.toLowerCase() 
  if (str.includes('win32') || str.includes('windows')) {
    return 'windows'
  }
  if (str.includes('darwin') || str.includes('mac') || str.includes('macos')) {
    return 'darwin'
  }
  if (str.includes('linux')) {
    return 'linux'
  }
  return undefined
}

// should match .sha256 => match length 7
export const getFileExtension = (str: string) : string | undefined => {
  return str.match(/\.[0-9a-z]{1,7}$/i)?.shift()
}
