import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const root = resolve(import.meta.dir, "../spec/fixtures/provisional-v1");
const fixture = JSON.parse(readFileSync(join(root,"fixture.json"),"utf8"));
const listed = new Set<string>();
if (fixture.fixtureVersion!==1 || fixture.id!=="provisional-v1") throw new Error("unknown regression fixture");
for (const file of fixture.files) {
  const path=resolve(root,file.path);
  if (relative(root,path).startsWith("..") || listed.has(file.path)) throw new Error(`invalid fixture path ${file.path}`);
  listed.add(file.path);
  const hash=createHash("sha256").update(readFileSync(path)).digest("hex");
  if (hash!==file.sha256) throw new Error(`frozen regression fixture changed: ${file.path}`);
}
for (const entry of readdirSync(root,{recursive:true,withFileTypes:true})) {
  if (entry.isFile()) {
    const path=relative(root,join(entry.parentPath,entry.name)).replaceAll("\\","/");
    if (path!=="fixture.json" && !listed.has(path)) throw new Error(`unlisted regression fixture file ${path}`);
  }
}
console.log(`frozen regression fixture verified: ${listed.size} files`);
