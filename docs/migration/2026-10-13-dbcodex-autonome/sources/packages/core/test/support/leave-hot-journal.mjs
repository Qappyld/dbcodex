import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.argv[2]);
db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA cache_size=1; BEGIN IMMEDIATE");
// Exceed the pager cache, forcing uncommitted pages to the main file and a hot journal to disk.
db.exec("UPDATE document_state SET dbml_text=hex(randomblob(200000)), generation=generation+1");
process.send("dirty-pages-written");
setInterval(() => {}, 1000);
