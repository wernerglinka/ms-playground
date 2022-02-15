'use strict';

const debug = require('debug')('metalsmith-metameta');
const {
  promises: { readFile, readdir }
} = require('fs');
const { relative, join, extname: extension, sep, basename, dirname } = require('path');
const yaml = require('js-yaml');
const toml = require('toml');

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
 * bifurcate
 * Function to split array values into two groups based on a condition
 * source: https://toncho.dev/javascript/javascript-array-bifurcate/
 * @param {array} arr 
 * @param {function} filter 
 * 
 */
function bifurcate(arr, filter) {
  return arr.reduce((accumulator, value) => { 
    accumulator[filter(value) ? 0 : 1].push(value);
    return accumulator;
  }, [[], []]);
}
/**
 * YAML to JSON
 * @param {*} string - YAML file
 * @returns .json string
 */
function yamlToJSON(string) {
  try {
    return yaml.load(string);
  } catch (e) {
    throw `error converting yaml to json: ${e}`;
  }
}

/**
 * TOML to JSON
 * @param {*} string - TOML file
 * @returns .json string
 */
function tomlToJSON(string) {
  try {
    return toml.parse(string);
  } catch (e) {
    throw `error converting toml to json: ${e}`;
  }
}

/**
 * getExternalFile
 * Reads file content in either .json, .yaml, .yml or .toml format
 * @param {*} filePath
 * @returns Content of the file in .json
 */
async function getExternalFile(filePath) {
  const fileExtension = extension(filePath);
  const fileBuffer = await readFile(filePath);
  let fileContent;

  switch (fileExtension) {
    case '.yaml':
    case '.yml':
      fileContent = yamlToJSON(fileBuffer);
      break;
    case '.toml':
      fileContent = tomlToJSON(fileBuffer);
      break;
    case '.json':
      fileContent = JSON.parse(fileBuffer.toString()); // remove line breaks etc from the filebuffer
      break;
    default:
      fileContent = JSON.parse(fileBuffer.toString());
  }
  return fileContent;
}

/**
 * getDirectoryFiles
 * @param {*} directoryPath
 * @returns List of all files in the directory
 */
async function getDirectoryFiles(directoryPath) {
  const fileList = await readdir(directoryPath);
  return await getDirectoryFilesContent(directoryPath, fileList);
}

/**
 * getDirectoryFilesContent
 * @param {*} directoryPath
 * @param {*} fileList
 * @returns The content of all files in a directory
 */
async function getDirectoryFilesContent(directoryPath, fileList) {
  const fileContent = await fileList.map(async (file) => {
    return await getExternalFile(join(directoryPath, file));
  });
  return await Promise.all(fileContent);
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
    .then((fileBuffers) => {
      const groupMetadata = [];
      fileBuffers.forEach((fileBuffer) => {
        groupMetadata.push(fileBuffer);
      });

      if (groupMetadata.length) {
        allMetadata[optionKey] = groupMetadata;
      } else {
        done(`No files found in this directory "${key}"`);
      }
    })
    .catch((e) => {
      //done(e.message);
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



  //debug("Receiving options: %O", options)

  return function metadata(files, metalsmith, done) {
    // return if no options
    if(Object.keys(options).length === 0) {
      done("No metadata source options");
    }

    const allMetadata = metalsmith.metadata();

    // array to hold all active promises during external file reads. Will be
    // used with Promise.allSettled to invoke done()
    const allPromises = [];

    // create array with all option values relative to metalsmith directory
    const allOptions = Object.keys(options).map(key => (
      {
        "key": key,
        "path": relative(metalsmith.directory(), options[key])
      }
    ));

    // get relative metalsmith source directory
    const metalsmithSource = relative(metalsmith.directory(), metalsmith.source());
    
    // divide into local and external files and directories
    const [allFiles, allDirs] = bifurcate(allOptions, v => v.path.match('(ya?ml|toml|json)'));
    const [localFiles, externalFiles] = bifurcate(allFiles, v => v.path.startsWith(metalsmithSource));
    const [localDirs, externalDirs] = bifurcate(allDirs, v => v.path.startsWith(metalsmithSource));

    localFiles.forEach(function(file){
      const filePath = relative(metalsmith.source(), file.path);
      const fileExtension = extension(filePath);
      // flag to be reset when valid filepath is detected
      let validFilepath = false;

      let metadata;
      // get the data from file object
      try {
        metadata = files[filePath].contents.toString();
      } catch (error) {
        done(error);
      }
      if (!!fileExtension.match('(ya?ml)')) {
        metadata = JSON.stringify(yamlToJSON(metadata));
      }
      if (fileExtension === '.toml') {
        metadata = JSON.stringify(tomlToJSON(metadata));
      }

      // to temp meta object
      allMetadata[file.key] = JSON.parse(metadata);

      //debug("Adding this to metadata: %O", metadata);

      // ... and remove this file from the metalsmith build process
      delete files[file.key];

      // indicate filepath is valid
      validFilepath = true;
    });

    localDirs.forEach(function(dir) {
      const filePath = relative(metalsmith.source(), dir.path);

      // flag to be reset when valid filepath is detected
      let validFilepath = false;
      
      const groupMetadata = [];
      Object.keys(files).forEach(function (file) {
        const fileExtension = extension(file);
        if (file.includes(filePath)) {
          
          if (!!fileExtension.match('(ya?ml|toml|json)')) {
            let metadata;
            // get the data from file object
            try {
              metadata = files[file].contents.toString();
            } catch (error) {
              done(error);
            }
            if (fileExtension === '.yaml' || fileExtension === '.yml') {
              metadata = JSON.stringify(yamlToJSON(metadata));
            }
            if (fileExtension === '.toml') {
              metadata = JSON.stringify(tomlToJSON(metadata));
            }

            groupMetadata.push(JSON.parse(metadata));
          } else {
            done(`${fileExtension} is not a valid file type`);
          }
        }
      });

      if (groupMetadata.length) {
        allMetadata[dir.key] = groupMetadata;
      } else {
        done(`No files found in this directory "${dir}"`);
      }
      // indicate filepath is valid
      validFilepath = true;
    });

    externalFiles.forEach(function(file) {
      const filePath = file.path;
      

      // flag to be reset when valid filepath is detected
      let validFilepath = false;

      const extFilePromise = getFileObject(filePath, file.key, allMetadata);

      // add this promise to allPromises array. Will be later used with Promise.allSettled to invoke done()
      allPromises.push(extFilePromise);

      // indicate filepath is valid
      validFilepath = true;
    });

    externalDirs.forEach(function(dir) {
    
      // flag to be reset when valid filepath is detected
      let validFilepath = false;
      const extDirectoryPromise = getDirectoryObject(dir.path, dir.key, allMetadata);

          // add this promise to allPromises array. Will be later used with Promise.allSettled to invoke done()
          allPromises.push(extDirectoryPromise);

          // indicate filepath is valid
          validFilepath = true;
    });

    // Promise.all is used to invoke done()
    Promise.all(allPromises).then(() => done());
  };
}

module.exports = initMetadata;
