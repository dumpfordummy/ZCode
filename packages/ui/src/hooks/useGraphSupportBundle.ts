import { useEffect, useMemo, useState } from "react";
import type { IGraphSupportService } from "@zcode/services";
import type { IPlatformService } from "@zcode/shared";
import {
  createSupportBundleController,
  type SupportBundleState,
} from "@/graph-engineering/supportBundle.js";

/** Z8.3-S1：把纯状态机接到 React；控制器随 service/platform 变化重建，卸载时让进行中的结果失效。 */
export function useGraphSupportBundle(
  service: Pick<IGraphSupportService, "supportBundle"> | undefined,
  platform: Pick<IPlatformService, "saveFile"> | null,
) {
  const [state, setState] = useState<SupportBundleState>({ status: "idle" });
  const controller = useMemo(
    () => createSupportBundleController({ service, platform, onState: setState }),
    [service, platform],
  );
  useEffect(() => () => controller.reset(), [controller]);
  return {
    state,
    generate: controller.generate,
    save: controller.save,
    reset: controller.reset,
  };
}
