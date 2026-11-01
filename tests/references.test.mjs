import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionMention} from '../src/references.js';
test('canonical session mention preserves id and escapes a localized label',()=>{
 const value=sessionMention('session-中文','草稿]\\');
 assert.match(value,/^@\[草稿\\\]\\\\\]\(dsh-session:/u);
 const encoded=value.split('dsh-session:')[1].slice(0,-1);
 assert.equal(JSON.parse(Buffer.from(encoded,'base64url').toString()),'session-中文');
});
