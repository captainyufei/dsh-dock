import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import semver from 'semver';

const root = fileURLToPath(new URL('../', import.meta.url));
const releasesURL = 'https://api.github.com/repos/deepseek-ai/deepseek-harness/releases?per_page=100';

// Mirrors the update-source boundary documented by Harness 0.2.2-rc.2.
// This is an audit for this package, not a substitute for pluginManager.
export function updateSource(source) {
  if (typeof source !== 'string' || source.trim() === '') return {kind: 'unknown', nativeUpdate: false};
  if (/^(?:file|link):|^(?:\/|[A-Za-z]:[\\/])/.test(source)) return {kind: 'local', nativeUpdate: false};
  if (/^npm:/.test(source)) return {kind: 'alias', nativeUpdate: false};
  if (/^(?:https?|git\+https?):/.test(source)) {
    try {
      if (/\.(?:tgz|tar\.gz|zip)$/i.test(new URL(source.replace(/^git\+/, '')).pathname)) {
        return {kind: 'tarball', nativeUpdate: false};
      }
    } catch { return {kind: 'unknown', nativeUpdate: false}; }
  }
  if (/^(?:git(?:\+[a-z]+)?:|git@|github:|gitlab:|bitbucket:|https?:)/i.test(source)) {
    return {kind: 'git', nativeUpdate: /#[a-f0-9]{40}(?:&path:[^&]+)?$/i.test(source)};
  }
  if (semver.validRange(source) !== null || /^[a-z][a-z0-9._-]*$/i.test(source)) {
    return {kind: 'registry', nativeUpdate: true};
  }
  return {kind: 'unknown', nativeUpdate: false};
}

export function selectHostRelease(releases) {
  if (!Array.isArray(releases)) throw new Error('GitHub did not return a release list');
  const candidates = releases.flatMap(release => {
    const version = /^dsh-v(.+)$/.exec(release.tag_name ?? '')?.[1];
    return !release.draft && release.published_at && semver.valid(version)
      ? [{version, url: release.html_url, publishedAt: release.published_at}]
      : [];
  });
  candidates.sort((a, b) => semver.rcompare(a.version, b.version));
  if (candidates.length === 0) throw new Error('No published dsh-v SemVer release was found');
  return candidates[0];
}

function declaration(manifest, hostVersion) {
  const range = manifest.engines?.dsh;
  // Our plugin owns engines.dsh. Do not guess a missing/invalid declaration,
  // or claim that inspecting metadata proves that the client can run.
  const valid = typeof range === 'string' && range.trim() !== '' && semver.validRange(range) !== null;
  return {
    version: manifest.version ?? null,
    range: typeof range === 'string' ? range : null,
    declarationAllowsHost: valid && semver.satisfies(hostVersion, range, {includePrerelease: true}),
    validDeclaration: valid,
  };
}

export function audit({manifest, hostVersion, installedManifest, source, release, validatedHosts}) {
  if (!semver.valid(hostVersion)) throw new Error('The Host version must be an exact SemVer version');
  const development = declaration(manifest, hostVersion);
  const installed = installedManifest ? declaration(installedManifest, hostVersion) : null;
  const problems = [];
  if (!development.declarationAllowsHost) problems.push('development-host-range');
  if (installed && !installed.declarationAllowsHost) problems.push('installed-host-range');
  if (installedManifest && installedManifest.name !== manifest.name) problems.push('installed-package-identity');
  const validationRecorded = validatedHosts ? validatedHosts.includes(hostVersion) : null;
  if (validationRecorded === false) problems.push('unvalidated-host');
  return {
    checkedAt: new Date().toISOString(),
    package: manifest.name,
    hostVersion,
    release: release ?? null,
    development,
    installed,
    updateSource: updateSource(source),
    validationRecorded,
    problems,
    ok: problems.length === 0,
    scope: 'Manifest admission and update-source audit only. Runtime and visual compatibility are not tested.',
  };
}

export async function latestHostRelease(fetcher = fetch, token = process.env.GITHUB_TOKEN) {
  const headers = {accept: 'application/vnd.github+json', 'user-agent': 'dsh-dock-compatibility-audit'};
  if (token) headers.authorization = `Bearer ${token}`;
  // The token is sent only to this fixed GitHub API URL, never to redirects.
  const response = await fetcher(releasesURL, {headers, redirect: 'error', signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`GitHub release lookup failed (HTTP ${response.status})`);
  return selectHostRelease(await response.json());
}

export async function main(args = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--upstream') options.upstream = true;
    else if (['--host', '--manifest', '--profile', '--report'].includes(key)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${key}`);
      options[key.slice(2)] = args[++i];
    } else throw new Error(`Unknown argument: ${key}`);
  }
  if (Boolean(options.host) === Boolean(options.upstream)) throw new Error('Choose exactly one of --host <version> or --upstream');
  const manifest = JSON.parse(await readFile(options.manifest ? resolve(options.manifest) : resolve(root, 'package.json'), 'utf8'));
  const policy = JSON.parse(await readFile(resolve(root, 'compatibility.json'), 'utf8'));
  if (!Array.isArray(policy.validatedHosts) || policy.validatedHosts.some(version => !semver.valid(version))) {
    throw new Error('compatibility.json must list exact validated Host versions');
  }
  const release = options.upstream ? await latestHostRelease() : undefined;
  let installedManifest, source;
  if (options.profile) {
    const profileRoot = resolve(options.profile);
    const profile = JSON.parse(await readFile(resolve(profileRoot, 'package.json'), 'utf8'));
    source = profile.dependencies?.[manifest.name];
    if (source === undefined) throw new Error('The profile does not declare this plugin');
    installedManifest = JSON.parse(await readFile(resolve(profileRoot, 'node_modules', manifest.name, 'package.json'), 'utf8'));
  }
  const report = audit({manifest, hostVersion: options.host ?? release.version, installedManifest, source, release, validatedHosts: policy.validatedHosts});
  const json = JSON.stringify(report, null, 2) + '\n';
  if (options.report) {
    const path = resolve(options.report);
    await mkdir(dirname(path), {recursive: true});
    await writeFile(path, json);
  }
  process.stdout.write(json);
  return report.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    // Do not echo response bodies, credentials, full source URLs or profile data.
    const reason = error instanceof SyntaxError ? 'Invalid JSON in an input manifest or release response' : error.code ?? error.message;
    process.stderr.write(`Compatibility audit failed: ${reason}\n`);
    process.exitCode = 2;
  });
}
