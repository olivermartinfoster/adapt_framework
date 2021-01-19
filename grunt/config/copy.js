module.exports = function(grunt, options) {

  var _ = require('underscore');

  var getUnixPath = function(filepath) {
    // convert to unix style slashes
    return filepath.replace(/\\/g, '/');
  };

  var collate = function(collateAtFolderName, destFolder, srcFileName) {
    destFolder = getUnixPath(destFolder);
    srcFileName = getUnixPath(srcFileName);

    // ignore if the srcFileName ends with the collateAtFolderName
    var nameParts = srcFileName.split('/');
    if (nameParts[nameParts.length - 1] === collateAtFolderName) {
      return destFolder;
    }

    var startOfCollatePath = srcFileName.indexOf(collateAtFolderName) + collateAtFolderName.length + 1;
    var collatedFilePath = destFolder + srcFileName.substr(startOfCollatePath);

    return collatedFilePath;
  };

  var mandatoryTasks = {
    assets: {
      files: [
        {
          expand: true,
          src: ['node_modules/*/assets/**'], // TODO: order ['core/assets/**', 'components/**/assets/**', 'extensions/**/assets/**', 'menu/<%= menu %>/assets/**', 'theme/<%= theme %>/assets/**'],
          cwd: '<%= sourcedir %>',
          dest: '<%= outputdir %>assets/',
          filter: function(filepath) {
            return grunt.config('helpers')
              .includedFilter(filepath);
          },
          rename: _.partial(collate, 'assets')
        }
      ]
    },
    fonts: {
      files: [
        {
          expand: true,
          src: ['node_modules/*/fonts/**'], // TODO: order ['core/fonts/**', 'components/**/fonts/**', 'extensions/**/fonts/**', 'menu/<%= menu %>/fonts/**', 'theme/<%= theme %>/fonts/**'],
          cwd: '<%= sourcedir %>',
          dest: '<%= outputdir %>fonts/',
          filter: function(filepath) {
            return grunt.config('helpers')
              .includedFilter(filepath);
          },
          rename: _.partial(collate, 'fonts')
        }
      ]
    },
    libraries: {
      files: [
        {
          expand: true,
          src: ['node_modules/*/libraries/**'], // TODO: order ['core/libraries/**/*', 'components/**/libraries/**/*', 'extensions/**/libraries/**/*', 'menu/<%= menu %>/libraries/**/*', 'theme/<%= theme %>/libraries/**/*'],
          cwd: '<%= sourcedir %>',
          dest: '<%= outputdir %>libraries/',
          filter: function(filepath) {
            return grunt.config('helpers')
              .includedFilter(filepath);
          },
          rename: _.partial(collate, 'libraries')
        }
      ]
    },
    required: {
      files: [
        {
          expand: true,
          src: ['node_modules/*/required/**'], // TODO: order ['core/required/**/*', 'components/**/required/**/*', 'extensions/**/required/**/*', 'menu/<%= menu %>/required/**/*', 'theme/<%= theme %>/required/**/*'],
          cwd: '<%= sourcedir %>',
          dest: '<%= outputdir %>',
          filter: function(filepath) {
            return grunt.config('helpers')
              .includedFilter(filepath);
          },
          rename: _.partial(collate, 'required')
        }
      ]
    }
  };

  return mandatoryTasks;

};
