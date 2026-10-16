import { createHash } from "node:crypto";
import { lstat,open,realpath } from "node:fs/promises";
import { dirname,isAbsolute,join,relative,resolve,sep } from "node:path";
import { captureWebProfileRuntime,fingerprintBoundedTrees } from "@zcode/shared/node";
import type { InspectionSelection } from "@zcode/shared";

/** Read-only preparation of the separately reviewed profile query, never source completeness. */
export async function prepareNativeWebInspection(
  selection:InspectionSelection,workspace:string,executable:string,env:NodeJS.ProcessEnv,signal?:AbortSignal,
) {
  if(!selection.webProfile||selection.sdkVersion!=="8.0.426"||selection.framework!=="net8.0"||
    ![selection.webProfile.webProject,selection.webProfile.testProject].includes(selection.project))
    throw Error("The named Web inspection profile requires its exact installed SDK/net8.0 selection.");
  const target=resolve(workspace,selection.webProfile.testProject),relation=relative(resolve(workspace),target);
  if(isAbsolute(relation)||relation===".."||relation.startsWith(`..${sep}`)) throw Error("Profile Test target is outside workspace.");
  const assets=join(dirname(target),"obj","project.assets.json");
  const stat=await lstat(assets);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4*1024*1024||(await realpath(assets)).toLowerCase()!==resolve(assets).toLowerCase())
    throw Error("Profile requires bounded canonical prior restore metadata; setup never restores.");
  const handle=await open(assets,"r"); let text:string;
  try {
    if((await handle.stat()).ino!==stat.ino) throw Error("Restore metadata changed.");
    const buffer=Buffer.alloc(stat.size+1); let count=0;
    while(count<buffer.length) {signal?.throwIfAborted();const read=await handle.read(buffer,count,buffer.length-count,null);if(!read.bytesRead)break;count+=read.bytesRead;}
    text=new TextDecoder("utf-8",{fatal:true}).decode(buffer.subarray(0,count)); const after=await handle.stat();
    if(Buffer.byteLength(text)!==stat.size||after.mtimeMs!==stat.mtimeMs||after.ctimeMs!==stat.ctimeMs) throw Error("Restore metadata changed.");
  } finally {await handle.close();}
  const parsed=JSON.parse(text),roots=parsed&&parsed.packageFolders&&typeof parsed.packageFolders==="object"&&!Array.isArray(parsed.packageFolders)?Object.keys(parsed.packageFolders):[];
  if(roots.length!==1||!isAbsolute(roots[0]!)) throw Error("One exact prior-restore package root is required.");
  const deadline=Date.now()+120000;
  const runtimeProfile=await captureWebProfileRuntime({workspace,executable,packageRoot:resolve(roots[0]!),systemRoot:env.SystemRoot??"",signal,deadline});
  const observed=await fingerprintBoundedTrees({roots:[{path:resolve(workspace),label:"$WORKSPACE",exclude:[".git",".zcode"]}],
    limits:{files:20000,bytes:512*1024*1024,fileBytes:64*1024*1024,depth:32,elapsedMs:Math.min(120000,deadline-Date.now())},signal});
  return {runtimeProfile,observationDigest:createHash("sha256").update(JSON.stringify({workspace:observed.digest,runtimeProfile})).digest("hex"),observedFiles:observed.files,observedBytes:observed.bytes};
}
