import { create } from "zustand";
import type {
  GraphDefinition,
  GraphParameterValue,
  GraphRecipeSnapshot,
  GraphTemplateBindings,
  GraphDotnetPreset,
  GraphChecksSelection,
} from "@zcode/services";
import {
  reconcileGraphDraft,
  type GraphDraftState,
} from "../graph-engineering/graphEngineeringView.js";

export interface GraphTemplateFormDraft {
  parameters: Record<string, GraphParameterValue>;
  bindings: GraphTemplateBindings;
}
export interface GraphRecipeFormDraft {
  text: string;
  baseText: string;
  digest: string;
}
export interface GraphProjectSetupDraft {
  preset?: GraphDotnetPreset;
  checks?: Extract<GraphChecksSelection, { kind: "recipes" }>;
  probe?: Extract<GraphChecksSelection, { kind: "dotnet-probe" }>;
  checksMode?: GraphChecksSelection["kind"];
}
export interface GraphEditorBuffer {
  base: string;
  text: string;
  error?: string;
}
interface GraphWorkspaceDraft {
  definition?: GraphDraftState;
  templates: Record<string, GraphTemplateFormDraft>;
  recipes?: GraphRecipeFormDraft;
  librarySelection?: { id: string; version: number };
  setup?: GraphProjectSetupDraft;
  editorBuffers?: Record<string, GraphEditorBuffer>;
}
interface GraphDraftStore {
  workspaces: Record<string, GraphWorkspaceDraft>;
  observeDefinition(key: string, incoming: GraphDefinition): void;
  editDefinition(key: string, draft: GraphDefinition, base: GraphDefinition): void;
  acceptDefinition(key: string, saved: GraphDefinition): void;
  setTemplateDraft(key: string, templateKey: string, draft: GraphTemplateFormDraft): void;
  selectLibrary(key: string, selection: GraphWorkspaceDraft["librarySelection"]): void;
  observeRecipes(key: string, snapshot: GraphRecipeSnapshot): void;
  setRecipeDraft(key: string, draft: GraphRecipeFormDraft): void;
  acceptRecipes(key: string, snapshot: GraphRecipeSnapshot, submittedText: string): void;
  updateSetup(key: string, patch: Partial<GraphProjectSetupDraft>): void;
  setEditorBuffer(key: string, field: string, buffer: GraphEditorBuffer): void;
}
const empty = (): GraphWorkspaceDraft => ({ templates: {} });
const recipeForm = (snapshot: GraphRecipeSnapshot): GraphRecipeFormDraft => {
  const text = JSON.stringify(snapshot.recipes, null, 2);
  return { text, baseText: text, digest: snapshot.digest };
};

/** 仅保存未提交的 Renderer 草稿；导航卸载不能丢失编辑，也不能把它们当作 Host 已接受状态。 */
export const createGraphDraftStore = () =>
  create<GraphDraftStore>((set) => {
    const change = (key: string, update: (current: GraphWorkspaceDraft) => GraphWorkspaceDraft) =>
      set((state) => {
        const current = state.workspaces[key] ?? empty();
        const next = update(current);
        return next === current ? state : { workspaces: { ...state.workspaces, [key]: next } };
      });
    return {
      workspaces: {},
      observeDefinition: (key, incoming) =>
        change(key, (current) => {
          const next = current.definition
            ? reconcileGraphDraft(current.definition, incoming)
            : { base: incoming, draft: incoming };
          return next === current.definition ? current : { ...current, definition: next };
        }),
      editDefinition: (key, draft, base) =>
        change(key, (current) => ({
          ...current,
          definition: { base: current.definition?.base ?? base, draft },
        })),
      acceptDefinition: (key, saved) =>
        change(key, (current) => ({
          ...current,
          definition: { base: saved, draft: saved },
        })),
      setTemplateDraft: (key, templateKey, draft) =>
        change(key, (current) => ({
          ...current,
          templates: { ...current.templates, [templateKey]: draft },
        })),
      selectLibrary: (key, librarySelection) =>
        change(key, (current) => ({ ...current, librarySelection })),
      updateSetup: (key, patch) =>
        change(key, (current) => ({ ...current, setup: { ...current.setup, ...patch } })),
      setEditorBuffer: (key, field, buffer) =>
        change(key, (current) => ({
          ...current,
          editorBuffers: { ...current.editorBuffers, [field]: buffer },
        })),
      observeRecipes: (key, snapshot) =>
        change(key, (current) => {
          // 外部刷新不能覆盖尚未保存的检查定义；保留旧 digest，让冲突显式暴露。
          if (current.recipes && current.recipes.text !== current.recipes.baseText) return current;
          if (current.recipes?.digest === snapshot.digest) return current;
          return { ...current, recipes: recipeForm(snapshot) };
        }),
      setRecipeDraft: (key, recipes) => change(key, (current) => ({ ...current, recipes })),
      acceptRecipes: (key, snapshot, submittedText) =>
        change(key, (current) => {
          const saved = recipeForm(snapshot);
          return {
            ...current,
            recipes:
              current.recipes && current.recipes.text !== submittedText
                ? { ...saved, text: current.recipes.text }
                : saved,
          };
        }),
    };
  });

export const useGraphDraftStore = createGraphDraftStore();
