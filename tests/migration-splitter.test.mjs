import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {DatabaseSync} from 'node:sqlite';

// Exercise the installed deploy tool's real statement splitter. SQLite accepts
// =CASE, but Wrangler only recognizes a compound CASE preceded by whitespace.
test('all migrations survive the installed Wrangler SQL splitter and trigger files keep LF endings',()=>{
 const source=readFileSync(new URL('../node_modules/wrangler/wrangler-dist/cli.js',import.meta.url),'utf8');
 const from=source.indexOf('function splitSqlIntoStatements(sql) {'),to=source.indexOf('var init_splitter =',from);
 assert.ok(from>=0&&to>from,'Recheck the deployed Wrangler splitter after upgrading Wrangler.');
 const split=runInNewContext(`${source.slice(from,to)};splitSqlIntoStatements`);
 const db=new DatabaseSync(':memory:');
 try {
  const dir=new URL('../drizzle/',import.meta.url);
  for(const file of readdirSync(dir).filter(file=>file.endsWith('.sql')).sort()){
   const sql=readFileSync(new URL(file,dir),'utf8');
   if (/CREATE TRIGGER/i.test(sql)) assert.ok(!sql.includes('\r'),`${file} must use LF for the remote D1 parser.`);
   const parts=split(sql);
   for(const part of parts)assert.doesNotThrow(()=>db.exec(part),`${file}: ${part.slice(0,100)}`);
  }
  assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name LIKE 'product_reservation_%'").get().n,8);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='material_emails'").get());
 } finally {db.close();}
});
