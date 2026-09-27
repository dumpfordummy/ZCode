/** Explicit VSTest scope. These declarations do not execute or evaluate MSBuild. */
export interface GraphDotnetBuildTarget {
  project: string;
  configuration: string;
  framework?: string;
  runtime?: string;
  restore: "disabled" | "explicit";
}
export interface GraphDotnetTestTarget {
  project: string;
  configuration: string;
  framework: string;
  runtime?: string;
  filter?: string;
  assembly: string;
}
export interface GraphTrxParseInput {
  bytes: Uint8Array;
  target: GraphDotnetTestTarget;
  expectedAssemblyPath: string;
  pathCase: "sensitive" | "insensitive";
  startedAt: number;
  completedAt: number;
}
export interface GraphTrxReport {
  parserVersion: "dotnet-vstest-trx-v1";
  reportId: string;
  startedAt: number;
  finishedAt: number;
  tests: Array<{ name: string; status: "passed" | "failed" | "skipped"; message?: string }>;
}
export interface GraphTrxNormalizationReceipt {
  version: 1;
  parserVersion: "dotnet-vstest-trx-v1";
  reportId: string;
  sourceDigest: string;
  buildDigest: string;
  operationId: string;
  scope: GraphDotnetTestTarget;
  original: { digest: string; bytes: number; modifiedAt: number };
  preview: { artifactId: string; digest: string };
  normalized: { artifactId: string; digest: string };
}
