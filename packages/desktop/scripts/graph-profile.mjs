import path from "node:path";

/** Pure profile mapping, also used by the packaged-app acceptance harness. */
export function createGraphProfile(originalHome, env = {}) {
  const previous = env.ZCODE_GRAPH_PROFILE_ROOT;
  const root =
    previous &&
    path.isAbsolute(previous) &&
    path.basename(previous) === ".zcode-graph-engineering" &&
    path.resolve(originalHome) === path.join(previous, "home")
      ? previous
      : path.join(path.resolve(originalHome), ".zcode-graph-engineering");
  const home = path.join(root, "home");
  return {
    root,
    env: {
      ZCODE_GRAPH_PROFILE_ROOT: root,
      HOME: home,
      USERPROFILE: home,
      APPDATA: path.join(root, "appdata"),
      LOCALAPPDATA: path.join(root, "localappdata"),
      ZCODE_HOME: path.join(home, ".zcode"),
      ZCODE_STORAGE_DIR: path.join(home, ".zcode"),
      ZCODE_DATA_BASE_DIR: home,
      ZCODE_DESKTOP_HOME_DIR: home,
      ZCODE_DESKTOP_USER_DATA_DIR: path.join(root, "electron"),
      ZCODE_DESKTOP_SESSION_DATA_DIR: path.join(root, "electron", "session"),
    },
  };
}
