const Metalsmith = require('metalsmith');
const assets = require('metalsmith-assets');
const drafts = require('@metalsmith/drafts');
const metadata = require('@metalsmith/metadata');
const layouts = require('@metalsmith/layouts');
const inplace = require('metalsmith-in-place');
const permalinks = require('@metalsmith/permalinks');
const writeMetadata = require('metalsmith-writemetadata');

// const blogLists = require("../local_modules/metalsmith-blog-lists");
const blogLists = require("metalsmith-blog-lists");


const marked = require('marked');

const CaptureTag = require('nunjucks-capture');

const util = require('gulp-util');

// functions to extend Nunjucks environment
const toUpper = string => string.toUpperCase();
const spaceToDash = string => string.replace(/\s+/g, '-');
const condenseTitle = string => string.toLowerCase().replace(/\s+/g, '');
const UTCdate = date => date.toUTCString("M d, yyyy");
const blogDate = date => date.toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
const trimSlashes = string => string.replace(/(^\/)|(\/$)/g, "");
const md = (mdString) => {
  try {
    return marked.parse(mdString);
  } catch (e) {
    console.error('Error parsing markdown:', e);
    return mdString;
  }
}

// get working directory
// workingDir is a child of "__dirname"
// since metalsmith is executed in a directory of the base directory
// we reference the root directory. same behavior as if metalsmith would be 
// executed in the root.
const path = require('path');
const workingDir = path.join(__dirname, '../');

//const monitor = require('../local_modules/metalsmith-monitor');
//const getExternalPages = require('../local_modules/wp-pages');
//const getExternalPagesGraphQL = require('../local_modules/wp-graphql-pages');

const mdPartials = require('metalsmith-markdown-partials');
const metameta = require('../local_modules/metalsmith-metameta');

// Define engine options for the inplace and layouts plugins
const templateConfig = {
  engineOptions: {
    path: [`${workingDir}/layouts`, `${workingDir}/src/sources/assets/icons`],
    filters: {
      toUpper,
      spaceToDash,
      condenseTitle,
      UTCdate,
      blogDate,
      trimSlashes,
      md,
    },
    extensions: {
      CaptureTag: new CaptureTag(),
    },
  },
};

/**
 *  Function to implement the Metalsmith build process
 */
module.exports = function metalsmith(callback) {
  console.log('Building site with metalsmith ************************');

  Metalsmith(workingDir)
    .source('./src/content')
    .destination('./build')
    .clean(true)
    .metadata({
      buildDate: new Date(),
    })

    .use(metameta({
      site: "./src/content/data/siteMetadata.json",
      localJsonTest: "./src/content/data/json-test.json",
      localYamlTest: "./src/content/data/yaml-test.yaml",
      localTomlTest: "./src/content/data/toml-test.toml",
      localMixedFolder: "./src/content/data/local-folder-mixed",
      extMixedFolder: "./external-data/ext-folder-mixed",
      extJsonTest: "./external-data/ext-json-test.json",
      extTomlTest: "./external-data/ext-toml-test.toml"
    }))
    
    //.use(metameta())

    .use(drafts())

    /*
    .use(blogLists({
      latestQuantity: 4,
      featuredQuantity: 3,
      featuredPostSortOrder: "asc",
      fileExtension: ".md.njk",
      blogDirectoryName: "blog"
    }))
    */
   
    /*
    .use(mdPartials({
      libraryPath: './src/content/markdown-partials/',
      fileSuffix: '.md.njk',
    }))
    */

    .use(inplace(templateConfig))

    .use(permalinks())

    // layouts MUST come after permalinks so the template has access to the "path" variable
    .use(layouts(templateConfig))

    

    .use(
      assets({
        source: './src/assets/',
        destination: './assets/',
      })
    )

    
    // Show all metadata for each page in console
    // Used for Debug only
    //.use(monitor())

    // Generate a metadata json file for each page
    // Used for Debug only
    .use(
      writeMetadata({
        pattern: ['**/*.html'],
        ignorekeys: ['next', 'contents', 'previous'],
        bufferencoding: 'utf8',
      })
    )

    .build(err => {
      if (err) {
        throw err;
      }
      callback();
    });
};
