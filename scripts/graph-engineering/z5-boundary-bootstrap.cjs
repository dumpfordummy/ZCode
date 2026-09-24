const { utilityProcess } = require("electron");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const profile = path.resolve(process.env.Z5_GRAPH_BOUNDARY_PROFILE ?? "");
if (
  path.dirname(profile) !== path.join(root, ".tmp") ||
  !/^z1-native-\d+-[a-f0-9]{6}$/.test(path.basename(profile)) ||
  path.resolve(process.env.USERPROFILE ?? "") !== path.join(profile, "home")
)
  throw new Error("Z5 boundary requires this exact fresh synthetic profile.");
const expectedHost = path.join(root, "packages/desktop/out/host/index.js");
const original = utilityProcess.fork;
utilityProcess.fork = function (modulePath, args, options) {
  if (path.resolve(modulePath) !== expectedHost)
    return original.call(this, modulePath, args, options);
  return original.call(this, path.join(__dirname, "z5-boundary-host.cjs"), args, {
    ...options,
    env: {
      ...options.env,
      Z5_GRAPH_BOUNDARY_PROFILE: profile,
      Z5_GRAPH_BOUNDARY_KIND: process.env.Z5_GRAPH_BOUNDARY_KIND,
    },
  });
};
require("./native-bootstrap.cjs");
