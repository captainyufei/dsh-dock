import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import semver from 'semver';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'artifacts/release');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
assert.ok(semver.valid(manifest.version), 'Release version must be an exact SemVer');
if (process.env.GITHUB_REF_TYPE === 'tag') assert.equal(process.env.GITHUB_REF_NAME, `v${manifest.version}`);
const changelog = await readFile(join(root, 'CHANGELOG.md'), 'utf8');
const lines = changelog.split('\n');
const start = lines.findIndex(line => line === `## ${manifest.version}` || line.startsWith(`## ${manifest.version} `));
assert.ok(start >= 0, 'Add the release to CHANGELOG.md before preparing it');
const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
const notes = lines.slice(start, end < 0 ? undefined : end).join('\n').trim();
const temporary = await mkdtemp(join(tmpdir(), 'dsh-dock-release-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

try {
  await mkdir(output, {recursive: true});
  const [packed] = JSON.parse(execFileSync(npm, ['pack', '--json', '--ignore-scripts', '--pack-destination', temporary], {cwd: root, encoding: 'utf8'}));
  assert.equal(packed.name, manifest.name);
  assert.equal(packed.version, manifest.version);
  const tarball = join(temporary, packed.filename);
  execFileSync('tar', ['-xzf', tarball, '-C', temporary]);
  await rename(join(temporary, 'package'), join(temporary, 'dsh-dock'));
  const zipName = `dsh-dock-${manifest.version}.zip`;
  execFileSync('zip', ['-q', '-r', join(temporary, zipName), 'dsh-dock'], {cwd: temporary});
  const assets = [packed.filename, 'dsh-dock.tgz', zipName];
  await copyFile(tarball, join(output, packed.filename));
  await copyFile(tarball, join(output, 'dsh-dock.tgz'));
  await copyFile(join(temporary, zipName), join(output, zipName));
  const checksums = await Promise.all(assets.map(async name => {
    const bytes = await readFile(join(output, name));
    return `${createHash('sha256').update(bytes).digest('hex')}  ${name}`;
  }));
  await writeFile(join(output, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
  await writeFile(join(output, 'release-notes.md'), `${notes}\n\nDeclared Harness range: \`${manifest.engines.dsh}\`.\n\nRuntime and visual acceptance must be recorded separately before publication.\n`);
  await writeFile(join(output, 'release-assets.json'), JSON.stringify({name: manifest.name, version: manifest.version, hostRange: manifest.engines.dsh, assets}, null, 2) + '\n');
  console.log(JSON.stringify({prepared: true, published: false, directory: output, version: manifest.version, assets}, null, 2));
} finally {
  await rm(temporary, {recursive: true, force: true});
}
