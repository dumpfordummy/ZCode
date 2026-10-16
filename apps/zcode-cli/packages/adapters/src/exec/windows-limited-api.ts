import type * as Koffi from "koffi";

export type NativeHandle = object;
const CREATE_SUSPENDED = 0x4,
  CREATE_UNICODE_ENVIRONMENT = 0x400;
const EXTENDED_STARTUPINFO_PRESENT = 0x80000,
  CREATE_NO_WINDOW = 0x8000000;
const STARTF_USESTDHANDLES = 0x100,
  HANDLE_FLAG_INHERIT = 1;
const JOB_ACTIVE_PROCESS = 0x8,
  JOB_KILL_ON_CLOSE = 0x2000;
const JOB_EXTENDED_LIMITS = 9,
  PROC_THREAD_ATTRIBUTE_HANDLE_LIST = 0x20002;
const PROC_THREAD_ATTRIBUTE_JOB_LIST = 0x2000d;
const ERROR_BROKEN_PIPE = 109,
  WAIT_OBJECT_0 = 0,
  WAIT_TIMEOUT = 258;
let cached: ReturnType<typeof load> | undefined;
export function windowsLimitedApi() {
  return (cached ??= load());
}

async function load() {
  const module = await import("koffi");
  const k = ("default" in module ? module.default : module) as typeof Koffi;
  const lib = k.load("kernel32.dll");
  const ptr = "void *",
    dword = "uint32",
    bool = "int32";
  const sa = k.struct({ length: dword, security: ptr, inherit: bool });
  const basic = k.struct({
    processTime: "int64",
    jobTime: "int64",
    flags: dword,
    minWorking: "size_t",
    maxWorking: "size_t",
    active: dword,
    affinity: "uintptr_t",
    priority: dword,
    scheduling: dword,
  });
  const io = k.struct({
    readOps: "uint64",
    writeOps: "uint64",
    otherOps: "uint64",
    readBytes: "uint64",
    writeBytes: "uint64",
    otherBytes: "uint64",
  });
  const limits = k.struct({
    basic,
    io,
    processMemory: "size_t",
    jobMemory: "size_t",
    peakProcess: "size_t",
    peakJob: "size_t",
  });
  const startup = k.struct({
    cb: dword,
    reserved: "str16",
    desktop: "str16",
    title: "str16",
    x: dword,
    y: dword,
    width: dword,
    height: dword,
    xchars: dword,
    ychars: dword,
    fill: dword,
    flags: dword,
    show: "uint16",
    reservedBytes: "uint16",
    reservedPtr: ptr,
    stdin: ptr,
    stdout: ptr,
    stderr: ptr,
  });
  const startupEx = k.struct({ startup, attributes: ptr });
  const pi = k.struct({ process: ptr, thread: ptr, pid: dword, tid: dword });
  const fn = (name: string, result: Koffi.TypeSpec, args: Koffi.TypeSpec[]) =>
    lib.func("__stdcall", name, result, args);
  const lastError = fn("GetLastError", dword, []);
  const close = fn("CloseHandle", bool, [ptr]);
  const createJob = fn("CreateJobObjectW", ptr, [ptr, "str16"]);
  const setJob = fn("SetInformationJobObject", bool, [ptr, dword, k.pointer(limits), dword]);
  const terminate = fn("TerminateJobObject", bool, [ptr, dword]);
  const terminateProcess = fn("TerminateProcess", bool, [ptr, dword]);
  const createPipe = fn("CreatePipe", bool, [
    k.out(k.pointer(ptr)),
    k.out(k.pointer(ptr)),
    k.pointer(sa),
    dword,
  ]);
  const setHandle = fn("SetHandleInformation", bool, [ptr, dword, dword]);
  const initAttributes = fn("InitializeProcThreadAttributeList", bool, [
    ptr,
    dword,
    dword,
    k.inout(k.pointer("size_t")),
  ]);
  const updateAttributes = fn("UpdateProcThreadAttribute", bool, [
    ptr,
    dword,
    "uintptr_t",
    ptr,
    "size_t",
    ptr,
    ptr,
  ]);
  const deleteAttributes = fn("DeleteProcThreadAttributeList", "void", [ptr]);
  const createProcess = fn("CreateProcessW", bool, [
    "str16",
    ptr,
    ptr,
    ptr,
    bool,
    dword,
    ptr,
    "str16",
    k.pointer(startupEx),
    k.out(k.pointer(pi)),
  ]);
  const resume = fn("ResumeThread", dword, [ptr]);
  const peek = fn("PeekNamedPipe", bool, [ptr, ptr, dword, ptr, k.out(k.pointer(dword)), ptr]);
  const read = fn("ReadFile", bool, [ptr, ptr, dword, k.out(k.pointer(dword)), ptr]);
  const wait = fn("WaitForSingleObject", dword, [ptr, dword]);
  const exitCode = fn("GetExitCodeProcess", bool, [ptr, k.out(k.pointer(dword))]);
  const requireOk = (ok: unknown, operation: string) => {
    if (!ok) throw Error(`Bounded process ${operation} failed (${lastError()})`);
  };
  return {
    close(handle: NativeHandle) {
      requireOk(close(handle), "close");
    },
    createJob() {
      const job = createJob(null, null) as NativeHandle;
      requireOk(job, "create job");
      try {
        requireOk(
          setJob(
            job,
            JOB_EXTENDED_LIMITS,
            {
              basic: {
                processTime: 0,
                jobTime: 0,
                flags: JOB_ACTIVE_PROCESS | JOB_KILL_ON_CLOSE,
                minWorking: 0,
                maxWorking: 0,
                active: 1,
                affinity: 0,
                priority: 0,
                scheduling: 0,
              },
              io: {
                readOps: 0,
                writeOps: 0,
                otherOps: 0,
                readBytes: 0,
                writeBytes: 0,
                otherBytes: 0,
              },
              processMemory: 0,
              jobMemory: 0,
              peakProcess: 0,
              peakJob: 0,
            },
            k.sizeof(limits),
          ),
          "set job limits",
        );
        return job;
      } catch (error) {
        close(job);
        throw error;
      }
    },
    pipe() {
      const r = [null],
        w = [null];
      requireOk(createPipe(r, w, { length: k.sizeof(sa), security: null, inherit: 1 }, 0), "pipe");
      return { read: r[0] as unknown as NativeHandle, write: w[0] as unknown as NativeHandle };
    },
    noInherit(handle: NativeHandle) {
      requireOk(setHandle(handle, HANDLE_FLAG_INHERIT, 0), "pipe inheritance");
    },
    start(
      job: NativeHandle,
      file: string,
      command: Buffer,
      env: Buffer,
      cwd: string | undefined,
      handles: NativeHandle[],
    ) {
      const size = [0];
      initAttributes(null, 2, 0, size);
      if (!size[0] || size[0] > 65536) throw Error("Bounded process attribute size invalid");
      const attributes = Buffer.alloc(size[0]);
      requireOk(initAttributes(attributes, 2, 0, size), "initialize attributes");
      const handleList = Buffer.alloc(k.sizeof(ptr) * handles.length);
      k.encode(handleList, k.array(ptr, handles.length), handles);
      const jobList = Buffer.alloc(k.sizeof(ptr));
      k.encode(jobList, k.array(ptr, 1), [job]);
      const info = {
        process: null as NativeHandle | null,
        thread: null as NativeHandle | null,
        pid: 0,
        tid: 0,
      };
      try {
        requireOk(
          updateAttributes(
            attributes,
            0,
            PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
            handleList,
            handleList.length,
            null,
            null,
          ),
          "restrict handles",
        );
        requireOk(
          updateAttributes(
            attributes,
            0,
            PROC_THREAD_ATTRIBUTE_JOB_LIST,
            jobList,
            jobList.length,
            null,
            null,
          ),
          "atomic job ownership",
        );
        requireOk(
          createProcess(
            file,
            command,
            null,
            null,
            1,
            CREATE_SUSPENDED |
              CREATE_UNICODE_ENVIRONMENT |
              EXTENDED_STARTUPINFO_PRESENT |
              CREATE_NO_WINDOW,
            env,
            cwd ?? null,
            {
              startup: {
                cb: k.sizeof(startupEx),
                reserved: null,
                desktop: null,
                title: null,
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                xchars: 0,
                ychars: 0,
                fill: 0,
                flags: STARTF_USESTDHANDLES,
                show: 0,
                reservedBytes: 0,
                reservedPtr: null,
                stdin: handles[0],
                stdout: handles[1],
                stderr: handles[2],
              },
              attributes,
            },
            info,
          ),
          "create suspended",
        );
        // 必须先加入限额 Job 再恢复线程；spawn 后附加会允许项目在限额生效前派生子进程。
        // 创建时原子加入 Job，避免创建后、附加前宿主崩溃留下悬挂孤儿。
        requireOk(resume(info.thread) !== 0xffffffff, "resume");
        return { process: info.process!, pid: info.pid };
      } catch (error) {
        if (info.process) {
          terminateProcess(info.process, 1);
          wait(info.process, 5000);
          close(info.process);
        }
        throw error;
      } finally {
        if (info.thread) close(info.thread);
        deleteAttributes(attributes);
      }
    },
    terminate(job: NativeHandle) {
      requireOk(terminate(job, 1), "terminate job");
    },
    pollExit(process: NativeHandle): number | undefined {
      const state = wait(process, 0);
      if (state === WAIT_TIMEOUT) return undefined;
      if (state !== WAIT_OBJECT_0) throw Error("Bounded process wait failed");
      const code = [0];
      requireOk(exitCode(process, code), "exit status");
      return code[0];
    },
    read(handle: NativeHandle): Buffer | null {
      const available = [0];
      if (!peek(handle, null, 0, null, available, null)) {
        if (lastError() === ERROR_BROKEN_PIPE) return null;
        throw Error("Bounded process output observation failed");
      }
      if (!available[0]) return Buffer.alloc(0);
      const bytes = Buffer.alloc(Math.min(available[0], 65536)),
        count = [0];
      requireOk(read(handle, bytes, bytes.length, count, null), "read output");
      return bytes.subarray(0, count[0]);
    },
  };
}
