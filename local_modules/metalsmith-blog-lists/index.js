const debug = require('debug')('metalsmith-blog-lists');
const path = require('path');

/**
 * @typedef Options
 * @property {String} key
 */

/** @type {Options} */
const defaults = {
  latestQuantity: 3,
  featuredQuantity: 3,
  featuredPostSortOrder: "desc",
  fileExtension: ".md",
  blogDirectoryName: "./blog"
}

/**
 * Normalize plugin options
 * @param {Options} [options]
 * @returns {Object}
 */
function normalizeOptions(options) {
  return Object.assign({}, defaults, options || {})
}

function doSomething(file, path) {
  file.path = path
  return file
}

/**
 * A Metalsmith plugin to add various blog lists to metadata
 *
 * @param {Options} options
 * @returns {import('metalsmith').Plugin}
 */
function initBlogLists(options) {
  options = normalizeOptions(options)

  return function blogLists(files, metalsmith, done) {
    
    let latestBlogPosts = [];
    const featuredBlogPosts = [];
    const allSortedBlogPosts = [];
    const annualizedBlogPosts = [];
    let temp;

    Object.keys(files).forEach(function(file){
      const thisFile = files[file];
      
      const isBlogPostFileType = file.endsWith(options.fileExtension);

      // we only look at blog post
      if ((file.indexOf(options.blogDirectoryName) !== -1) && isBlogPostFileType) {
        const filePath = file.replace(options.fileExtension, "");

        // assemble a sorted all blogs list
        // this list may be used when the whole list of blog posts is needed to
        // create a context influenced list like showing all other posts by
        // a particular author when we show a blog post.
        temp = {
            "title":  thisFile.blogTitle || thisFile.title,
            "date":   new Date(thisFile.date),
            "author": thisFile.author,
            "path":   filePath,
            "image":  thisFile.image,
            "order":  thisFile.featuredBlogpostOrder
        }
        allSortedBlogPosts.push(temp);

        // create the featured blog posts array
        // requires:
        //    featuredBlogpost: true
        //    featuredBlogpostOrder: <integer>
        //    featuredPostSortOrder: "asc" | "desc"
        // to be set in the files frontmatter
        if ( thisFile.featuredBlogpost ) {
          featuredBlogPosts.push(temp);
        }
      }
    });

    // arrays are build, now sort them
    allSortedBlogPosts.sort(function(a,b) {
      return a.date.getTime() - b.date.getTime();
    });

    featuredBlogPosts.sort(function(a,b) {
      return a.order - b.order;
    });
    if (options.featuredPostSortOrder === 'desc') {
        featuredBlogPosts.reverse();
    }
    featuredBlogPosts.splice(options.featuredQuantity);

    // create the yearly archive list from array allSortedBlogPosts
    // get the year from the blog date
    const blogYears = [];
    allSortedBlogPosts.forEach(function(post, index) {
        const d = new Date(post.date);
        // we use getUTCFullYear so a January 1 date will attributed to the correct year
        postYear = d.getUTCFullYear().toString();
        // build year array
        blogYears.push(postYear);
    });

    const yearArrayKeys = new Set(blogYears);
    yearArrayKeys.forEach(function(year) {
      const temp = [];
      allSortedBlogPosts.forEach(function(post, index) {
        const d = new Date(post.date);
        // we use getUTCFullYear so a January 1 date will attributed to the correct year
        postYear = d.getUTCFullYear().toString();
        // check if this post is in this year
        if ( year === postYear) {
          temp.push(post);
        }
      });
      annualizedBlogPosts.push({
        "year": year,
        "posts": temp
      });
    });

    // sort unsortedAnnualizedBlogPosts by newest year first
    annualizedBlogPosts.sort(function(a, b) {
      a = a.year;
      b = b.year;
      return a > b ? -1 : (a < b ? 1 : 0);
    });

    // create the latest blog posts array
    latestBlogPosts = allSortedBlogPosts.reverse().slice(0, options.latestQuantity);

    // Add to metalsmith.metadata for global access
    const metadata = metalsmith.metadata();
    metadata['latestBlogPosts'] = latestBlogPosts;
    metadata['featuredBlogPosts'] = featuredBlogPosts;
    metadata['allSortedBlogPosts'] = allSortedBlogPosts;
    metadata['annualizedBlogPosts'] = annualizedBlogPosts;

    // update metadata
    metalsmith.metadata(metadata);

    done();
    }
}

module.exports = initBlogLists
