import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {audit, updateSource, selectHostRelease, latestHostRelease} from '../scripts/check-compatibility.mjs';

const manifest = {name: '@captainyufei/dsh-dock', version: '0.2.0', engines: {dsh: '0.2.1-rc.5 || 0.2.2-rc.1'}};
const release = (version, extra = {}) => ({tag_name: `dsh-v${version}`, published_at: '2026-11-11T11:33:06Z', html_url: `https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v${version}`, ...extra});

test('an upgrade outside the declared range is detected with prerelease semantics', () => {
  const report = audit({manifest, hostVersion: '0.2.2-rc.2', installedManifest: manifest, source: 'https://github.com/captainyufei/dsh-dock/releases/download/v0.2.0/dsh-dock.tgz'});
  assert.equal(report.ok, false);
  assert.deepEqual(report.problems, ['development-host-range', 'installed-host-range']);
  assert.deepEqual(report.updateSource, {kind: 'tarball', nativeUpdate: false});
  assert.match(report.scope, /not tested/);
});

test('updating source metadata cannot silently fix an older installed copy', () => {
  const development = {...manifest, engines: {dsh: '0.2.2-rc.2'}};
  const report = audit({manifest: development, hostVersion: '0.2.2-rc.2', installedManifest: manifest, source: '^0.2.0'});
  assert.equal(report.development.declarationAllowsHost, true);
  assert.equal(report.installed.declarationAllowsHost, false);
  assert.deepEqual(report.problems, ['installed-host-range']);
});

test('a supported declaration is reported as admission, without claiming runtime validation', () => {
  const report = audit({manifest, hostVersion: '0.2.2-rc.1'});
  assert.equal(report.ok, true);
  assert.equal(report.installed, null);
  assert.match(report.scope, /Runtime and visual compatibility are not tested/);
});

test('a newly released RC still alerts maintainers when the admission range already allows it', () => {
  const maintained = {...manifest, engines: {dsh: '>=0.2.2-rc.1 <0.2.3-0'}};
  const report = audit({manifest: maintained, hostVersion: '0.2.2-rc.3', validatedHosts: ['0.2.2-rc.1', '0.2.2-rc.2']});
  assert.equal(report.development.declarationAllowsHost, true);
  assert.equal(report.validationRecorded, false);
  assert.equal(report.ok, false);
  assert.deepEqual(report.problems, ['unvalidated-host']);
});

test('missing or malformed declarations fail closed instead of implying support', () => {
  for (const dsh of [undefined, '', 'workspace:*', 42, 'any version']) {
    const report = audit({manifest: {...manifest, engines: {dsh}}, hostVersion: '0.2.2-rc.1'});
    assert.equal(report.ok, false);
  }
  assert.throws(() => audit({manifest, hostVersion: 'latest'}), /exact SemVer/);
});

test('an installed package identity mismatch is reported', () => {
  const report = audit({manifest, hostVersion: '0.2.2-rc.1', installedManifest: {...manifest, name: 'another-plugin'}});
  assert.deepEqual(report.problems, ['installed-package-identity']);
});

test('native update eligibility distinguishes registry, aliases, paths, tarballs and Git refs', () => {
  const sha = 'a'.repeat(40);
  for (const [source, kind, nativeUpdate] of [
    ['^0.2.0', 'registry', true], ['latest', 'registry', true],
    ['npm:another-plugin@1.0.0', 'alias', false],
    ['file:/tmp/dsh-dock.tgz', 'local', false], ['link:/tmp/dock', 'local', false],
    ['/tmp/dock', 'local', false], ['C:\\plugins\\dock', 'local', false],
    ['https://example.com/dock.tgz?token=private', 'tarball', false],
    ['github:captainyufei/dsh-dock#v0.2.0', 'git', false],
    ['github:captainyufei/dsh-dock#main', 'git', false],
    [`git+https://github.com/captainyufei/dsh-dock.git#${sha}`, 'git', true],
    [`github:captainyufei/dsh-dock#${sha}&path:/packages/dock`, 'git', true],
    [undefined, 'unknown', false],
  ]) assert.deepEqual(updateSource(source), {kind, nativeUpdate}, source);
});

test('upstream lookup includes prereleases and ignores drafts, desktop tags and malformed data', () => {
  const releases = [release('0.2.2-rc.1'), release('0.2.2-rc.2'), release('0.3.0', {draft: true}), release('0.4.0', {published_at: null}), release('bad'), release('9.0.0', {tag_name: 'desktop-v9.0.0'})];
  assert.equal(selectHostRelease(releases).version, '0.2.2-rc.2');
  assert.throws(() => selectHostRelease([]), /No published/);
  assert.throws(() => selectHostRelease({}), /release list/);
});

test('GitHub errors are not confused with a successful no-update result', async () => {
  await assert.rejects(latestHostRelease(async () => ({ok: false, status: 403}), ''), /HTTP 403/);
  await assert.rejects(latestHostRelease(async () => { throw new Error('offline'); }, ''), /offline/);
});

test('release lookup uses a fixed endpoint, refuses redirects and does not expose its token in the result', async () => {
  let options;
  const result = await latestHostRelease(async (url, init) => {
    assert.equal(url, 'https://api.github.com/repos/deepseek-ai/deepseek-harness/releases?per_page=100');
    options = init;
    return {ok: true, json: async () => [release('0.2.2-rc.2')]};
  }, 'test-secret');
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers.authorization, 'Bearer test-secret');
  assert.equal(JSON.stringify(result).includes('test-secret'), false);
});

test('the CLI writes its failure report and audits only the requested plugin in a profile', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-dock-audit-'));
  try {
    const installed = join(temporary, 'profile/node_modules/@captainyufei/dsh-dock');
    await mkdir(installed, {recursive: true});
    await writeFile(join(temporary, 'manifest.json'), JSON.stringify(manifest));
    await writeFile(join(temporary, 'profile/package.json'), JSON.stringify({dependencies: {[manifest.name]: 'https://example.com/dock.tgz?token=secret', unrelated: 'private'}}));
    await writeFile(join(installed, 'package.json'), JSON.stringify(manifest));
    const reportPath = join(temporary, 'reports/result.json');
    const command = fileURLToPath(new URL('../scripts/check-compatibility.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [command, '--manifest', join(temporary, 'manifest.json'), '--host', '0.2.2-rc.2', '--profile', join(temporary, 'profile'), '--report', reportPath], {encoding: 'utf8'});
    assert.equal(result.status, 1, result.stderr);
    const saved = await readFile(reportPath, 'utf8');
    assert.deepEqual(JSON.parse(result.stdout), JSON.parse(saved));
    assert.equal(saved.includes('secret'), false);
    assert.equal(saved.includes('unrelated'), false);
    const invalid = spawnSync(process.execPath, [command, '--host'], {encoding: 'utf8'});
    assert.equal(invalid.status, 2);
    await writeFile(join(temporary, 'profile/package.json'), '{"private": "do-not-print-this-secret", bad-json}');
    const malformed = spawnSync(process.execPath, [command, '--manifest', join(temporary, 'manifest.json'), '--host', '0.2.2-rc.1', '--profile', join(temporary, 'profile')], {encoding: 'utf8'});
    assert.equal(malformed.status, 2);
    assert.match(malformed.stderr, /Invalid JSON/);
    assert.equal(malformed.stderr.includes('do-not-print-this-secret'), false);
  } finally {
    await rm(temporary, {recursive: true, force: true});
  }
});
