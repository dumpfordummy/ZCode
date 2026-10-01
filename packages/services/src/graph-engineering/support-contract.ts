import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";
import type { GraphSupportBundleResult } from "./support-bundle-types.js";

export type * from "./support-bundle-types.js";

/**
 * Z8.3-S1：本地、可预览的 Graph 支持包。只读：不上传、不写文件、不取得所有权；
 * 仅 Graph 内部版可用（其它身份拒绝）。保存由 renderer 经既有保存文件边界显式发起。
 * 单独成服务：IGraphEngineeringService 已达到契约公开方法上限（architecture-policy max-public-methods）。
 */
export interface IGraphSupportService {
  supportBundle(): Promise<GraphSupportBundleResult>;
}
export const IGraphSupportService = createServiceDescriptor<IGraphSupportService>(
  ServiceChannels.GraphSupport,
);
