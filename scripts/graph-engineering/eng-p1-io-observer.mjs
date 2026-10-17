import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";

/** Standalone diagnostic process only. API durations overlap; never sum as wall time. */
export function observeFilesystem() {
  let active;
  const restores = [];
  const handles = new Map();
  const wrap = (object, key, label, transform) => {
    const original = object[key];
    const replacement = async function (...args) {
      const current = active;
      const started = performance.now();
      if (current) {
        current.calls[label] = (current.calls[label] ?? 0) + 1;
        current.inFlight++;
        current.peakInFlight = Math.max(current.peakInFlight, current.inFlight);
      }
      try {
        const value = await original.apply(this, args);
        if (current && label === "readFile")
          current.readBytes += typeof value === "string" ? Buffer.byteLength(value) : value.length;
        if (current && label === "handle.read") current.readBytes += value.bytesRead;
        return transform ? transform(value, this, current) : value;
      } catch (error) {
        if (current) current.errors++;
        throw error;
      } finally {
        if (current) {
          current.inFlight--;
          current.apiMs[label] = (current.apiMs[label] ?? 0) + performance.now() - started;
        }
      }
    };
    object[key] = replacement;
    const restore = () => {
      object[key] = original;
    };
    return restore;
  };
  for (const key of ["lstat", "realpath", "readdir", "opendir", "readFile", "stat"])
    restores.push(wrap(fs, key, key));
  restores.push(
    wrap(fs, "open", "open", (handle) => {
      const undo = [wrap(handle, "read", "handle.read"), wrap(handle, "stat", "handle.stat")];
      const stream = handle.createReadStream;
      handle.createReadStream = function (...args) {
        const result = stream.apply(this, args);
        const iterate = result[Symbol.asyncIterator];
        result[Symbol.asyncIterator] = async function* () {
          for await (const chunk of { [Symbol.asyncIterator]: () => iterate.call(this) }) {
            if (active) active.streamBytes += chunk.length;
            yield chunk;
          }
        };
        return result;
      };
      undo.push(() => {
        handle.createReadStream = stream;
      });
      undo.push(
        wrap(handle, "close", "handle.close", (value) => {
          for (const restore of undo) restore();
          handles.delete(handle);
          return value;
        }),
      );
      handles.set(handle, undo);
      return handle;
    }),
  );
  syncBuiltinESMExports();
  return {
    begin() {
      if (active?.inFlight) throw Error("Cannot split a phase with outstanding filesystem calls.");
      active = {
        calls: {},
        apiMs: {},
        readBytes: 0,
        streamBytes: 0,
        errors: 0,
        inFlight: 0,
        peakInFlight: 0,
      };
    },
    end() {
      if (active?.inFlight) throw Error("Cannot end a phase with outstanding filesystem calls.");
      const value = active;
      active = undefined;
      return value;
    },
    restore() {
      active = undefined;
      for (const undo of handles.values()) for (const restore of undo) restore();
      for (const restore of restores.reverse()) restore();
      syncBuiltinESMExports();
    },
  };
}
