// UX-M4.1 preview, Alternative B: Workbench (PROTOTYPE, synthetic data).
import { CheckCircle2, Circle, FileText, Plus, Play, ShieldAlert, XCircle } from "lucide-react";
import { FAILED_REQUEST, REQUEST, RunList, facts } from "./preview-common.js";
/* ============ B: Workbench ============ */
export const BTop = () => (
  <>
    <span className="seg2">
      <span className="on">Runs</span>
      <span>Workflows</span>
      <span>Checks</span>
    </span>
    <span className="fill" />
    <span className="faint">z1-local-fixture · build mode</span>
  </>
);
export function BNewRun() {
  return (
    <div className="b-runs">
      <nav className="b-rail">
        <div className="btn sel">
          <Plus size={16} />
          New run
        </div>
        <RunList active={null} />
      </nav>
      <main className="b-center">
        <div className="b-scroll">
          <div>
            <h1>New run</h1>
            <div className="muted" style={{ marginTop: 4 }}>
              Describe the task. Nothing starts until you confirm.
            </div>
          </div>
          <div>
            <span className="label">Task</span>
            <textarea className="task" readOnly value={REQUEST} />
          </div>
          <div className="ready-list">
            <h3>Readiness</h3>
            <div>
              <CheckCircle2 size={17} className="ok-c" />
              Workflow chosen: Sequential engineering, version 2
            </div>
            <div>
              <CheckCircle2 size={17} className="ok-c" />
              Context: 1 instruction file
            </div>
            <div>
              <CheckCircle2 size={17} className="ok-c" />
              Checks: Build demo, Test demo content (saved, not run)
            </div>
          </div>
        </div>
        <footer className="b-bar">
          <span className="ready">
            <CheckCircle2 size={17} className="ok-c" />
            Ready
          </span>
          <span className="btn quiet">Save as workflow only</span>
          <span className="btn primary">
            <Play size={15} />
            Review and run
          </span>
        </footer>
      </main>
      <aside className="b-insp">
        <section>
          <h3>Workflow</h3>
          <div className="field">
            <span>Sequential engineering</span>
            <span className="pill">v2 · Built-in</span>
          </div>
        </section>
        <section>
          <h3>Context</h3>
          <div className="field">
            <span>
              <FileText size={14} style={{ verticalAlign: -2 }} /> docs/Notes.md
            </span>
            <span className="faint">Replace</span>
          </div>
          <span className="link">+ Add context</span>
        </section>
        <section>
          <h3>Checks</h3>
          <div>
            <span className="label">Build</span>
            <div className="field">
              <span>Build demo</span>
              <span className="faint">Saved</span>
            </div>
          </div>
          <div>
            <span className="label">Test</span>
            <div className="field">
              <span>Test demo content</span>
              <span className="faint">Saved</span>
            </div>
          </div>
          <span className="link">Edit checks</span>
        </section>
      </aside>
    </div>
  );
}
export function BRun({ failed }: { failed: boolean }) {
  const steps = ["Analyze", "Implement", "Build", "Test", "Review", "Approve"];
  const now = failed ? 3 : 1;
  return (
    <div className="b-runs">
      <nav className="b-rail">
        <div className="btn">
          <Plus size={16} />
          New run
        </div>
        <RunList active={failed ? 3 : 1} />
      </nav>
      <main className="b-center">
        <div className="b-scroll">
          <div>
            <h1>
              {failed ? "Add overflow test for Multiply" : "Fix MathOps.Add to return left + right"}
            </h1>
            <div className="muted" style={{ marginTop: 4 }}>
              Sequential engineering · Version 2 · Built-in
            </div>
          </div>
          {failed ? (
            <div className="need danger">
              <XCircle size={26} className="danger-c" />
              <div>
                <h2>Test failed: Test configured criteria</h2>
                <p>The run stopped and no reviewer was started.</p>
                <ul>
                  <li>No approval was requested, so there is nothing to approve or reject.</li>
                  <li>Files already written by the agents remain; nothing was undone.</li>
                </ul>
              </div>
              <div className="acts">
                <span className="btn primary">Inspect the failing Test</span>
                <span className="btn">Start a new request from this one</span>
              </div>
            </div>
          ) : (
            <div className="need">
              <ShieldAlert size={26} className="warn-c" />
              <div>
                <h2>Waiting for your permission</h2>
                <p>
                  Implement needs a native permission. Answer it in that step’s own conversation;
                  Graph does not grant it separately.
                </p>
              </div>
              <div className="acts">
                <span className="btn primary">Open conversation</span>
                <span className="btn">Cancel attempt</span>
                <span className="btn quiet">Start a new request from this one</span>
              </div>
            </div>
          )}
          <div className="timeline">
            {steps.map((name, i) => (
              <div key={name} className={`tl${i === now ? " now" : ""}`}>
                {i < now ? (
                  <CheckCircle2 size={18} className="ok-c" />
                ) : i === now ? (
                  failed ? (
                    <XCircle size={18} className="danger-c" />
                  ) : (
                    <ShieldAlert size={18} className="warn-c" />
                  )
                ) : (
                  <Circle size={17} className="faint" />
                )}
                <div>
                  <div className="n">{name}</div>
                  {i === now ? (
                    <div className="d">
                      {failed ? "Captured Test evidence failed" : "Waiting for native permission"}
                    </div>
                  ) : null}
                </div>
                <span className="faint">
                  {i < now ? "Done" : i === now ? (failed ? "Failed" : "Needs you") : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>
      <aside className="b-insp">
        <section>
          <h3>Outcome</h3>
          <div className="dl">
            {facts(failed).map((f) => (
              <div key={f.k}>
                <span className="faint">{f.k}</span>
                <div className="n">
                  {f.i}
                  {f.n}
                </div>
                {f.d ? <div className="d">{f.d}</div> : null}
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3>Request</h3>
          <div>{failed ? FAILED_REQUEST : REQUEST}</div>
        </section>
        <section>
          <h3>Inspect</h3>
          <span className="link">Steps and checks</span>
          <span className="link">Evidence</span>
          <span className="link">Technical details</span>
        </section>
      </aside>
    </div>
  );
}
