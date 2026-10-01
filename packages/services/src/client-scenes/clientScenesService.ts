import {
  resolveAutomaticNetworkPolicy,
  ZCODE_PRODUCT_FLAVOR,
  type ApiClient,
  type AutomaticNetworkPolicy,
} from "@zcode/shared";
import { readApiJson } from "../providers/api/apiJson.js";
import { ZCODE_CLIENT_SCENES_URL } from "../providers/api/apiEndpoints.js";
import type { ClientScenesResponse, IClientScenesService } from "./clientScenes.js";

export function createClientScenesService(dependencies: {
  apiClient: ApiClient;
  /** 仅供测试覆盖；运行时使用编译期产品身份对应的策略。 */
  automaticNetworkPolicy?: AutomaticNetworkPolicy;
}): IClientScenesService {
  const automaticFetchAllowed = (
    dependencies.automaticNetworkPolicy ?? resolveAutomaticNetworkPolicy(ZCODE_PRODUCT_FLAVOR)
  ).clientScenes;
  return {
    list: async () => {
      // Z8.3-N1：Graph 不请求上游 scenes，返回空的随包默认场景（UI 已按空列表降级）。
      if (!automaticFetchAllowed) return { code: 0, msg: "bundled-default", data: [] };
      return readApiJson<ClientScenesResponse>(dependencies.apiClient, ZCODE_CLIENT_SCENES_URL, {
        method: "GET",
      });
    },
  };
}
