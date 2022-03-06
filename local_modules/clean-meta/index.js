'use strict'

const debug = require('debug')('metalsmith-metameta')
const {
  promises: { readdir }
} = require('fs')
const { relative, extname, basename, join } = require('path')
const yaml = require('js-yaml')
let toml
try {
  toml = require('toml').parse
} catch (err) {
  toml = () => {
    throw new Error('To use toml you must install it first, run "npm i toml"')
  }
}

/**
 * Supported metadata parsers.
 */
const parsers = {
  '.json': JSON.parse,
  '.yaml': yaml.load,
  '.yml': yaml.load,
  '.toml': toml
}
const extglob = `**/*{${Object.keys(parsers).join(',')}}`



/**
 * @typedef Options
 * @property {String} key
 */

/** @type {Options} */
const defaults = {}

/**
 * Set `value` at `host[keypath]`
 * @param {Object} host
 * @param {String} keypath
 * @param {*} value
 */
function set(host, keypath, value) {
  const parts = keypath.split('.')
  while (parts.length) {
    const part = parts.shift()
    if (parts.length) {
      if (!Object.prototype.hasOwnProperty.call(host, part)) {
        host[part] = {}
      } else if (typeof host[part] !== 'object') {
        break
      }
    } else {
      host[part] = value
    }
    host = host[part]
  }
}

/**
 * Promisified `metalsmith.readFile`
 * @todo remove when ms 2.5.0 is out
 * @param {import('metalsmith')} metalsmith
 * @param {string} filepath
 * @returns {Promise<import('metalsmith').File>}
 */
function readFile(metalsmith, filepath) {
  return new Promise((resolve, reject) => {
    metalsmith.readFile(filepath, (err, file) => {
      if (err) reject(err)
      resolve(file)
    })
  })
}

/**
 * Normalize plugin options
 * @param {Options} [options]
 * @returns {Object}
 */
function normalizeOptions(options) {
  return Object.assign({}, defaults, options || {})
}

/**
 * A Metalsmith plugin to read files with metadata
 *
 * Files containing metadata must be located in the Metalsmith root directory.
 * Content of files located in the Metalsmith source directory (local files) is readily available
 * in the files object while files outside the source directory (external files) are read fropm disk.
 *
 * Files are specified via option entries like: site: "./data/siteMetadata.json"
 * The resulting meta object will then be something like this:
 * {
 *  site: {
 *    "title":"New MetalsmithStarter",
 *    "description":"Metalsmith Starter Website",
 *     "author":"werner@glinka.co",
 *     "siteURL":"https://newmsnunjucks.netlify.app/",
 *      ...
 * }
 *
 * Directories may also be specified like this: example: "./data/example". In this case
 * the plugin will read all files in the directory and concatenate them into a single file object.
 *
 *
 * @param {Options} options
 * @returns {import('metalsmith').Plugin}
 */
function initMetadata(options = {}) {
  options = normalizeOptions(options)
  debug('Running with options: %O', options)

  return function metadata(files, metalsmith, done) {
    // return if no options
    if (Object.keys(options).length === 0) {
      debug('Found no metadata options')
      done()
    }

    // turn off frontmatter parsing while we use metalsmith.readFile
    // we re-enable it when this plugin's done
    const frontmatter = metalsmith.frontmatter()
    metalsmith.frontmatter(frontmatter)

    // array to hold all active promises during external file reads. Will be
    // used with Promise.allSettled to invoke done()
    const filePromises = []
    const dirPromises = []

    // get metalsmith source directory
    const relpath = (path, root) => relative(root || metalsmith.directory(), metalsmith.path(path))

    // fast in-source error handling first
    for (const filepath of Object.values(options)) {
      if (!metalsmith.match(extglob, filepath).length) {
        done(new Error(`unsupported data format "${extname(filepath)}" for entry "${filepath}"`))
      }
      const srcPath = relpath(filepath, metalsmith.source())
      if (!srcPath.startsWith('..') && !Object.prototype.hasOwnProperty.call(files, srcPath)) {
        done(new Error('file not found for entry "' + relpath(filepath) + '"'))
      }
    }

    // create array with all option values relative to metalsmith directory
    Object.entries(options).forEach(([dest, filepath]) => {
      const srcPath = relpath(filepath, metalsmith.source())
      const absPath = metalsmith.path(filepath)
      const ext = extname(basename(srcPath))

      // it's local
      if (!srcPath.startsWith('..')) {
        // it's a single file
        if (ext) {
          filePromises.push(
            Promise.resolve({
              path: srcPath,
              key: dest,
              file: files[srcPath]
            })
          )

          // it's a directory
        } else {
          const matches = metalsmith.match(`${srcPath}/${extglob}`)
          if (!matches.length) {
            debug('No matching files found for entry "' + filepath + '"')
          }
          matches.forEach((filepath) => {
            filePromises.push(
              Promise.resolve({
                path: filepath,
                key: `${dest}.${basename(filepath, extname(filepath))}`,
                file: files[filepath]
              })
            )
          })
        }
        // it's external
      } else {
        // it's a single file
        if (extname(filepath)) {
          const fileread = readFile(metalsmith, absPath)
            .then((file) => ({
              path: relpath(filepath),
              key: `${dest}.${basename(filepath, extname(filepath))}`,
              file
            }))
            .catch(() => done(new Error('file not found for entry "' + relpath(filepath) + '"')))
          filePromises.push(fileread)
          // it's a directory
        } else {
          // for ext dirs, just push the file listings, flatten them afterwards
          dirPromises.push(
            readdir(absPath)
              .then((filelist) => {
                const matches = metalsmith.match(extglob, filelist)
                if (!matches.length) {
                  debug('No matching files found for entry "' + relpath(filepath) + '"')
                }
                matches.map((f) => ({
                  path: join(srcPath, f),
                  key: `${dest}.${basename(f, extname(f))}`
                }))
              })
              .catch((err) => done(err))
          )
        }
      }
    })

    // flatten file listings first, these are relatively inexpensive
    Promise.all(dirPromises)
      .then((filelists) => {
        filelists.forEach((filelist) => {
          const matches = metalsmith.match(
            extglob,
            filelist.map((f) => f.path)
          )
          filePromises.push(
            ...matches.map((filepath) =>
              readFile(metalsmith, metalsmith.path(filepath))
                .then((file) => ({
                  path: filepath,
                  key: filelist.find((f) => f.path === filepath).key,
                  file
                }))
                .catch((err) => done(err))
            )
          )
        })
        return Promise.all(filePromises)
      })
      .then((allFiles) => {
        const metadata = metalsmith.metadata()
        allFiles.forEach(({ key, file, path }) => {
          const parser = parsers[extname(path)]
          try {
            const parsed = parser(file.contents.toString())
            set(metadata, key, parsed)
            delete files[path]
          } catch (err) {
            done(
              err.message.startsWith('To use toml')
                ? err
                : new Error('malformed data in "' + path + '"')
            )
          }
        })
        // restore frontmatter
        metalsmith.frontmatter(frontmatter)
        done()
      })
      .catch((err) => {
        // restore frontmatter
        metalsmith.frontmatter(frontmatter)
        done(err)
      })
  }
}

module.exports = initMetadata