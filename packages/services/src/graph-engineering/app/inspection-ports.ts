import type { GraphWorkspaceTarget } from "../approval-types.js";
import type { GraphInspection } from "../inspection-types.js";
import type { ZCodeRecipeSnapshot } from "@zcode/shared";
export interface GraphInspectionPort {
  read(target: GraphWorkspaceTarget): Promise<GraphInspection[]>;
  write(target: GraphWorkspaceTarget, history: GraphInspection[]): Promise<void>;
  review(
    record: GraphInspection,
  ): Promise<
    Pick<GraphInspection, "request" | "sessionId" | "runtimeIdentity" | "environmentDigest">
  >;
  fresh(record: GraphInspection): Promise<"current" | "source-changed" | "runtime-changed">;
  start(record: GraphInspection): Promise<ZCodeRecipeSnapshot>;
  inspect(record: GraphInspection): Promise<ZCodeRecipeSnapshot>;
  cancel(record: GraphInspection): Promise<ZCodeRecipeSnapshot>;
}

/** Narrow view of the existing Host owner; no second mutable Graph state. */
export interface InspectionOwner {
  options: {
    inspection?: GraphInspectionPort;
    id(): string;
    now(): number;
    monotonic?(): number;
    evidence?: { digest(value: string): string };
  };
  load(target: GraphWorkspaceTarget): Promise<import("./ports.js").GraphRecord>;
  changed: { fire(event: { workspaceKey: string }): void };
}
