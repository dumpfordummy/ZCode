// Z8.3-W1 process-backed stdio recorder between a Host-side client and the real bundled agent (used by w1-admission.ts).
//
// It starts the REAL bundled agent entry from the detached package copy exactly as the Host does (ELECTRON_RUN_AS_NODE,
// `app-server --stdio`) and forwards both directions line by line. It records only protocol METHOD NAMES of Host requests
// plus, for the `runtime/capabilities` response, the bounded capability metadata (protocol identity and method/command/
// feature names). No params, prompts, paths or environment values are written.
//
// Why not put it between the PACKAGED Host and the agent: the existing ZCODE_AGENT_SERVER_COMMAND override is refused by the
// packaged Host ("The configured Agent does not support storage preparation"), and no production bypass was added.
//
// Modes (W1_RECORDER_MODE):
//   record           forward everything unchanged (positive evidence: the response is the agent's own)
//   strip-contract   delete `nativeContract` from the real response (missing capability metadata)
//   wrong-wire       keep the real response but change protocol.v4WireVersion (incompatible metadata)
//   method-missing   answer `runtime/capabilities` with JSON-RPC method-not-found, never asking the agent
//
// strip-contract / wrong-wire / method-missing are synthetic negative fixtures. They are NOT an actual
// historical packaged agent.
const { spawn } = require("node:child_process");
const { appendFileSync } = require("node:fs");

const mode = process.env.W1_RECORDER_MODE || "record";
const logFile = process.env.W1_RECORDER_LOG;
const agentExe = process.env.W1_REAL_AGENT_EXE;
const agentBundle = process.env.W1_REAL_AGENT_BUNDLE;
if (!logFile || !agentExe || !agentBundle) {
  process.stderr.write(
    "w1-agent-recorder: W1_RECORDER_LOG, W1_REAL_AGENT_EXE and W1_REAL_AGENT_BUNDLE are required\n",
  );
  process.exit(2);
}
const write = (event) =>
  appendFileSync(logFile, `${JSON.stringify({ at: Date.now(), ...event })}\n`);
const bounded = (value) =>
  Array.isArray(value) ? value.filter((item) => typeof item === "string").slice(0, 256) : value;

write({ event: "start", mode });
const agent = spawn(agentExe, [agentBundle, "app-server", "--stdio"], {
  cwd: process.cwd(),
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});
agent.on("error", (error) => {
  write({ event: "agent-spawn-error", code: error.code });
  process.exit(3);
});
agent.on("exit", (code, signal) => {
  write({ event: "agent-exit", code, signal });
  process.exit(code ?? 0);
});
agent.stderr.pipe(process.stderr);

const capabilityRequestIds = new Set();
let hostBuffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  hostBuffer += chunk;
  let index;
  while ((index = hostBuffer.indexOf("\n")) >= 0) {
    const line = hostBuffer.slice(0, index);
    hostBuffer = hostBuffer.slice(index + 1);
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      agent.stdin.write(`${line}\n`);
      continue;
    }
    if (typeof message.method === "string") {
      write({ event: "host-to-agent", method: message.method, hasId: message.id !== undefined });
      if (message.method === "runtime/capabilities" && message.id !== undefined) {
        capabilityRequestIds.add(message.id);
        if (mode === "method-missing") {
          write({ event: "synthetic-method-not-found", method: message.method });
          process.stdout.write(
            `${JSON.stringify({ id: message.id, error: { code: -32601, message: "Method not found" } })}\n`,
          );
          continue;
        }
      }
    }
    agent.stdin.write(`${line}\n`);
  }
});
process.stdin.on("end", () => {
  write({ event: "host-stdin-end" });
  agent.stdin.end();
});

let agentBuffer = "";
agent.stdout.setEncoding("utf8");
agent.stdout.on("data", (chunk) => {
  agentBuffer += chunk;
  let index;
  while ((index = agentBuffer.indexOf("\n")) >= 0) {
    const line = agentBuffer.slice(0, index);
    agentBuffer = agentBuffer.slice(index + 1);
    let out = line;
    try {
      const message = JSON.parse(line);
      if (message.id !== undefined && capabilityRequestIds.has(message.id) && "result" in message) {
        capabilityRequestIds.delete(message.id);
        const contract = message.result?.nativeContract;
        write({
          event: "capabilities-response",
          source: "real-bundled-agent",
          mode,
          independentPlanState: message.result?.independentPlanState,
          nativeContractPresent: contract !== undefined,
          protocol: contract?.protocol,
          methods: bounded(contract?.methods),
          commands: bounded(contract?.commands),
          features: bounded(contract?.features),
        });
        if (mode === "strip-contract" && message.result && typeof message.result === "object") {
          delete message.result.nativeContract;
          out = JSON.stringify(message);
          write({
            event: "synthetic-mutation",
            mutation: "nativeContract deleted from the real response",
          });
        } else if (mode === "wrong-wire" && contract?.protocol) {
          contract.protocol.v4WireVersion = (contract.protocol.v4WireVersion ?? 0) + 1000;
          out = JSON.stringify(message);
          write({
            event: "synthetic-mutation",
            mutation: "protocol.v4WireVersion changed in the real response",
          });
        }
      }
    } catch {
      // not JSON: forward unchanged
    }
    process.stdout.write(`${out}\n`);
  }
});
