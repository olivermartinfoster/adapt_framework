module.exports = {
  dist: {
    src: [
      '<%= sourcedir %>plugins.js',
      '<%= outputdir %>adapt/js/adapt.min.js.map',
      '<%= outputdir %>.cache'
    ]
  },
  output: {
    src: [
      '<%= outputdir %>/*',
      '!<%= outputdir %>.cache'
    ]
  },
  temp: {
    src: [
      '<%= tempdir %>'
    ]
  }
};
