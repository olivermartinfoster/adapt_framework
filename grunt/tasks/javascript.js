module.exports = function(grunt) {

  const convertSlashes = /\\/g;

  function escapeRegExp(string) {
    return string.replace(/[.*+\-?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
  }

  const path = require('path');
  const fs = require('fs-extra');
  const rollup = require('rollup');
  const { babel, getBabelOutputPlugin } = require('@rollup/plugin-babel');
  const { nodeResolve } = require('@rollup/plugin-node-resolve');
  const json = require('@rollup/plugin-json');
  const commonjs = require('@rollup/plugin-commonjs');
  const replace = require('@rollup/plugin-replace');
  const { deflate, unzip, constants } = require('zlib');

  const cwd = process.cwd().replace(convertSlashes, '/') + '/';
  const isDisableCache = process.argv.includes('--disable-cache');
  let cache;

  const extensions = ['.js', '.jsx'];

  const restoreCache = async (cachePath, basePath) => {
    if (isDisableCache || cache || !fs.existsSync(cachePath)) return;
    await new Promise((resolve, reject) => {
      const buffer = fs.readFileSync(cachePath);
      unzip(buffer, (err, buffer) => {
        if (err) {
          console.error('An error occurred restoring rollup cache:', err);
          process.exitCode = 1;
          reject(err);
          return;
        }
        let str = buffer.toString();
        // Restore cache to current basePath
        str = str.replace(/%%basePath%%/g, basePath);
        cache = JSON.parse(str);
        resolve();
      });
    });
  };

  const checkCache = function(invalidate) {
    if (!cache) return;
    const idHash = {};
    const dependents = {};
    const missing = {};
    cache.modules.forEach(mod => {
      const moduleId = mod.id;
      const isRollupHelper = (moduleId[0] === '\u0000');
      if (isRollupHelper) {
        // Ignore as injected rollup module
        return null;
      }
      mod.dependencies.forEach(depId => {
        dependents[depId] = dependents[depId] || [];
        dependents[depId].push(moduleId);
      });
      if (!fs.existsSync(moduleId)) {
        grunt.log.error(`Cache missing file: ${moduleId.replace(cwd, '')}`);
        missing[moduleId] = true;
        return false;
      }
      if (invalidate && invalidate.includes(moduleId)) {
        grunt.log.ok(`Cache skipping file: ${moduleId.replace(cwd, '')}`);
        return false;
      }
      idHash[moduleId] = mod;
      return true;
    });
    Object.keys(missing).forEach(moduleId => {
      if (!dependents[moduleId]) return;
      dependents[moduleId].forEach(depId => {
        if (!idHash[depId]) return;
        grunt.log.ok(`Cache invalidating file: ${depId.replace(cwd, '')}`);
        delete idHash[depId];
      });
    });
    cache.modules = Object.values(idHash);
  };

  const saveCache = async (cachePath, basePath, bundleCache) => {
    if (!isDisableCache) {
      cache = bundleCache;
    }
    await new Promise((resolve, reject) => {
      let str = JSON.stringify(bundleCache);
      // Make cache location agnostic by stripping current basePath
      str = str.replace(new RegExp(escapeRegExp(basePath), 'g'), '%%basePath%%');
      deflate(str, { level: constants.Z_BEST_COMPRESSION }, (err, buffer) => {
        if (err) {
          console.error('An error occurred saving rollup cache:', err);
          process.exitCode = 1;
          reject(err);
          return;
        }
        fs.writeFileSync(cachePath, buffer);
        resolve();
      });
    });
  };

  const logPrettyError = (err, cachePath, basePath) => {
    let hasOutput = false;
    if (err.loc) {
      // Code error
      switch (err.plugin) {
        case 'babel':
          err.frame = err.message.substr(err.message.indexOf('\n') + 1);
          err.message = err.message.substr(0, err.message.indexOf('\n')).slice(2).replace(/^([^:]*): /, '');
          break;
        default:
          hasOutput = true;
          console.log('error', err);
      }
      if (!hasOutput) {
        grunt.log.error(err.message);
        grunt.log.error(`Line: ${err.loc.line}, Col: ${err.loc.column}, File: ${err.id.replace(cwd, '')}`);
        console.log(err.frame);
        hasOutput = true;
      }
    }
    if (!hasOutput) {
      cache = null;
      saveCache(cachePath, basePath, cache);
      console.log(err);
    }
  };

  grunt.registerMultiTask('javascript', 'Compile JavaScript files', async function() {
    const Helpers = require('../helpers')(grunt);
    const buildConfig = Helpers.generateConfigData();
    const isStrictMode = buildConfig.strictMode;
    grunt.log.ok(`Cache disabled (--disable-cache): ${isDisableCache}`);
    grunt.log.ok(`Strict mode (config.json:build.strictMode): ${isStrictMode}`);
    const done = this.async();
    const options = this.options({});
    const isSourceMapped = Boolean(options.generateSourceMaps);
    const basePath = path.resolve(cwd + '/' + options.baseUrl).replace(convertSlashes, '/') + '/';
    await restoreCache(options.cachePath, basePath);
    const pluginsPath = path.resolve(cwd, options.pluginsPath).replace(convertSlashes, '/');

    // Make src/plugins.js to attach the plugins dynamically
    if (!fs.existsSync(pluginsPath)) {
      fs.writeFileSync(pluginsPath, '');
    }

    // Collect all plugin entry points for injection
    const allPluginPaths = [];
    const allPluginNamesIndex = {};
    const includedPluginPaths = [];
    for (let i = 0, l = options.plugins.length; i < l; i++) {
      const src = options.plugins[i];
      grunt.file.expand(src).forEach(function(bowerJSONPath) {
        if (bowerJSONPath === undefined) return;
        const pluginPath = path.dirname(bowerJSONPath);
        const bowerJSON = grunt.file.readJSON(bowerJSONPath);
        if (!bowerJSON.keywords || !bowerJSON.keywords.includes('adapt-plugin')) return;
        if (allPluginNamesIndex[bowerJSON.name]) return;
        allPluginNamesIndex[bowerJSON.name] = true;
        const requireJSRootPath = pluginPath.substr(options.baseUrl.length);
        const requireJSMainPath = path.join(requireJSRootPath, bowerJSON.main);
        const ext = path.extname(requireJSMainPath);
        const requireJSMainPathNoExt = requireJSMainPath.slice(0, -ext.length).replace(convertSlashes, '/');
        allPluginPaths.push(requireJSMainPathNoExt);
        if (!options.pluginsFilter(src)) return;
        includedPluginPaths.push(requireJSMainPathNoExt);
      });
    }
    const allPluginNames = Object.keys(allPluginNamesIndex);
    const allPluginGlobs = allPluginNames.map(name => `**/${name}/**/*`);

    // Collect react templates
    const reactTemplatePaths = [];
    options.reactTemplates.forEach(pattern => {
      grunt.file.expand({
        filter: options.pluginsFilter
      }, pattern).forEach(templatePath => reactTemplatePaths.push(templatePath.replace(convertSlashes, '/')));
    });

    // Process remapping and external model configurations
    const mapParts = Object.keys(options.map);
    const externalParts = Object.keys(options.external);

    const findFile = function(filename) {
      filename = filename.replace(convertSlashes, '/');
      const hasValidExtension = extensions.includes(path.parse(filename).ext);
      if (!hasValidExtension) {
        const ext = extensions.find(ext => fs.existsSync(filename + ext)) || '';
        filename += ext;
      }
      return filename;
    };

    const umdImports = options.umdImports.map(filename => findFile(path.resolve(basePath, filename)));

    // Rework modules names and inject plugins
    const adaptLoader = function() {
      return {

        name: 'adaptLoader',

        resolveId(moduleId, parentId) {
          const resolve = () => {
            const isRollupHelper = (moduleId[0] === '\u0000');
            if (isRollupHelper) {
              // Ignore as injected rollup module
              return null;
            }
            // Drop any absolute front
            moduleId = moduleId.startsWith(basePath) ? moduleId.slice(basePath.length) : moduleId;
            // Remap module, usually coreJS/adapt to core/js/adapt etc
            const mapPart = mapParts.find(part => moduleId.startsWith(part));
            if (mapPart) {
              moduleId = moduleId.replace(mapPart, options.map[mapPart]);
            }
            const isRelative = (moduleId[0] === '.');
            if (isRelative) {
              if (!parentId) {
                // Rework app.js path so that it can be made basePath agnostic in the cache
                const filename = findFile(path.resolve(moduleId));
                return {
                  id: filename,
                  external: false
                };
              }
              // Rework relative paths into absolute ones
              const filename = findFile(path.resolve(parentId + '/../' + moduleId));
              return {
                id: filename,
                external: false
              };
            }
            const externalPart = externalParts.find(part => moduleId.startsWith(part));
            const isEmpty = (options.external[externalPart] === 'empty:');
            if (isEmpty) {
              // External module as is defined as 'empty:', libraries/ bower handlebars etc
              return {
                id: moduleId,
                external: true
              };
            }
            const isES6Import = !fs.existsSync(moduleId);
            if (isES6Import) {
              // ES6 imports start inside ./src so need correcting
              const filename = findFile(path.resolve(cwd, options.baseUrl, moduleId));
              return {
                id: filename,
                external: false
              };
            }
            // Normalize all other absolute paths as conflicting slashes will load twice
            const filename = findFile(path.resolve(cwd, moduleId));
            return {
              id: filename,
              external: false
            };
          };
          const node = resolve();
          if (!node) return node;
          if (!node.external && !fs.existsSync(findFile(node.id))) {
            const attemptCustom = findFile(node.id.replace(basePath, `${basePath}custom/`));
            const isInCustom = fs.existsSync(attemptCustom);
            const attemptNodeModules = findFile(node.id.replace(basePath, `${basePath}node_modules/`));
            const isInNodeModules = fs.existsSync(attemptNodeModules);
            if (!isInCustom && !isInNodeModules) {
              console.log(`Could not find ${node.id}`);
            } else if (isInCustom) {
              node.id = attemptCustom;
            } else if (isInNodeModules) {
              node.id = attemptNodeModules;
              if (fs.statSync(node.id).isDirectory()) {
                // Assume this is a library node_module
                return null;
              }
            }
          }
          return node;
        }

      };
    };

    const adaptInjectPlugins = function() {
      return {

        name: 'adaptInjectPlugins',

        transform(code, moduleId) {
          const isRollupHelper = (moduleId[0] === '\u0000');
          if (isRollupHelper) {
            return null;
          }
          const isPlugins = (moduleId.includes('/' + options.pluginsModule + '.js'));
          if (!isPlugins) {
            return null;
          }
          // Dynamically construct plugins.js with plugin dependencies
          code = `${includedPluginPaths.concat(reactTemplatePaths).map(filename => {
            const isCore = (filename.replace(convertSlashes, '/').includes(options.name));
            if (isCore) return null;
            return `import "${filename}";\n`;
          }).join('')}`;
          return code;
        }

      };
    };

    const inputOptions = {
      input: './' + options.baseUrl + options.name,
      shimMissingExports: true,
      plugins: [
        adaptLoader({}),
        adaptInjectPlugins({}),
        nodeResolve({
          browser: true
        }),
        replace({
          preventAssignment: true,
          'process.env.NODE_ENV': JSON.stringify('production')
        }),
        commonjs({
          include: ['**'],
          exclude: allPluginGlobs
        }),
        json(),
        babel({
          babelHelpers: 'bundled',
          extensions,
          minified: false,
          compact: false,
          comments: true,
          retainLines: true,
          presets: [
            [
              '@babel/preset-react',
              {
                runtime: 'classic'
              }
            ],
            [
              '@babel/preset-env'
            ]
          ],
          plugins: [
            [
              'transform-amd-to-es6',
              {
                amdToES6Modules: true,
                amdDefineES6Modules: true,
                ignoreNestedRequires: true,
                defineFunctionName: '__AMD',
                defineModuleId: (moduleId) => moduleId.replace(convertSlashes, '/').replace(basePath, '').replace('.js', ''),
                includes: allPluginGlobs,
                excludes: [
                  '**/templates/**/*.jsx'
                ]
              }
            ],
            [
              'transform-react-templates',
              {
                includes: [
                  '**/templates/**/*.jsx'
                ],
                importRegisterFunctionFromModule: path.resolve(basePath, 'core/js/reactHelpers.js').replace(convertSlashes, '/'),
                registerFunctionName: 'register',
                registerTemplateName: (moduleId) => path.parse(moduleId).name
              }
            ]
          ]
        })
      ],
      cache
    };

    const umdImport = () => {
      return umdImports.map(filename => {
        let code = fs.readFileSync(filename).toString();
        code = code.replace(`define.amd`, 'define.noop');
        return code;
      }).join('\n');
    };

    const outputOptions = {
      file: options.out,
      format: 'amd',
      plugins: [
        !isSourceMapped && getBabelOutputPlugin({
          minified: true,
          compact: true,
          comments: false,
          retainLines: false,
          allowAllFormats: true
        }),
        isSourceMapped && getBabelOutputPlugin({
          minified: false,
          compact: false,
          comments: true,
          retainLines: true,
          allowAllFormats: true
        })
      ].filter(Boolean),
      intro: umdImport(),
      footer: `// Allow ES export default to be exported as amd modules
window.__AMD = function(id, value) {
  window.define(id, function() { return value; }); // define for external use
  window.require([id]); // force module to load
  return value; // return for export
};`,
      sourcemap: isSourceMapped,
      sourcemapPathTransform: (relativeSourcePath) => {
        // Rework sourcemap paths to overlay at the appropriate root
        return relativeSourcePath.replace(convertSlashes, '/').replace('../' + options.baseUrl, options.baseUrl);
      },
      amd: {
        define: 'require'
      },
      strict: isStrictMode
    };

    try {
      checkCache([pluginsPath]);
      const bundle = await rollup.rollup(inputOptions);
      await saveCache(options.cachePath, basePath, bundle.cache);
      await bundle.write(outputOptions);
    } catch (err) {
      logPrettyError(err, options.cachePath, basePath);
    }

    // Remove old sourcemap if no longer required
    if (!isSourceMapped && fs.existsSync(options.out + '.map')) {
      fs.unlinkSync(options.out + '.map');
    }

    done();

  });
};
