import type { GraphLibraryEntry, GraphLibraryView } from "../workflow-contract.js";
import type {
  GraphNativeSettings,
  GraphSequentialDefinition,
  GraphWorkspaceTarget,
} from "../contract.js";
import type { GraphRunProvenance } from "../workflow-provenance.js";

export interface GraphLibraryStore {
  read(): Promise<GraphLibraryView>;
  change(
    expectedRevision: number,
    change: (entries: GraphLibraryEntry[]) => void,
  ): Promise<GraphLibraryView>;
}
export interface GraphPreflightPort {
  capture(
    target: GraphWorkspaceTarget,
    definition: GraphSequentialDefinition,
    settings: GraphNativeSettings,
  ): Promise<GraphRunProvenance>;
}
