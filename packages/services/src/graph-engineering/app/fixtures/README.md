# Native Z1 compatibility fixtures

Both JSON documents are actual persisted metadata from isolated controlled-provider Electron/Host/CLI runs. They contain only synthetic workspaces and provider references, no credentials. Do not execute their old paths or replay their inputs.

- `z1-completed.json`: unchanged Z1 baseline at `cbb91b064aee711f6ccf597390d2bff4609ea749`, profile `.tmp/z1-native-1790237615003-f41add`; native Read/Edit/Bash and independent test, with completed restart verified before Z2 source changes.
- `z1-pending.json`: prior Z1 synthetic permission-wait profile `.tmp/z1-native-1790197651591-338a85`, retained as an original version-1 guard fixture. Its old runtime binding is evidence only and does not prove present inactivity.

Compatibility tests parse the original schema, load copies through the current service, prove completed immutability and pending guard retention, and assert zero native creation/submission. Test paths are not installed-profile paths.
