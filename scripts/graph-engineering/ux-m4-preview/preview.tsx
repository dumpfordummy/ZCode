// UX-M4.1 isolated visual preview entry. SYNTHETIC: prototype-only layout components rendering invented,
// labelled data over the real app stylesheet, real icons and the real theme classes. No Graph Host,
// native session or evidence exists here; nothing in this page is native acceptance.
//   ?v=a|b  &s=newrun|waiting|failed|library  &t=dark|light
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { WORKSPACE, Shell, s, v } from "./preview-common.js";
import { ANewRun, ARun, ATop } from "./preview-a.js";
import { BNewRun, BRun, BTop } from "./preview-b.js";
/* ============ Library (dialog over the shell) ============ */
function Library() {
  const a = v === "a";
  const list = (
    <div className="lib-list" style={{ width: a ? 268 : 250 }}>
      <div className="cap">Yours</div>
      <div className="lib-item on">
        <span className="t">Team release flow</span>
        <span className="s">2 versions</span>
      </div>
      <div className="cap">Built-in</div>
      {[
        "Sequential engineering",
        "Bounded verified bug fix",
        "Sequential slot refinement",
        "Agent-assisted task",
      ].map((n) => (
        <div key={n} className="lib-item">
          <span className="t">{n}</span>
          <span className="s">Version 2</span>
        </div>
      ))}
    </div>
  );
  const versions = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: "18px 22px",
        minWidth: 0,
      }}
    >
      <div>
        <h2>
          Team release flow{" "}
          <span className="pill accent" style={{ marginLeft: 8, verticalAlign: 2 }}>
            Yours
          </span>
        </h2>
        <div className="muted" style={{ marginTop: 4 }}>
          Every version is immutable. Designs and runs stay pinned to the version they used.
        </div>
      </div>
      {a ? (
        <div className="tabs">
          <span className="on">Versions</span>
          <span>Use</span>
          <span>Share</span>
          <span>Advanced</span>
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="ver on">
          <span className="radio" />
          <span>
            <b>Version 2</b>{" "}
            <span className="pill accent" style={{ marginLeft: 6 }}>
              Latest
            </span>
          </span>
          <span className="faint">Created Oct 1, 2:33 PM</span>
        </div>
        <div className="ver">
          <span className="radio" />
          <span>
            <b>Version 1</b>{" "}
            <span className="pill" style={{ marginLeft: 6 }}>
              Used by current design
            </span>
          </span>
          <span className="faint">Created Oct 1, 2:33 PM</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <span className="btn sm">Duplicate version</span>
        <span className="btn sm">Archive</span>
      </div>
    </div>
  );
  const side = (
    <div
      style={{
        borderLeft: "1px solid var(--line)",
        background: "var(--inspector)",
        padding: "18px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        width: 300,
      }}
    >
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h3>Share</h3>
        <span className="btn sm">Save current design…</span>
        <span className="btn sm">Export this version…</span>
        <span className="btn sm">Import a file…</span>
      </section>
      <section
        style={{
          borderTop: "1px solid var(--line)",
          paddingTop: 14,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <h3>Advanced</h3>
        <span className="faint">Library revision 2</span>
        <span
          className="faint"
          style={{ fontFamily: "ui-monospace,Consolas,monospace", fontSize: 12 }}
        >
          a4caaa68b61a43a7059a…
        </span>
        <span className="link">Manual JSON</span>
      </section>
    </div>
  );
  return (
    <div className="scrim">
      <div
        className="dlg"
        style={{ width: a ? 1000 : 1140, height: a ? 560 : 580, maxWidth: "94%", maxHeight: "92%" }}
      >
        <div className="dlg-h">
          <h2>Workflow library</h2>
          <span
            className="faint path"
            style={{ fontFamily: "ui-monospace,Consolas,monospace", fontSize: 12 }}
          >
            {WORKSPACE}
          </span>
        </div>
        <div style={{ display: "flex", minHeight: 0 }}>
          {list}
          {versions}
          {a ? null : side}
        </div>
        <div className="dlg-f">
          <span className="faint" style={{ marginRight: "auto" }}>
            Open in Runs reviews and starts nothing.
          </span>
          <span className="btn">Load into design</span>
          <span className="btn primary">Open in Runs</span>
        </div>
      </div>
    </div>
  );
}

function Page() {
  const Top = v === "a" ? ATop : BTop;
  let body: ReactNode;
  if (s === "library")
    body = (
      <div style={{ position: "relative", minHeight: 0 }}>
        {v === "a" ? <ANewRun /> : <BNewRun />}
      </div>
    );
  else if (s === "newrun") body = v === "a" ? <ANewRun /> : <BNewRun />;
  else body = v === "a" ? <ARun failed={s === "failed"} /> : <BRun failed={s === "failed"} />;
  return (
    <Shell graphTop={<Top />}>
      {body}
      {s === "library" ? <Library /> : null}
    </Shell>
  );
}
createRoot(document.getElementById("root")!).render(<Page />);
