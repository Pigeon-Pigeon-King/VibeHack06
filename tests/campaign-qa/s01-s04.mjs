import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const candidate = process.argv[2];
if (!candidate) throw new Error('Usage: node tests/campaign-qa/s01-s04.mjs /absolute/frozen/candidate [--testNamePattern pattern]');
const root = resolve(candidate), out = process.env.QA_EVIDENCE_DIR
  ? resolve(process.env.QA_EVIDENCE_DIR)
  : resolve(import.meta.dirname, `../../artifacts/campaign-qa/replays/s01-s04-${Date.now()}`);
mkdirSync(out,{recursive:true});
const args = [resolve(root,'node_modules/vitest/vitest.mjs'),'run','--config',resolve(import.meta.dirname,'s01-s04.config.mts'),
  '--reporter=default','--reporter=json',`--outputFile.json=${resolve(out,'test-results.json')}`,...process.argv.slice(3)];
const start=Date.now();
const result=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,QA_CANDIDATE_ROOT:root,QA_S01_S04_OUT:out,RECORD_VISUAL_FIXTURES:'0'},encoding:'utf8',maxBuffer:32*1024*1024});
writeFileSync(resolve(out,'run.log'),(result.stdout??'')+(result.stderr??''));
writeFileSync(resolve(out,'execution.json'),JSON.stringify({schemaVersion:1,candidate:root,command:[process.execPath,...args],
  startedAt:new Date(start).toISOString(),endedAt:new Date().toISOString(),wallSeconds:(Date.now()-start)/1000,
  exitCode:result.status,error:result.error?.message,environment:{node:process.version,platform:process.platform,arch:process.arch},
  sourceMode:'Frozen candidate. Existing targeted public-input regressions plus independent failure/retry supplement. One worker. No browser.'},null,2)+'\n');
console.log(`exit=${result.status} wallSeconds=${(Date.now()-start)/1000}; evidence=${out}`);
if(result.status!==0) console.log((result.stdout??'').slice(-7000)+(result.stderr??'').slice(-7000));
process.exit(result.status??1);
