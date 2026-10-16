import { ChildProcess, type SpawnOptions } from "node:child_process";
import { isAbsolute } from "node:path";
import { PassThrough } from "node:stream";
import { windowsLimitedApi, type NativeHandle } from "./windows-limited-api.js";

const POLL_MS = 10,
  DRAIN_CHUNKS = 8;
const owners = new WeakMap<ChildProcess, () => void>();
export function terminateLimitedChild(child: ChildProcess): boolean {
  const terminate = owners.get(child);
  if (!terminate) return false;
  terminate();
  return true;
}
function quote(arg: string): string {
  return '"' + arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1") + '"';
}
export async function spawnLimitedChild(
  file: string,
  args: string[],
  options: SpawnOptions,
  platform: NodeJS.Platform,
  signal?: AbortSignal,
  stopped: () => boolean = () => false,
): Promise<ChildProcess> {
  if (platform !== "win32") throw Error("Hard process limit unavailable on this platform");
  if (
    !isAbsolute(file) ||
    options.shell ||
    args.some((arg) => arg.includes("\0")) ||
    file.includes("\0")
  )
    throw Error("Hard process limit requires an exact absolute argv executable");
  const command = [file, ...args].map(quote).join(" ");
  if (command.length >= 32767) throw Error("Bounded process command too long");
  const env = Object.entries(options.env ?? process.env)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .sort(([a], [b]) => a.toUpperCase().localeCompare(b.toUpperCase()));
  if (env.some(([key, value]) => key.includes("\0") || value.includes("\0")))
    throw Error("Invalid bounded process environment");
  const api = await windowsLimitedApi();
  const owned = new Set<NativeHandle>();
  const own = (handle: NativeHandle) => {
    owned.add(handle);
    return handle;
  };
  const close = (handle: NativeHandle) => {
    if (owned.delete(handle)) api.close(handle);
  };
  const cleanup = () => {
    for (const handle of [...owned]) close(handle);
  };
  let job: NativeHandle | undefined;
  try {
    job = own(api.createJob());
    const pipe = () => {
      const result = api.pipe();
      own(result.read);
      own(result.write);
      return result;
    };
    const input = pipe(),
      output = pipe(),
      error = pipe();
    api.noInherit(input.write);
    api.noInherit(output.read);
    api.noInherit(error.read);
    signal?.throwIfAborted();
    if (stopped()) throw Error("Bounded process cancelled before start");
    const started = api.start(
      job,
      file,
      Buffer.from(command + "\0", "utf16le"),
      Buffer.from(env.map(([key, value]) => `${key}=${value}`).join("\0") + "\0\0", "utf16le"),
      options.cwd?.toString(),
      [input.read, output.write, error.write],
    );
    own(started.process);
    close(input.read);
    close(input.write);
    close(output.write);
    close(error.write);
    const child = new ChildProcess();
    Object.defineProperty(child, "pid", { value: started.pid });
    const stdout = new PassThrough(),
      stderr = new PassThrough();
    child.stdin = null;
    child.stdout = stdout;
    child.stderr = stderr;
    let settled = false,
      exitObserved = false;
    const terminate = () => {
      if (!settled) api.terminate(job!);
    };
    owners.set(child, terminate);
    child.kill = () => {
      terminate();
      return true;
    };
    const streams = [
      { handle: output.read, stream: stdout, eof: false },
      { handle: error.read, stream: stderr, eof: false },
    ];
    const timer = setInterval(() => {
      if (settled) return;
      try {
        const code = api.pollExit(started.process);
        if (code !== undefined && !exitObserved) {
          exitObserved = true;
          Object.defineProperty(child, "exitCode", { value: code });
          child.emit("exit", code, null);
        }
        for (const entry of streams) {
          if (entry.eof) continue;
          for (let i = 0; i < DRAIN_CHUNKS; i++) {
            const bytes = api.read(entry.handle);
            if (bytes === null) {
              entry.eof = true;
              entry.stream.end();
              close(entry.handle);
              break;
            }
            if (bytes.length === 0) break;
            entry.stream.write(bytes);
          }
        }
        if (exitObserved && streams.every((entry) => entry.eof)) {
          settled = true;
          clearInterval(timer);
          cleanup();
          child.emit("close", child.exitCode, null);
        }
      } catch (error) {
        // 观测失败仍先终止唯一 Job；不能把未知退出伪装成已观察的成功。
        terminate();
        settled = true;
        clearInterval(timer);
        cleanup();
        child.emit("error", error);
        child.emit("close", null, null);
      }
    }, POLL_MS);
    return child;
  } catch (error) {
    if (job) api.terminate(job);
    cleanup();
    throw error;
  }
}
