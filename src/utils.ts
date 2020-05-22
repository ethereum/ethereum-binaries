import fs from 'fs'
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
  if (!filterConfig || !('name' in filterConfig)) {
    return (() => true)
  }
  const { name } = filterConfig
  const includes: Array<string> = name.includes || []
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