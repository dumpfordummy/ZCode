# Z6 native execution environment preview

The existing native agent/configuration resolvers own execution configuration. Graph
reads a strictly projected inventory through `IZCodeAgentService.previewExecutionEnvironment`;
it does not create a provider store, skill installer, command executor or configuration owner.

The request carries the ordinary workspace target and an optional bounded list
of at most 32 executable names/paths from validated project recipes. Executable
preview uses the native Windows PATH/PATHEXT candidate resolver, or POSIX PATH
and executable access checks. It uses asynchronous filesystem inspection only;
it never runs the executable, asks for its version, or initializes a shell.
Paths containing separators resolve against the workspace; Graph supplies an
absolute path when the recipe has a different cwd. Each result has the requested
`executable`, `available | missing | unknown` status and, when available, the
resolved path. Missing means no candidate is present; unreadable candidates or
an unavailable search path remain Unknown. Availability is not compatibility or
execution safety. Missing tooling blocks Graph preparation; an explicitly
declared earlier Build output may be pending until Build verifies that output.
The protocol method is
`workspace/previewExecutionEnvironment`. It is read-only and model-independent.
It returns version 1 metadata for inherited instructions, discovered skills,
plugins, hooks and MCP declarations, plus explicit unknowns. It never returns
instruction contents, credentials, headers, option values, command bodies or environment values.
HTTP destinations contain scheme and host only; stdio destinations are Unknown.
Paths in this local inventory are private provenance and must be excluded from
portable template export. Digests capture content/configuration identity, not execution safety.
The required `configDigest` also captures resolved native configuration, installed
plugin manifests and native subagent profiles/overrides in stable key order.
Native subagent discovery uses `metadataOnly` to skip migrations; only the opaque
digest is returned. Unknown destination behavior remains Unknown even when its
local configuration can be fingerprinted. Cold Unknown uses a zero digest and
cannot be treated as a captured available configuration.

```mermaid
sequenceDiagram
  participant Graph as Graph Host
  participant Native as Existing native workspace service
  participant Resolver as Native metadata resolvers
  Graph->>Native: previewExecutionEnvironment(workspace target)
  alt no existing runtime
    Native-->>Graph: Unknown; no process or session created
  else existing runtime
    Native->>Resolver: metadataOnly discovery
    Resolver-->>Native: projected metadata and unknowns
    Native-->>Graph: strict versioned inventory
  end
  Note over Graph: operator reviews Unknown and captured configuration before run
```

Normal app-server startup initializes storage, provider registry and telemetry.
Preview therefore uses only an existing workspace client; it never starts or
initializes an agent/workspace/session. Missing or older runtimes return Unknown,
not an empty inventory claimed to be complete. Refresh is read-only. Native
commands, model calls, hooks, MCP connections, plugin enabling/installing,
bundled plugin/skill seeding and user-state migrations are forbidden in preview.

Native plugin discovery gains an explicit `metadataOnly` option, default false.
That option skips official cache seeding, plugin data-directory creation and
generated command materialization and interrupted-install transaction repair.
The existing configuration factory normalizes legacy keys only in memory during
metadata preview; it performs no migration writes or diagnostic log writes.
It reads current installed declarations;
missing bundled caches remain Unknown. Native skill discovery reuses its roots,
parser and disabled-path rules; preview shows disabled local skills too. No new
skill selection/activation mechanism is introduced. Inherited AGENTS metadata
uses the exact native context resolver (user instruction plus nearest project
instruction, current truncation bound), not a second search algorithm.

Hooks are projected from native resolved configuration and installed plugin
declarations. Trust/external behavior is Unknown unless proven by the native
projection. MCP preview describes configured transports and sanitized origins;
it does not connect or claim live status. Subagent model overrides, scripts,
provider-side routing, inherited runtime changes and dynamic destinations remain
explicit Unknown. Primary/auxiliary model projection belongs to the existing
Model Selection facade and Graph's adapter, separately from this response.

Acceptance tests use only temporary private homes/workspaces, a local plugin with
generated-command metadata, hooks and MCP declarations, enabled/disabled skills,
and AGENTS files. Assert exact metadata and drift digests; sentinel secret content
never appears in serialized output; no plugin data/cache/generated files appear;
no model/session/MCP operation occurs; malformed requests/results are rejected;
cold preview starts no client and older-method failure is explicit Unknown.
