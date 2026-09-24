import { randomUUID } from "node:crypto";
import type {
  IZCodeAgentService,
  IZCodeSessionService,
  IModelSelectionService,
  ISettingService,
} from "../index.js";
import { GraphEngineeringService } from "./app/service.js";
import { createGraphRepository } from "./adapters/repository.js";
import { createGraphNativePort } from "./adapters/native.js";

export function createGraphEngineeringService(options: {
  directory: string;
  agentService: IZCodeAgentService;
  sessionService: IZCodeSessionService;
  modelSelectionService: IModelSelectionService;
  settingService: ISettingService;
}) {
  return new GraphEngineeringService({
    repository: createGraphRepository(options.directory),
    native: createGraphNativePort(options),
    id: randomUUID,
    now: Date.now,
  });
}
