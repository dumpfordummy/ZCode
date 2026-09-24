import type {
  IGraphWorkflowService,
  GraphLibraryEntry,
  GraphTemplateVersion,
} from "../workflow-contract.js";
import type { IGraphEngineeringService, GraphSequentialDefinition } from "../contract.js";
import type { GraphLibraryStore, GraphPreflightPort } from "./workflow-ports.js";
import { builtinTemplates } from "../domain/workflow-samples.js";
import {
  captureTemplate,
  instantiateTemplate,
  previewTemplate,
  templatePreview,
  validatePortable,
} from "../domain/workflow.js";
import { localTarget } from "../domain/definition.js";
import { runFingerprint } from "./attempts.js";

export class GraphWorkflowService implements IGraphWorkflowService {
  constructor(
    private readonly options: {
      store: GraphLibraryStore;
      graph: IGraphEngineeringService;
      preflight: GraphPreflightPort;
      digest(value: string): string;
      id(): string;
      now(): number;
    },
  ) {}
  async list() {
    const stored = await this.options.store.read();
    const builtins: GraphLibraryEntry[] = builtinTemplates.map(({ id, template }) => ({
      id,
      name: template.name,
      archived: false,
      builtin: true,
      versions: [
        {
          version: 1,
          digest: this.options.digest(runFingerprint(template)),
          createdAt: 0,
          template: structuredClone(template),
        },
      ],
    }));
    return { revision: stored.revision, entries: [...builtins, ...stored.entries] };
  }
  async mutate(params: Parameters<IGraphWorkflowService["mutate"]>[0]) {
    const selected =
      params.action === "duplicate" ? await this.selected(params.id, params.version) : undefined;
    const template =
      params.action === "create" || params.action === "version"
        ? validatePortable(params.template)
        : undefined;
    await this.options.store.change(params.expectedRevision, (entries) => {
      if (params.action === "create" || params.action === "duplicate") {
        const copied = structuredClone(template ?? selected!.template);
        if (params.action === "duplicate") copied.name = params.name;
        const validated = validatePortable(copied);
        entries.push({
          id: this.options.id(),
          name: validated.name,
          archived: false,
          builtin: false,
          versions: [this.version(validated, 1)],
        });
        return;
      }
      const entry = entries.find((e) => e.id === params.id);
      if (!entry)
        throw new Error(
          "Saved workflow not found. Duplicate a built-in before editing or archiving.",
        );
      if (params.action === "archive") entry.archived = params.archived;
      else {
        if (entry.archived)
          throw new Error("Restore the archived workflow before creating a version.");
        entry.versions.push(this.version(template!, entry.versions.at(-1)!.version + 1));
        entry.name = template!.name;
      }
    });
    return this.list();
  }
  async preview(params: Parameters<IGraphWorkflowService["preview"]>[0]) {
    if (params.action === "import") return previewTemplate(params.json);
    if (params.action === "capture")
      return captureTemplate(params.definition, params.name, params.description);
    return templatePreview(
      validatePortable((await this.selected(params.id, params.version)).template),
    );
  }
  async instantiate(params: Parameters<IGraphWorkflowService["instantiate"]>[0]) {
    const target = localTarget(params.target);
    const definition = instantiateTemplate(
      params.id,
      await this.selected(params.id, params.version),
      params.parameters,
      params.bindings,
    );
    return (await this.options.graph.saveDefinition({
      target,
      definition,
      expectedRevision: params.expectedRevision,
    })) as GraphSequentialDefinition;
  }
  async prepare(params: Parameters<IGraphWorkflowService["prepare"]>[0]) {
    const target = localTarget(params.target),
      { definition } = await this.options.graph.getWorkspace(target);
    if (definition.revision !== params.revision)
      throw new Error("Graph revision changed; review the saved graph again.");
    if (definition.version !== 5 || !definition.template)
      throw new Error("Choose a versioned workflow before template preparation.");
    return this.options.preflight.capture(target, definition, params.settings);
  }
  private async selected(id: string, version: number): Promise<GraphTemplateVersion> {
    const entry = (await this.list()).entries.find((e) => e.id === id);
    if (!entry || entry.archived) throw new Error("Workflow is missing or archived.");
    const selected = entry.versions.find((v) => v.version === version);
    if (!selected) throw new Error("Choose an existing immutable workflow version.");
    if (selected.digest !== this.options.digest(runFingerprint(selected.template)))
      throw new Error("Workflow version content does not match its immutable digest.");
    return selected;
  }
  private version(
    template: GraphTemplateVersion["template"],
    version: number,
  ): GraphTemplateVersion {
    return {
      version,
      template: structuredClone(template),
      digest: this.options.digest(runFingerprint(template)),
      createdAt: this.options.now(),
    };
  }
}
