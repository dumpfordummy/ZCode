// UX-M4.1 preview, Alternative A: Focus page (PROTOTYPE, synthetic data).
import { CheckCircle2, Plus, Play, ShieldAlert, XCircle } from "lucide-react";
import { FAILED_REQUEST, REQUEST, RunList, Steps, facts } from "./preview-common.js";
/* ============ A: Focus page ============ */
export const ATop = () => (
  <>
    <span className="seg">
      <span className="on">Runs</span>
      <span>Workflows</span>
      <span>Checks</span>
    </span>
    <span className="fill" />
    <span className="faint">z1-local-fixture · build mode</span>
  </>
);
export function ANewRun() {
  return (
    <div className="a-runs">
      <nav className="a-rail">
        <div className="btn sel">
          <Plus size={16} />
          New run
        </div>
        <RunList active={null} />
      </nav>
      <main className="a-stage">
        <div className="a-scroll">
          <div className="a-col">
            <div>
              <h1>New run</h1>
              <div className="a-sub">
                <b>Sequential engineering</b> <span className="pill">Version 2 · Built-in</span>{" "}
                <span className="link">Change workflow</span>
              </div>
            </div>
            <div>
              <span className="label">Task</span>
              <textarea className="task" readOnly value={REQUEST} />
            </div>
            <div className="panel">
              <div className="sr">
                <span className="k">Context</span>
                <div className="v">
                  <b>docs/Notes.md</b>
                  <span className="m">Instructions · read by Analyze and Implement</span>
                </div>
                <div className="row-actions">
                  <span className="btn sm">Replace</span>
                  <span className="btn sm">Add</span>
                </div>
              </div>
              <div className="sr">
                <span className="k">Checks</span>
                <div className="v">
                  <b>Build demo</b> <span className="faint">→</span> <b>Test demo content</b>
                  <span className="m">2 of 6 saved checks · not run yet</span>
                </div>
                <div className="row-actions">
                  <span className="btn sm">Edit checks</span>
                </div>
              </div>
            </div>
            <div className="tail">
              <span className="link">Advanced</span>
              <span>references, parameters, parallel workflows</span>
            </div>
          </div>
        </div>
        <footer className="a-bar">
          <div className="in">
            <span className="ready">
              <CheckCircle2 size={17} className="ok-c" />
              Ready to review. Nothing starts until you confirm.
            </span>
            <span className="btn quiet">Save as workflow only</span>
            <span className="btn primary">
              <Play size={15} />
              Review and run
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
}
export function ARun({ failed }: { failed: boolean }) {
  return (
    <div className="a-runs">
      <nav className="a-rail">
        <div className="btn">
          <Plus size={16} />
          New run
        </div>
        <RunList active={failed ? 3 : 1} />
      </nav>
      <main className="a-stage">
        <div className="a-scroll">
          <div className="a-col">
            <div>
              <h1>
                {failed
                  ? "Add overflow test for Multiply"
                  : "Fix MathOps.Add to return left + right"}
              </h1>
              <div className="a-sub">
                <span>Sequential engineering</span>
                <span className="pill">Version 2 · Built-in</span>
                <span className="faint">Started 3:49 PM</span>
              </div>
            </div>
            {failed ? (
              <div className="banner danger">
                <div className="ico">
                  <XCircle size={22} />
                </div>
                <div>
                  <h2>Test failed: Test configured criteria</h2>
                  <p>
                    The run stopped and no reviewer was started. Still true from captured facts:
                  </p>
                  <ul>
                    <li>No approval was requested, so there is nothing to approve or reject.</li>
                    <li>Files already written by the agents remain; nothing was undone.</li>
                  </ul>
                  <div className="acts">
                    <span className="btn primary">Inspect the failing Test</span>
                    <span className="btn">Start a new request from this one</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="banner warn">
                <div className="ico">
                  <ShieldAlert size={22} />
                </div>
                <div>
                  <h2>Waiting for your permission</h2>
                  <p>
                    Implement needs a native permission. Answer it in that step’s own conversation;
                    Graph does not grant it separately.
                  </p>
                  <div className="acts">
                    <span className="btn primary">Open conversation</span>
                    <span className="btn">Cancel attempt</span>
                    <span className="btn quiet">Start a new request from this one</span>
                  </div>
                </div>
              </div>
            )}
            <Steps failed={failed} />
            <div className="panel facts">
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
            <div className="tabs">
              <span className="on">Overview</span>
              <span>Steps and checks</span>
              <span>Evidence</span>
              <span>Technical details</span>
            </div>
            <div className="reqbox">
              <div>
                <span className="label">Request</span>
                <div>{failed ? FAILED_REQUEST : REQUEST}</div>
              </div>
              <span className="faint">These facts describe this captured run.</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
