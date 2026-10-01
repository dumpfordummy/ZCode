// UX-M4.1 preview: shared shell, run list and step pieces (PROTOTYPE, synthetic data).
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  CircleDashed,
  Folder,
  Plus,
  Puzzle,
  Search,
  Settings,
  ShieldAlert,
  User,
  Workflow,
  XCircle,
  Zap,
} from "lucide-react";
import { applyTheme } from "../../../packages/ui/src/useTheme.js";
const q = new URLSearchParams(location.search);
export const v = q.get("v") === "b" ? "b" : "a";
export const s = q.get("s") ?? "newrun";
export const t = q.get("t") === "light" ? "light" : "dark";
applyTheme(t === "light" ? "zai-light" : "zai-dark");

export const REQUEST = "Fix MathOps.Add so it returns left + right. Keep Runner.cs unchanged.";
export const FAILED_REQUEST =
  "Add an overflow test for MathOps.Multiply; do not change production code.";
export const WORKSPACE = "C:\\Users\\dev\\projects\\mathlib";

export function Shell({ children, graphTop }: { children: ReactNode; graphTop: ReactNode }) {
  return (
    <div className={`m4 v${v} ${t}`}>
      <aside className="side">
        <div className="logo">Z</div>
        <div className="nav">
          <Plus size={16} />
          New task<kbd>Ctrl+N</kbd>
        </div>
        <div className="nav">
          <Search size={16} />
          Search<kbd>Ctrl+K</kbd>
        </div>
        <div className="nav on">
          <Workflow size={16} />
          Graph Engineering
        </div>
        <div className="nav">
          <Zap size={16} />
          Automations
        </div>
        <div className="nav">
          <Puzzle size={16} />
          Plugin Marketplace
        </div>
        <h4>Projects</h4>
        <div className="proj">
          <Folder size={15} />
          mathlib
        </div>
        <div className="proj faint" style={{ paddingLeft: 33 }}>
          No tasks yet
        </div>
        <div className="spacer" />
        <div className="nav">
          <User size={16} />
          Connect
          <Settings size={15} style={{ marginLeft: "auto" }} />
        </div>
      </aside>
      <div className="main">
        <header className="top">
          <span className="back">
            <ArrowLeft size={16} />
            Back to chat
          </span>
          <strong>Graph Engineering</strong>
          <span className="path">{WORKSPACE}</span>
          {graphTop}
        </header>
        <div className="work">{children}</div>
      </div>
      <div className="synthetic">
        SYNTHETIC PROTOTYPE · invented data · layout study, not the running app
      </div>
    </div>
  );
}

const RUNS = [
  {
    id: 1,
    title: "Fix MathOps.Add to return left + right",
    state: "waiting",
    sub: "Waiting for permission · 3:49 PM",
  },
  {
    id: 2,
    title: "Rename Runner.cs helpers",
    state: "done",
    sub: "Stopped for human review · 2:10 PM",
  },
  {
    id: 3,
    title: "Add overflow test for Multiply",
    state: "failed",
    sub: "Test failed · Yesterday",
  },
];
const RunIcon = ({ state }: { state: string }) =>
  state === "waiting" ? (
    <AlertTriangle size={17} className="warn-c" />
  ) : state === "failed" ? (
    <XCircle size={17} className="danger-c" />
  ) : state === "new" ? (
    <Plus size={17} />
  ) : (
    <CheckCircle2 size={17} className="ok-c" />
  );
export const RunList = ({ active }: { active: number | null }) => (
  <>
    <div className="cap">Recent runs</div>
    {RUNS.map((r) => (
      <div key={r.id} className={`run${active === r.id ? " on" : ""}`}>
        <RunIcon state={r.state} />
        <div>
          <div className="t">{r.title}</div>
          <div className="s">{r.sub}</div>
        </div>
      </div>
    ))}
  </>
);
export const Steps = ({ failed }: { failed?: boolean }) => {
  const list = ["Analyze", "Implement", "Build", "Test", "Review", "Approve"];
  const now = failed ? 3 : 1;
  return (
    <div className="steps">
      {list.map((name, i) => (
        <span key={name} style={{ display: "contents" }}>
          <span className={`st ${i < now ? "done" : i === now ? "now" : ""}`}>
            {i < now ? (
              <CheckCircle2 size={16} className="ok-c" />
            ) : i === now ? (
              failed ? (
                <XCircle size={16} className="danger-c" />
              ) : (
                <ShieldAlert size={16} className="warn-c" />
              )
            ) : (
              <Circle size={15} />
            )}
            {name}
          </span>
          {i < list.length - 1 ? <span className="bar" /> : null}
        </span>
      ))}
    </div>
  );
};
export const facts = (failed: boolean) => [
  {
    k: "Execution",
    n: failed ? "Stopped for human review" : "Waiting for native permission",
    i: failed ? (
      <XCircle size={16} className="danger-c" />
    ) : (
      <ShieldAlert size={16} className="warn-c" />
    ),
  },
  {
    k: "Test evidence",
    n: failed ? "Captured Test evidence failed" : "Required Tests have not run",
    i: failed ? (
      <XCircle size={16} className="danger-c" />
    ) : (
      <CircleDashed size={16} className="faint" />
    ),
  },
  {
    k: "Human decision",
    n: failed ? "Not requested" : "Not reached yet",
    d: failed ? "The run stopped before approval was asked for." : undefined,
    i: <CircleDashed size={16} className="faint" />,
  },
];
