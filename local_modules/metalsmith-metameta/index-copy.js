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
 * A Metalsmith plugin to read files with metadata
 * 
 * 
 * 
 * @param {Options} options
 * @returns {import('metalsmith').Plugin}
 */

function initMetameta(options){
  options = normalizeOptions(options);

  return function metameta(files, metalsmith, done){
    const allMetadata = metalsmith.metadata();

    const allPromises = [];
    const allPromiseNames = [];

    // loop over all metadata files/directories
    Object.keys(options).forEach(function(option) {

      // check if file is located inside the metalsmith source directory
      const metaFilePath = options[option];

      const isLocal = metaFilePath.startsWith("./");
      const isExternal = metaFilePath.startsWith("../");
      // flag to be reset when valid filepath is detected
      let validFilepath = false;
  
      /*
       * if file or directory is local we can get the meta data from the metalsmith file object
       */
      if (isLocal) {
        // get object key from the options
        const key = metaFilePath.slice(2);
        let metadata;

        // check if the option element has a file exension
        const fileExtension = extension(metaFilePath);
        if ( fileExtension ) {
          if ( fileExtension === ".json" || fileExtension === ".yaml" || fileExtension === ".yml") {
            // get the data from file object
            try {
              metadata = files[key].contents.toString();
            } catch (error) {
              return done(error);
            }

            // to temp meta object
            allMetadata[option] = JSON.parse(metadata);
            // ... and remove this file from the metalsmith build process
            delete files[key];

            // indicate filepath is valid
            validFilepath = true;
          }
        } else {
          // assume this is a directory, all files content will be turned into a array member
          const groupMetadata = [];
          Object.keys(files).forEach(function(file) {
            if (file.includes(key)) {
              groupMetadata.push(JSON.parse(files[file].contents.toString()));
            }
          });

          if (groupMetadata.length) {
            allMetadata[option] = groupMetadata;
          }
          else {
            console.log(`No files found in this directory "${key}"`);
          }

          // indicate filepath is valid
          validFilepath = true;
        }
      }

      if (isExternal) {
        // get object key
        const key = metaFilePath.slice(3);

        // check if the option element has a file exension
        const fileExtension = extension(metaFilePath);
        if ( fileExtension ) {
          if ( fileExtension === ".json" || fileExtension === ".yaml" || fileExtension === ".yml") {
            // to temp meta object
            const allMetadata = metalsmith.metadata();

            // get the data from file
            const extFilePromise = readFile(path.join(metalsmith._directory, key))
              .then(fileBuffer => {

                allPromises.push(extFilePromise);
                allPromiseNames.push("extFilePromise");
                
                allMetadata[option] = JSON.parse(fileBuffer.toString());
                
              }).catch(error => {
                console.error(error.message);
                process.exit(1);
              });
            
            console.log(`External File Promise: ${extFilePromise}`);
            console.log(typeof extFilePromise); 
              

            
            // indicate filepath is valid
            validFilepath = true;
          } 
        } else {
          // assume this is a directory, all files content will be turned into a array member
          const directoryPath = path.join(metalsmith._directory, key);
          // to temp meta object
          const allMetadata = metalsmith.metadata();

          const readdirPromise = readdir(directoryPath) 
            .then (metaFileNames => {
              const getFilesPromise = Promise.all(metaFileNames.map(file => {
                return readFile(path.join(directoryPath, file));
              }))
              .then(fileBuffers => {

                allPromises.push(getFilesPromise);
                allPromiseNames.push("getFilesPromise");
                
                const groupMetadata = [];
                fileBuffers.forEach(fileBuffer => {
                  groupMetadata.push(JSON.parse(fileBuffer.toString())); 
                })
                if (groupMetadata.length) {
                  allMetadata[option] = groupMetadata;
                }
                else {
                  console.log(`No files found in this directory "${key}"`);
                }
              })
              .catch(error => {
                  console.error(error.message);
                  process.exit(1);
                });

              
              
  
            });
            
          allPromises.push(readdirPromise);
          allPromiseNames.push("readdirPromise");
          // indicate filepath is valid
          validFilepath = true;
        }
      }

      if (!validFilepath) {
        const error = `${metaFilePath} is not a valid meta file path. Path must be relative to Metalsmith root`;
        done(error);
      }
    });

    /*
    console.log("before promise");
    console.log(allPromises);
    console.log(allPromiseNames);

    Promise.allSettled(allPromises).then((result) => {
      console.log("in promise");
      console.log(result);
      console.log(allPromises);
      console.log(allPromiseNames);
      done();
    });
    */
    

    
    setTimeout(() => {
      console.log("in timeout");
      console.log(allPromises);
      console.log(allPromiseNames);
      done();
    }, 5);
    
  };
}

module.exports = initMetameta;

/*

5ms delay in a timeout before invoking done() works.

Some promises seem to be double?

*/