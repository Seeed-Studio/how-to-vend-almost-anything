import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_BASE, normalize, normalizeDirectory, refreshDirectory } from "./fetch-fablabs-directory.mjs";
const record = { id: 1, name: "Example Lab", slug: "example", country_code: "FR", city: "Paris", latitude: null, longitude: null, capabilities: ["laser"], links: [{url:"https://facebook.com/example"},{url:"https://example.org"}], activity_status: "closed" };
const day = "2026-10-10";
test("public fields retain directory status and prefer non-social supplied websites", () => {
 const result = normalize({...record,participation_status:"verified",email:"private@example.org",phone:"123"},day);
 assert.equal(result.participation_status,"directory");
 assert.equal(result.verification_date,null);
 assert.equal(result.lab_website,"https://example.org/");
 assert.equal(result.directory_links.length,2);
 assert.equal(result.country,"France");
 assert.equal(result.activity_status,"closed");
 assert.deepEqual(result.capabilities,["laser"]);
 assert.equal("email" in result,false);
 assert.equal("phone" in result,false);
});
test("Chaihuo keeps a directory-supplied point and receives the published place only when coordinates are absent", () => {
 const chaihuo = { id: 1543, name: "Chaihuo Makerspace", slug: "chaihuomakerspace", country_code: "CN", city: "Shenzhen", latitude: null, longitude: null, links: [], activity_status: "active" };
 const placed = normalize(chaihuo, day);
 assert.equal(placed.latitude, 22.5767074);
 assert.equal(placed.longitude, 113.9387176);
 assert.equal(normalize({ ...chaihuo, latitude: 22.5, longitude: 114 }, day).latitude, 22.5);
});
test("absent coordinates are null, valid zero is retained, and invalid ranges are rejected", () => {
 assert.equal(normalize(record,day).latitude,null);
 assert.equal(normalize({...record,latitude:"",longitude:false},day).longitude,null);
 assert.equal(normalize({...record,latitude:"   ",longitude:"\t"},day).latitude,null);
 assert.equal(normalize({...record,latitude:[],longitude:{}},day).longitude,null);
 assert.equal(normalize({...record,latitude:0,longitude:0},day).latitude,0);
 assert.equal(normalize({...record,latitude:91,longitude:181},day).latitude,null);
});
test("unsafe links are discarded and social-only links do not become websites", () => {
 const result=normalize({...record,links:[{url:"javascript:alert(1)"},{url:"https://user:password@example.org"},{url:"https://instagram.com/example"}]},day);
 assert.equal(result.lab_website,"");
 assert.deepEqual(result.directory_links,["https://instagram.com/example"]);
});
test("empty, paginated, malformed and duplicate payloads cannot replace the full snapshot", () => {
 for(const payload of [[],{data:[record]},[null],[{id:1}],[record,record]]) assert.throws(()=>normalizeDirectory(payload,day));
});
function fixture() {
 const rootPath=mkdtempSync(join(tmpdir(),"fab-directory-test-"));
 const paths=["en","ch"].map(locale=>join(rootPath,"docs",locale,"data","directory-labs.json"));
 paths.forEach(path=>{mkdirSync(join(path,".."),{recursive:true});writeFileSync(path,JSON.stringify({status:"awaiting_token",labs:[],attribution:"FabLabs.io"}));});
 return {rootPath,paths};
}
test("refresh calls the full public feed once without credentials and updates both locales", async () => {
 const {rootPath,paths}=fixture();
 let count=0;
 try {
  await refreshDirectory({rootPath,fetchImpl:async (url,options)=>{
   count++; assert.equal(url.href,`${DEFAULT_BASE}/labs`); assert.equal(url.search,"");
   assert.equal(options.headers.Authorization,undefined);
   return {ok:true,json:async()=>[record]};
  }});
  assert.equal(count,1);
  const en=JSON.parse(readFileSync(paths[0],"utf8"));const ch=JSON.parse(readFileSync(paths[1],"utf8"));
  assert.deepEqual(en.labs,ch.labs);assert.equal(en.labs[0].latitude,null);assert.equal(en.status,"ok");
  const prior=paths.map(path=>readFileSync(path,"utf8"));
  await refreshDirectory({rootPath,fetchImpl:async()=>({ok:true,json:async()=>[record]})});
  assert.deepEqual(paths.map(path=>readFileSync(path,"utf8")),prior);
 } finally {rmSync(rootPath,{recursive:true,force:true});}
});
test("API errors and invalid data preserve both last-good snapshots", async () => {
 const {rootPath,paths}=fixture();
 const previous=paths.map(path=>readFileSync(path,"utf8"));
 try {
  for(const response of [{ok:false,status:503},{ok:true,json:async()=>[]},{ok:true,json:async()=>({data:[record]})}]) {
   await assert.rejects(refreshDirectory({rootPath,fetchImpl:async()=>response}));
   assert.deepEqual(paths.map(path=>readFileSync(path,"utf8")),previous);
  }
 } finally {rmSync(rootPath,{recursive:true,force:true});}
});
