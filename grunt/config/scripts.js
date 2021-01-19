module.exports = function(grunt, options) {
  return {
    options: {
      outputdir: '<%= outputdir %>',
      sourcedir: '<%= sourcedir %>',
      plugins: [
        '<%= sourcedir %>node_modules/*/package.json' // TODO: order
      ],
      pluginsFilter: function(filepath) {
        return grunt.config('helpers').includedFilter(filepath) && grunt.config('helpers').scriptSafeFilter(filepath);
      }
    }
  };
};
