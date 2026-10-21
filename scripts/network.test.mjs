import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../docs/en/assets/js/network.js', import.meta.url), 'utf8').replace(/\ninit\(\);\s*$/, '');
const context = vm.createContext({ URL, console });
vm.runInContext(source, context);
const lab = { lab_id: 'fablabs:1', name: 'Test lab', city: 'Paris', country: 'France', latitude: null, longitude: null, participation_status: 'directory', machines: [] };
test('directory membership never creates a vending installation', () => {
 const result = context.buildLabs({labs:[{...lab,participation_status:'verified'}]}, {labs:[]}, {machines:[]}, {updates:[]});
 assert.equal(result[0].participation_status, 'directory');
 assert.equal(result[0].marker_status, 'directory');
 assert.equal(result[0].machines.length, 0);
});
test('reviewed program records override directory status and proposed machines stay private', () => {
 const result = context.buildLabs({labs:[lab]}, {labs:[{...lab,participation_status:'verified'}]}, {machines:[{lab_id:lab.lab_id,installation_status:'proposed'},{lab_id:lab.lab_id,installation_status:'verified'}]}, {updates:[{lab_id:lab.lab_id,review_status:'approved'}]});
 assert.equal(result[0].marker_status, 'recent_update');
 assert.equal(result[0].machines.length, 1);
});
test('search and participation filters retain existing behavior', () => {
 const candidate = {...lab, marker_status:'directory'};
 const state = {status:'all', machine:'any', category:'all', recent:false};
 assert.equal(context.matches(candidate, 'paris', state), true);
 assert.equal(context.matches(candidate, 'rome', state), false);
 assert.equal(context.matches(candidate, '', {...state,status:'verified'}), false);
 assert.equal(context.matches(candidate, '', {...state,machine:'with'}), false);
});
test('country, activity and capabilities can be combined without implying equipment access', () => {
 const candidate = {...lab, marker_status:'directory', activity_status:'closed', capabilities:['laser']};
 const state = {status:'all', machine:'any', category:'all', recent:false, country:'France', activity:'closed', capability:'laser'};
 assert.equal(context.matches(candidate, '', state),true);
 assert.equal(context.matches(candidate, '', {...state,activity:'active'}),false);
 assert.equal(context.matches(candidate, '', {...state,country:'Germany'}),false);
 assert.equal(context.matches(candidate, '', {...state,capability:'cnc_milling'}),false);
});
test('prefilled issue drafts use form field IDs and preserve special characters', () => {
 const item={...lab,name:'Fab & Co / <test>',official_fablabs_url:'https://www.fablabs.io/labs/test',lab_website:'https://example.org'};
 const url=new URL(context.issueHref(item,'interest'));
 assert.equal(url.searchParams.get('lab-name'),item.name);
 assert.equal(url.searchParams.get('template'),'register-interest.yml');
 assert.equal(url.searchParams.get('country'),'France');
 assert.equal(url.searchParams.get('website'),'https://example.org/');
 assert.equal(url.searchParams.has('body'),false);
 assert.equal(new URL(context.issueHref(item,'correction')).searchParams.get('record'),`${item.lab_id} · ${item.name}`);
});
test('a status filter keeps the selected marker and drops the others', () => {
 const directory = {...lab, marker_status:'directory'};
 const pilot = {...lab, lab_id:'fablabs:1543', name:'Chaihuo Makerspace', marker_status:'pilot'};
 const state = {status:'pilot', machine:'any', category:'all', recent:false};
 assert.equal(context.matches(pilot, '', state), true);
 assert.equal(context.matches(directory, '', state), false);
});
test('map locations reject missing, infinite and out-of-range coordinates', () => {
 for (const candidate of [lab,{latitude:Infinity,longitude:0},{latitude:91,longitude:0}]) assert.equal(context.hasCoords(candidate),false);
 assert.equal(context.hasCoords({latitude:0,longitude:0}),true);
});
test('website links reject script URLs and embedded credentials', () => {
 assert.equal(context.safeHref('javascript:alert(1)'), '');
 assert.equal(context.safeHref('https://user:password@example.org'), '');
 assert.equal(context.safeHref('https://'), '');
 assert.equal(context.safeHref('https://example.org'), 'https://example.org/');
});
test('returning visitors revalidate directory data rather than reuse an empty cached snapshot', async () => {
 let request;
 context.fetch=async(path,options)=>{request={path,options};return {ok:true,json:async()=>({labs:[lab]})};};
 const result=await context.load('data/directory-labs.json');
 assert.equal(request.path,'data/directory-labs.json');
 assert.equal(request.options.cache,'no-cache');
 assert.equal(result.labs.length,1);
});
