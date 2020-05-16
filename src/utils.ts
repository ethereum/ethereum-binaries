import crypto from 'crypto'
import { IRelease } from 'ethpkg';

export const uuid = (filePath? : string) => {
  // create stable ids without leaking path
  if (typeof filePath === 'string') {
    return crypto.createHash('md5').update(filePath).digest("hex")
  }
  // replace special chars to make url friendly
  return crypto.randomBytes(3*4).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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

interface FilterConfig {
  name: {
    includes?: Array<string>;
    excludes?: Array<string>;
  }
}

export declare type FilterFunction = (release: IRelease) => boolean;

export const createFilterFunction = (filterConfig? : FilterConfig) : FilterFunction => {
  if (!filterConfig || !('name' in filterConfig)) {
    return (() => true)
  }
  const { name } = filterConfig
  const includes : Array<string> = name.includes || []
  const excludes: Array<string> = name.excludes || []
  return ({ fileName, version } : any) => {
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