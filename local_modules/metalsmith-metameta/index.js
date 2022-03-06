'use strict';

const debug = require('debug')('metalsmith-metameta');
const {
  promises: { readFile, readdir }
} = require('fs');
const { relative, join, extname: extension, sep, basename, dirname } = require('path');
const yaml = require('js-yaml');
let toml
try {
  toml = require('toml').parse
} catch (err) {
  toml = () => {
    throw new Error('To use toml you must install it first, run "npm i toml"')
  }
}
const getFiles = require('node-recursive-directory');

/**
 * @typedef Options
 * @property {String} key
 */

/** @type {Options} */
const defaults = {};

/**
 * Normalize plugin options
 * @param {Options} [options]
 * @returns {Object}
 */
function normalizeOptions(options) {
  return Object.assign({}, defaults, options || {});
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


/**
 * groupMetadataSources
 * Function to split array values into four groups
 * - local files in Metalsmith source folder
 * - local directories in Metalsmith source folder
 * - external files outside Metalsmith source folder but in Metalsmith directory
 * - external directories outside Metalsmith source folder but in Metalsmith directory
 * 
 * @param {array} arr 
 * @param {function} filter 
 * 
 */
function groupMetadataSources(arr, src) {
  return arr.reduce((accu, value) => {
    // local file
    if(!!extension(value.path) && value.path.startsWith(src)) {
      accu[0].push(value);
    }
    // local directory
    if(!extension(value.path) && value.path.startsWith(src)) {
      accu[1].push(value);
    }
    // external file
    if(!!extension(value.path) && !value.path.startsWith(src)) {
      accu[2].push(value);
    }
    // external directory
    if(!extension(value.path) && !value.path.startsWith(src)) {
      accu[3].push(value);
    }
    return accu;
  }, [[],[],[],[]]);
}


/**
 * getNestedObject
 * Function to build a nested object from a file key with dots
 * @param {*} fileKey 
 * @param {*} Obj 
 * @returns nested object
 */
function getNestedObject(fileKey, Obj) {
  const path = fileKey.split('.');
  const resultingObject = path.reverse().reduce((acc, key, index, arr) => {
    // the last path element will receive the metadata
    // all others are just nested object properties
    return { [key]: index !== 0 ? acc : Obj };
  }, {});

  // remove the outer key as that is the key in the metalsmith metadata object
  return resultingObject[path[path.length-1]];
}


/**
 * toJson
 * Converts YAML, YML, TOML and filebuffer to JSON
 * @param {string} file 
 * @param {string} ext 
 * @returns JSON object literal
 */
function toJson(file, path) {
  const parser = parsers[extension(path)];
  try {
    return parser(file);
  } catch {
    throw new Error('malformed data in "' + path + '"');
  }
}

/**
 * getExternalFile
 * Reads file content in either .json, .yaml, .yml or .toml format
 * @param {*} filePath
 * @returns Content of the file in .json
 */
async function getExternalFile(filePath) {
  const fileBuffer = await readFile(filePath);
  return toJson(fileBuffer, filePath);
}

/**
 * getDirectoryFiles
 * @param {*} directoryPath
 * @returns List of all files in the directory
 */
async function getDirectoryFiles(directoryPath) {
  const files = await getFiles(directoryPath);

  const newFiles = files.map(file => {
    const key = file.replace(directoryPath, '').substring(1).replace(extension(file), "");
    return {
      key,
      path: file
    }
  })
  
  return await getDirectoryFilesContent(files, newFiles);
}

/**
 * getDirectoryFilesContent
 * @param {*} directoryPath
 * @param {*} fileList
 * @returns The content of all files in a directory
 */
async function getDirectoryFilesContent(fileList, newList) {
  const filesContent = await newList.map(async (file) => {
    const data = await getExternalFile(file.path);
    return {
      key: file.key,
      fileContent: data
    }
  });
  return await Promise.all(filesContent);
}

/**
 * getFileObject
 * @param {*} filePath
 * @param {*} optionKey
 * @param {*} allMetadata
 * @returns promise to push metafile object to metalsmith metadata object
 */
async function getFileObject(filePath, optionKey, allMetadata) {
  return getExternalFile(filePath).then((fileBuffer) => {
    allMetadata[optionKey] = fileBuffer;
    debug("Adding this external file to metadata: %O", fileBuffer);
  });
}

/**
 * getDirectoryObject
 * @param {*} directoryPath
 * @param {*} optionKey
 * @param {*} allMetadata
 * @returns promise to push concatenated metafile object of all directory files to metalsmith metadata object
 */
async function getDirectoryObject(directoryPath, optionKey, allMetadata) {
  return getDirectoryFiles(directoryPath)
    .then((files) => {

      const groupMetadata = {};
      files.forEach((file) => {
        groupMetadata[file.key] = file.fileContent;
      });

      if (groupMetadata.length) {
        allMetadata[optionKey] = groupMetadata;
        debug("Adding this external directory to metadata: %O", groupMetadata);
      } else {
        done(`No files found in this directory "${key}"`);
      }
    })
    .catch((e) => {
      debug(e);
    });
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

function initMetadata(options) {
  options = normalizeOptions(options);
  debug("Receiving options: %O", options)

  return function metameta(files, metalsmith, done) {
    // return if no options
    if(Object.keys(options).length === 0) {
      debug("Found no metadata options");
      done();
    }

    const allMetadata = metalsmith.metadata();

    // array to hold all active promises during external file reads. Will be
    // used with Promise.all to invoke done()
    const allPromises = [];

    // create array with all option values relative to metalsmith directory
    const allOptions = Object.keys(options).map(key => (
      {
        "key": key,
        "path": options[key]
      }
    ));

    // get metalsmith source directory
    const metalsmithSource = relative(metalsmith.directory(), metalsmith.source());

    // group option values into local/external files/directories
    const [localFiles, localDirs, externalFiles, externalDirs] = groupMetadataSources(allOptions, metalsmithSource);

    localFiles.forEach(function(file){
      // option path is relative to metalsmith root
      // const filePath = relative(metalsmith.source(), file.path);
      const filePath = file.path.replace(`${metalsmithSource}/`, "");

      // get the data from file object
      const metadata = toJson(files[filePath].contents, filePath);

      // if the file key includes a '.', then we assume a nested object
      if(file.key.includes('.')) {
        // get the nested object 
        const newMetadata = getNestedObject(file.key, metadata);
        // update the metadata object
        const path = file.key.split('.');
        allMetadata[path[0]] = Object.assign({}, allMetadata[path[0]], newMetadata)
        debug("Adding this nested object to metadata: %O", metadata);
      } else {
        // to temp meta object
        allMetadata[file.key] = metadata;
        debug("Adding this local file to metadata: %O", metadata);
      }

      // ... and remove this file from the metalsmith build process
      delete files[file.key];
    });

    localDirs.forEach(function(dir) {
      // option path is relative to metalsmith root
      // convert dir path to be relative to metalsmith source
      const filePath = dir.path.replace(`${metalsmithSource}/`, "");

      const groupMetadata = [];
      Object.keys(files).forEach(function (file) {
        if (file.includes(filePath)) {
          // get the data from file object
          const metadata = toJson(files[file].contents, file);
          groupMetadata.push(metadata); 
        }
      });

      if (groupMetadata.length) {
        
        // if the file key includes a '.', then we assume a nested object
        if(dir.key.includes('.')) {
          // get the nested object 
          const newMetadata = getNestedObject(dir.key, groupMetadata);
          // update the metadata object
          const path = dir.key.split('.');
          allMetadata[path[0]] = Object.assign({}, allMetadata[path[0]], newMetadata)
          debug("Adding this nested object to metadata: %O", groupMetadata);
        } else {
          allMetadata[dir.key] = groupMetadata;
          debug("Adding this local directory to metadata: %O", groupMetadata);
        }

      } else {
        done(`No files found in this directory "${dir}"`);
      }
    });

    externalFiles.forEach(function(file) {
      const filePath = join(metalsmith.directory(), file.path);
      const extFilePromise = getFileObject(filePath, file.key, allMetadata);

      // add this promise to allPromises array. Will be later used with Promise.allSettled to invoke done()
      allPromises.push(extFilePromise);
    });

    externalDirs.forEach(function(dir) {
      // get content of all files in this directory, concatenated into one metadata object
      const directoryPath = join(metalsmith.directory(), dir.path);
      const extDirectoryPromise = getDirectoryObject(directoryPath, dir.key, allMetadata);

      // add this promise to allPromises array. Will be later used with Promise.all to invoke done()
      allPromises.push(extDirectoryPromise);
    });

    // Promise.all is used to invoke done()
    Promise.all(allPromises).then(() => {
      debug(metalsmith.metadata());
      return done()});
  };
}

module.exports = initMetadata;
