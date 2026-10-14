import { writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as wait } from "node:timers/promises";
// One bounded external observer, used serially. Never restarts or overlaps native operations.
export function createWebObserver({ getWindow, home, start }) {
  return async function until(predicate, label) {
    const window = getWindow();
    const deadline = performance.now() + 900000;
    let lastObservation = 0;
    while (performance.now() < deadline) {
      if (await predicate()) return;
      if (window && performance.now() - lastObservation > 10000) {
        lastObservation = performance.now();
        const alerts = await window.getByRole("alert").allTextContents();
        await writeFile(
          path.join(home, "f1-web-native-live.json"),
          JSON.stringify(
            {
              label,
              elapsedMs: performance.now() - start,
              alerts,
              body: (await window.locator("body").innerText()).slice(-20000),
            },
            null,
            2,
          ),
        );
        if (label === "Save complete" && alerts.length)
          throw Error("Save failed: " + alerts.join("; "));
      }
      await wait(250);
    }
    throw Error("Bounded Web observer expired: " + label);
  };
}
