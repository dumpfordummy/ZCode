import { createHash } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import { atomicWritePrivateTextFile } from "@zcode/shared/node";
import {
  ZCODE_NATIVE_CONTRACT_KEY,
  zcodeNativeContractFeatures,
  zcodeNativeContractSchema,
} from "@zcode/shared";
import type { IZCodeAgentService, IZCodeSessionService } from "../../index.js";
import type { GraphInspectionPort } from "../app/inspection-ports.js";
import type { GraphInspection } from "../inspection-types.js";
import { inspectionHistorySchema } from "../domain/inspection-record.js";
import { workspaceKey } from "../domain/definition.js";
import { evaluateGraphNativeRuntime } from "../domain/native-runtime-contract.js";
const MAX_HISTORY_BYTES = 1024 * 1024;
export function createGraphInspectionPort(options: {
  directory: string;
  agentService: IZCodeAgentService;
  sessionService: IZCodeSessionService;
}): GraphInspectionPort {
  const agent = options.agentService;
  const directory = join(options.directory, "graph-inspections-v1");
  const file = (target: GraphInspection["target"]) =>
    join(directory, createHash("sha256").update(workspaceKey(target)).digest("hex") + ".json");
  const bound = (row: GraphInspection) => {
    if (!row.sessionId || !row.runtimeIdentity)
      throw Error("Original inspection runtime unavailable.");
    return {
      ...row.target,
      sessionId: row.sessionId,
      expectedRuntimeIdentity: row.runtimeIdentity,
    };
  };
  const reviewRequest = (row: GraphInspection, executable: string) => ({
    ...row.selection,
    sessionId: row.sessionId!,
    operationId: row.id,
    executable,
    ...(row.request?.inspection ? { expiresAt: row.request.inspection.expiresAt } : {}),
  });
  return {
    async read(target) {
      let handle;
      try {
        handle = await open(file(target), "r");
        if ((await handle.stat()).size > MAX_HISTORY_BYTES)
          throw Error("Inspection history limit exceeded.");
        const rows = inspectionHistorySchema.parse(JSON.parse(await handle.readFile("utf8")));
        if (rows.some((row) => workspaceKey(row.target) !== workspaceKey(target)))
          throw Error("Inspection workspace identity mismatch.");
        return rows;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
      } finally {
        await handle?.close();
      }
    },
    async write(target, rows) {
      const text = JSON.stringify(inspectionHistorySchema.parse(rows));
      if (Buffer.byteLength(text) > MAX_HISTORY_BYTES)
        throw Error("Inspection history limit exceeded.");
      await mkdir(directory, { recursive: true });
      await atomicWritePrivateTextFile(file(target), text);
    },
    async review(row) {
      const initialized = await options.sessionService.initializeWorkspace({
        ...row.target,
        purpose: "native-recipe",
      });
      if (!initialized.available) throw Error("Native runtime unavailable.");
      const probe = await agent.readRuntimeCapabilities(row.target);
      const raw = probe.supported ? (probe.capabilities as Record<string, unknown>) : undefined;
      const parsed = zcodeNativeContractSchema.safeParse(raw?.[ZCODE_NATIVE_CONTRACT_KEY]);
      if (
        !probe.supported ||
        !evaluateGraphNativeRuntime({ kind: "response", value: raw }).compatible ||
        !parsed.success ||
        !parsed.data.methods.includes("session/recipe/inspectionReview") ||
        !parsed.data.features.includes(
          zcodeNativeContractFeatures.projectConfigurationInspection,
        ) ||
        !parsed.data.features.includes(
          zcodeNativeContractFeatures.projectInspectionHardProcessLimit,
        ) ||
        (row.selection.webProfile &&
          !parsed.data.features.includes(zcodeNativeContractFeatures.projectWebProfileInspection))
      )
        throw Error("Native inspection capability unavailable; no command fallback.");
      const before = await agent.getWorkspaceRuntimeIdentity(row.target);
      const environment = await agent.previewExecutionEnvironment({
        ...row.target,
        executables: ["dotnet"],
      });
      const executable = environment.executables.find(
        (item) => item.executable === "dotnet" && item.status === "available",
      )?.path;
      if (environment.status !== "available" || !executable)
        throw Error("Installed dotnet executable unavailable.");
      const session = await options.sessionService.createSession({
        ...row.target,
        purpose: "native-recipe",
        persistence: "deferred",
        mode: "edit",
      });
      const after = await agent.getWorkspaceRuntimeIdentity(row.target);
      if (before.identity !== after.identity)
        throw Error("Inspection runtime changed during review.");
      const owned = {
        ...row,
        sessionId: session.session.sessionId,
        runtimeIdentity: after.identity,
      };
      const request = await agent.reviewProjectInspection({
        ...bound(owned),
        request: reviewRequest(owned, executable),
      });
      return {
        request,
        sessionId: owned.sessionId,
        runtimeIdentity: owned.runtimeIdentity,
        environmentDigest: environment.configDigest,
      };
    },
    async fresh(row) {
      if ((await agent.getWorkspaceRuntimeIdentity(row.target)).identity !== row.runtimeIdentity)
        return "runtime-changed";
      const environment = await agent.previewExecutionEnvironment({
        ...row.target,
        executables: ["dotnet"],
      });
      if (
        environment.configDigest !== row.environmentDigest ||
        environment.executables.find((item) => item.executable === "dotnet")?.path !==
          row.request?.recipe.executable
      )
        return "source-changed";
      const fresh = await agent.reviewProjectInspection({
        ...bound(row),
        request: reviewRequest(row, row.request!.recipe.executable),
      });
      return JSON.stringify(fresh) === JSON.stringify(row.request) ? "current" : "source-changed";
    },
    start: (row) => agent.startRecipe({ ...bound(row), request: row.request! }),
    inspect: (row) => agent.inspectRecipe({ ...bound(row), operationId: row.id }),
    cancel: (row) => agent.cancelRecipe({ ...bound(row), operationId: row.id }),
  };
}
