import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import semver from 'semver';

const manifest=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'));
// Harness checks engines.dsh first with prereleases included. Keep this
// acceptance matrix explicit: a broad range must not silently admit new hosts.
const accepted=version=>semver.satisfies(version,manifest.engines.dsh,{includePrerelease:true});

test('the install manifest accepts both validated Harness baselines without a version exemption',()=>{
 for(const version of ['0.2.1-rc.5','0.2.2-rc.1'])assert.equal(accepted(version),true,version);
});

test('unvalidated Harness releases remain outside the installation boundary',()=>{
 for(const version of ['0.2.0','0.2.1-rc.6','0.2.2-rc.2','0.2.2','0.3.0'])assert.equal(accepted(version),false,version);
});

test('install metadata and optional primitive peers agree with the package lock',()=>{
 const root=lock.packages[''];
 assert.deepEqual(root.engines,manifest.engines);
 assert.deepEqual(root.peerDependencies,manifest.peerDependencies);
 assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-client-ui-primitives'],manifest.engines.dsh);
 assert.equal(root.version,manifest.version);
 assert.equal(lock.version,manifest.version);
});
