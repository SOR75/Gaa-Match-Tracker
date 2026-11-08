import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {APP_VERSION} from '../src/build-info.js';
test('V0.3.14-dev package, lockfile, displayed title and build metadata agree',()=>{
 const json=p=>JSON.parse(readFileSync(p,'utf8')),pkg=json('package.json'),lock=json('package-lock.json'),build=json('public/build-info.json');
 for(const version of [pkg.version,lock.version,lock.packages[''].version,build.version,build.buildId,APP_VERSION])assert.equal(version,'0.3.14-dev');
 assert.equal(build.branch,'sideline-v0.3.14');assert.match(readFileSync('index.html','utf8'),/<title>Sideline V0\.3\.14-dev<\/title>/);
});
