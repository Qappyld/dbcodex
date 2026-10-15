import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { PreferencesStore } from "../src/preferences.js";
import { acquireProjectLock } from "../src/project-lock.js";
import { createDbcdProject, saveDbcdProject, openDbcdProject, emptyPresentation } from "@dbcodex/core";
const roots: string[] = [];
const root = () => { const value = mkdtempSync(join(tmpdir(), "dbcodex-portable-")); roots.push(value); return value; };
afterEach(() => { roots.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })); });
it("preserves invalid and future preferences without overwriting the original", () => {
  for (const original of ["{broken", '{"version":9,"theme":"dark","recent":[]}']) {
    const dir = root(); mkdirSync(join(dir, "data")); const file = join(dir, "data/preferences.json"); writeFileSync(file, original);
    const store = new PreferencesStore(dir, join(dir, "fallback")); expect(store.value.theme).toBe("light"); store.update({theme:"dark"}); expect(readFileSync(file,"utf8")).toBe(original); expect(store.notice).toContain("original préservé");
  }
});
it("resolves recent projects relative to the portable root after moving it", () => {
  const first = root(), second = root(); const store = new PreferencesStore(first, join(first,"fallback")); store.add(join(first,"projects/demo.dbcd")); store.update({theme:"dark"});
  mkdirSync(join(second,"data")); writeFileSync(join(second,"data/preferences.json"),readFileSync(store.file!)); const moved=new PreferencesStore(second,join(second,"fallback")); expect(moved.path(moved.value.recent[0]!)).toBe(join(second,"projects/demo.dbcd")); expect(moved.value.theme).toBe("dark");
});
it("falls back when the portable data path cannot be used", () => {
  const dir=root(); writeFileSync(join(dir,"data"),"occupied"); const store=new PreferencesStore(dir,join(dir,"fallback")); expect(store.file).toBe(join(dir,"fallback/preferences.json")); expect(store.notice).toContain("local");
});
it("preserves recent projects and theme across stale preferences instances", () => {
  const dir=root(), first=new PreferencesStore(dir,join(dir,"fallback")), second=new PreferencesStore(dir,join(dir,"fallback"));
  first.update({theme:"dark"}); first.add(join(dir,"a.dbcd")); second.add(join(dir,"b.dbcd"));
  const reopened=new PreferencesStore(dir,join(dir,"fallback")); expect(reopened.value.theme).toBe("dark"); expect(reopened.value.recent).toEqual(["b.dbcd","a.dbcd"]);
});
it("allows one local writer and releases its lock on close", async () => {
  const dir=root(), path=join(dir,"test.dbcd"); writeFileSync(path,"test"); const first=await acquireProjectLock(path); expect(first).not.toBeNull(); expect(await acquireProjectLock(path)).toBeNull(); await new Promise<void>(done=>first!.close(()=>done())); const next=await acquireProjectLock(path); expect(next).not.toBeNull(); await new Promise<void>(done=>next!.close(()=>done()));
});
it("persists notes and table colors and refuses an obsolete save", async () => {
  const dir=root(); const initial=await createDbcdProject({workspaceRoot:dir,projectPath:"project.dbcd",sourceText:"// conserver\nTable users { id int [pk] }"}); const presentation=emptyPresentation(); presentation.views.all!.nodes["public.users"]={x:40,y:60,color:"#326b91"}; presentation.views.all!.notes={note:{x:100,y:200,text:"Note libre"}};
  const input={workspaceRoot:dir,projectPath:"project.dbcd",sourceText:initial.sourceText,presentation,expectedProjectId:initial.projectId,expectedRevisionId:initial.currentRevisionId,expectedGeneration:initial.generation}; await saveDbcdProject(input); await expect(saveDbcdProject(input)).rejects.toMatchObject({code:"CONFLICT"}); const reopened=await openDbcdProject({workspaceRoot:dir,projectPath:"project.dbcd"}); expect(reopened.presentation.views.all!.notes!.note!.text).toBe("Note libre"); expect(reopened.presentation.views.all!.nodes["public.users"]!.color).toBe("#326b91"); expect(reopened.sourceText).toBe(initial.sourceText);
});
