/* eslint-disable */
const {promises: {readFile, readdir}} = require('fs');
const path = require('path');
const extension = path.extname;

/**
 * @typedef Options
 * @property {String} key
 */

/** @type {Options} */
const defaults = {}

/**
 * Normalize plugin options
 * @param {Options} [options]
 * @returns {Object}
 */
 function normalizeOptions(options) {
  return Object.assign({}, defaults, options || {});
}

/**
 * getExternalFile
 *
 * @param {*} filePath 
 * @returns Content of the file
 */
async function getExternalFile(filePath) {
  const fileBuffer = await readFile(filePath);
  return JSON.parse(fileBuffer.toString());
}

/**
 * getDirectoryFiles
 * 
 * @param {*} directoryPath 
 * @returns List of all files in the directory
 */
async function getDirectoryFiles(directoryPath) {
  return await readdir(directoryPath);
}

/**
 * getDirectoryFilesContent
 * 
 * @param {*} directoryPath 
 * @param {*} fileList 
 * @returns TRhe content of all files in a directory
 */
async function getDirectoryFilesContent(directoryPath, fileList) {
  const fileContent = await fileList.map(async file => {
    return await getExternalFile(path.join(path.join(directoryPath, file))); 
  });
  return await Promise.all(fileContent);
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

function initMetameta(options){
  options = normalizeOptions(options);

  return function metameta(files, metalsmith, done){
    const allMetadata = metalsmith.metadata();

    // array to hold all active promises during external file reads. Will be
    // used with Promise.allSettled to invoke done()
    const allPromises = [];

    // loop over all metadata files/directories
    Object.keys(options).forEach(function(optionFilepath) {

      // check if file is located inside the metalsmith source directory
      const metaFilePath = options[optionFilepath];
      const isLocal = metaFilePath.startsWith("./");
      const isExternal = metaFilePath.startsWith("../");
      
      // flag to be reset when valid filepath is detected
      let validFilepath = false;
  
      /*
       * if file or directory is local we can get the metadata from the metalsmith file object
       */
      if (isLocal) {
        // get object key from the options
        const key = metaFilePath.slice(2);
        let metadata;

        // check if the optionFilepath element has a file exension
        const fileExtension = extension(metaFilePath);
        if ( fileExtension ) {
          if ( fileExtension === ".json" || fileExtension === ".yaml" || fileExtension === ".yml") {
            // get the data from file object
            try {
              metadata = files[key].contents.toString();
            } catch (error) {
              console.log("Could not find file in files object");
              return done(error);
            }

            // to temp meta object
            allMetadata[optionFilepath] = JSON.parse(metadata);
            // ... and remove this file from the metalsmith build process
            delete files[key];

            // indicate filepath is valid
            validFilepath = true;
          }
        } else {
          // assume this is a directory, all files in this directory will be concatenated into one 
          // metadata object
          const groupMetadata = [];
          Object.keys(files).forEach(function(file) {
            if (file.includes(key)) {
              groupMetadata.push(JSON.parse(files[file].contents.toString()));
            }
          });

          if (groupMetadata.length) {
            allMetadata[optionFilepath] = groupMetadata;
          }
          else {
            console.log(`No files found in this directory "${key}"`);
          }

          // indicate filepath is valid
          validFilepath = true;
        }
      }

      /*
       * if file or directory is external we get the metadata from respective files
       */
      if (isExternal) {
        // get object key
        const key = metaFilePath.slice(3);

        // check if the optionFilepath has a file exension
        const fileExtension = extension(metaFilePath);
        if ( fileExtension ) {
          if ( fileExtension === ".json" || fileExtension === ".yaml" || fileExtension === ".yml") {
            
            // read external file content and store in metadata object
            const extFilePromise = getExternalFile(path.join(metalsmith._directory, key))
              .then(fileBuffer => {
                allMetadata[optionFilepath] = fileBuffer;
              })

              // add this promise to allPromises array. Will be later used with Promise.allSettled to invoke done()
              allPromises.push(extFilePromise);

            // indicate filepath is valid
            validFilepath = true;
          } 
        } else {
          // assume this is a directory
          const directoryPath = path.join(metalsmith._directory, key);
          
          // get content of all files in this directory concatenate into one metadata object
          const extDirectoryPromise = getDirectoryFiles(directoryPath)
            .then(fileList => {
              return getDirectoryFilesContent(directoryPath, fileList);
            })
            .then(fileBuffers => {
              const groupMetadata = [];
              fileBuffers.forEach(fileBuffer => {
                groupMetadata.push(JSON.parse(JSON.stringify(fileBuffer))); 
              })

              if (groupMetadata.length) {
                allMetadata[optionFilepath] = groupMetadata;
              }
              else {
                console.log(`No files found in this directory "${key}"`);
              }
              
            })
            .catch(error => {
              console.error(error.message);
              process.exit(1);
            });
             
            // add this promise to allPromises array. Will be later used with Promise.allSettled to invoke done()
            allPromises.push(extDirectoryPromise);

          // indicate filepath is valid
          validFilepath = true;
        }
      }

      if (!validFilepath) {
        const error = `${metaFilePath} is not a valid metafile path. Path must be relative to Metalsmith root`;
        done(error);
      }
    });
    
    // Promise.allSettled is used to invoke done()
    Promise.allSettled(allPromises).then(() => done());
  };
}

module.exports = initMetameta;