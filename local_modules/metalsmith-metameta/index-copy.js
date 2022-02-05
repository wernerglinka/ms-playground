/* eslint-disable */
const fs = require('fs');
const path = require('path');
const extension = path.extname;
const async = require("async");

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
    setImmediate(done);

    const allMetadata = metalsmith.metadata()

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
        let metadata;

        // check if the option element has a file exension
        const fileExtension = extension(metaFilePath);
        if ( fileExtension ) {
          if ( fileExtension === ".json" || fileExtension === ".yaml" || fileExtension === ".yml") {
            // get the data from file
            try {
              metadata = fs.readFileSync(path.join(metalsmith._directory, key), 'utf8')
            } catch (err) {
              console.error(err)
            }

            // to temp meta object
            allMetadata[option] = JSON.parse(metadata);
            
            // indicate filepath is valid
            validFilepath = true;
          } 
        } else {
          // assume this is a directory, all files content will be turned into a array member
          const directoryPath = path.join(metalsmith._directory, key);

          fs.readdir(directoryPath, function (err, metaFiles) {
            //handling error
            if (err) {
                return console.log('Unable to scan external meta directory: ' + err);
            } 

            const groupMetadata = [];
            //listing all files using forEach
            async.forEach(metaFiles, function (metaFile, callback) {
          
              try {
                metadata = fs.readFileSync(path.join(directoryPath, metaFile), 'utf8')
              } catch (err) {
                console.error(err)
              }
              groupMetadata.push(JSON.parse(metadata));

              callback();
            });

            if (groupMetadata.length) {
              allMetadata[option] = groupMetadata;
            }
            else {
              console.log(`No files found in this directory "${key}"`);
            }

            

        });

          // indicate filepath is valid
          validFilepath = true;
        }
      }

      if (!validFilepath) {
        const error = `${metaFilePath} is not a valid meta file path. Path must be relative to Metalsmith root`
        done(error)
      }
      
    }); 

    console.log(metalsmith.metadata());
  };
}

module.exports = initMetameta;