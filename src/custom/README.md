# custom override plugins

Any plugin placed in src/custom will be included in the build as though it were installed via npm into node_modules.
Plugins with the same package.json:name as a node_modules/ package will override.
Plugins in this folder will not have their dependencies automatically installed.

WARNING: The preference would always be to install a node_module rather than a custom plugin. src/custom is supplied for edge cases only.
