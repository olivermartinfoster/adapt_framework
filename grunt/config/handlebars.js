var path = require('path');

module.exports = function(grunt) {
  return {
    compile: {
      options: {
        amd: 'handlebars',
        namespace: 'Handlebars.templates',
        processName: function(filePath) {
          var newFilePath = filePath.split('/');
          newFilePath = newFilePath[newFilePath.length - 1].replace(/\.[^/.]+$/, '');
          return newFilePath;
        },
        partialRegex: /.*/,
        partialsPathRegex: /\/partials\//
      },
      files: [
        {
          src: [
            '<%= sourcedir %>node_modules/**/*.hbs' // TODO: order
          ],
          follow: true,
          dest: '<%= outputdir %>templates.js',
          filter: function(filepath) {
            if (filepath.indexOf(path.join(grunt.config('sourcedir'), 'core')) > -1) {
              // Always include core templates.
              return true;
            }

            return grunt.config('helpers').includedFilter(filepath);
          }
        }
      ]
    }
  };
};
