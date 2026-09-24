const { utilityProcess } = require("electron");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const profile = path.resolve(process.env.Z3_GRAPH_BOUNDARY_PROFILE ?? "");
if (
  path.dirname(profile) !== path.join(root, ".tmp") ||
  !/^z1-native-\d+-[a-f0-9]{6}$/.test(path.basename(profile)) ||
  path.resolve(process.env.USERPROFILE ?? "") !== path.join(profile, "home")
)
  throw new Error("Z3 boundary requires this exact freshly isolated profile.");
const expectedHost = path.join(root, "packages/desktop/out/host/index.js");
const originalFork = utilityProcess.fork;
utilityProcess.fork = function (modulePath, args, options) {
  if (path.resolve(modulePath) !== expectedHost)
    return originalFork.call(this, modulePath, args, options);
  return originalFork.call(this, path.join(__dirname, "z3-boundary-host.cjs"), args, {
    ...options,
    env: {
      ...options.env,
      Z3_GRAPH_BOUNDARY_PROFILE: profile,
      Z3_GRAPH_BOUNDARY_KIND: process.env.Z3_GRAPH_BOUNDARY_KIND,
    },
  });
};
require("./native-bootstrap.cjs");
