import assert from "node:assert/strict";
import test from "node:test";
import template from "../domain/web-profile-restore-policy.json" with { type: "json" };
import { normalizeWebRestore, validateWebRestoreShape } from "../domain/web-profile-restore.js";
const identities = {
  workspace: "C:/synthetic",
  packageRoot: "C:/public-cache",
  sdkDirectory: "C:/dotnet/sdk/8.0.426",
  webProject: "Api/Api.csproj",
  testProject: "Checks/Checks.csproj",
};
test("closed restore shapes retain every dependency and import; successful assets alone never broadens the profile", () => {
  for (const role of ["web", "test"] as const)
    assert.doesNotThrow(() => validateWebRestoreShape(role, template[role], identities));
  const original = template.test;
  const changed = [
    { ...original, assets: { ...original.assets, extra: "unmodeled" } },
    {
      ...original,
      assets: {
        ...original.assets,
        libraries: {
          ...original.assets.libraries,
          "Custom.Generator/1.0.0": { type: "package", path: "custom.generator/1.0.0" },
        },
      },
    },
    {
      ...original,
      targets: {
        ...original.targets,
        children: [
          ...original.targets.children,
          { name: "Import", attributes: { Project: "C:/outside.targets" }, text: "", children: [] },
        ],
      },
    },
    {
      ...original,
      props: {
        ...original.props,
        children: [
          ...original.props.children,
          {
            name: "PropertyGroup",
            attributes: {},
            text: "",
            children: [
              {
                name: "Custom",
                text: "$([System.IO.File]::ReadAllText('outside'))",
                attributes: {},
                children: [],
              },
            ],
          },
        ],
      },
    },
  ];
  for (const value of changed)
    assert.throws(() => validateWebRestoreShape("test", value, identities), /unmodeled/);
});
test("normalization changes only exact reviewed identities and rejects alias collisions", () => {
  const normalized = normalizeWebRestore(
    {
      project: "C:\\synthetic\\Api\\Api.csproj",
      cache: "C:/public-cache",
      sdk: "C:/dotnet/sdk/8.0.426",
      reference: "../Api/Api.csproj",
      effect: "custom.targets",
    },
    identities,
  );
  assert.deepEqual(normalized, {
    cache: "$PACKAGES",
    effect: "custom.targets",
    project: "$WEB_PROJECT_ABSOLUTE",
    reference: "$WEB_REFERENCE",
    sdk: "$SDK",
  });
  assert.throws(
    () => normalizeWebRestore({ "C:/public-cache": "a", $PACKAGES: "b" }, identities),
    /Ambiguous/,
  );
});
