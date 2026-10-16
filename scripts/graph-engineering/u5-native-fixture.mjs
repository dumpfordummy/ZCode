import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prepareU4Fixture } from "./u4-native-fixture.mjs";

/** Same cached public-package fixture; new root forms, no restore or installer. */
export async function prepareU5Fixture(isolation) {
  const base = await prepareU4Fixture(isolation);
  const test = path.join(isolation.workspace, "Tests/B1.Tests.csproj");
  await writeFile(
    test,
    (await readFile(test, "utf8"))
      .replace(
        '<Project Sdk="Microsoft.NET.Sdk">',
        '<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003"><Import Project="Sdk.props" Sdk="Microsoft.NET.Sdk"/>',
      )
      .replace("</Project>", '<Import Project="Sdk.targets" Sdk="Microsoft.NET.Sdk"/></Project>'),
  );
  const library = path.join(isolation.workspace, "Library/B1.Library.csproj");
  await writeFile(
    library,
    (await readFile(library, "utf8")).replace(
      '<Project Sdk="Microsoft.NET.Sdk">',
      '<Project Sdk="Microsoft.NET.Sdk" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">',
    ),
  );
  return { ...base, roots: ["standard MSBuild namespace", "exact first/last SDK imports"] };
}
