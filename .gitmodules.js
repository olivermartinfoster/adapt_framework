const ChildProcess = require("child_process");

const env = Object.assign({}, process.env, {
  Path: `${process.env.Path};${process.env.PROGRAMFILES}\\Git\\mingw64\\libexec\\git-core;`
});

console.log(env.path)

ChildProcess.execSync('git submodule update --init', {
  env,
  stdio: 'inherit'
});
