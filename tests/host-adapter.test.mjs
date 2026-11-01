import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostAdapter } from '../src/host-adapter.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function mockHost() {
  const calls = [];
  let uploads = {};
  const uploadListeners = new Set();
  let nextAttachment = 0;
  const descriptors = new Map();
  const model = { provider: 'deepseek', model: 'flash', reasoningEffort: 'max' };
  const session = { prompt: async (...args) => {
    calls.push(['prompt', ...args]);
    return { ok: true, value: { accepted: true } };
  } };
  const ctx = {
    sessions: {
      create: async request => { calls.push(['create', request]); return 'fresh-session'; },
      retain: (id, options) => {
        calls.push(['retain', id, options]);
        return { ready: Promise.resolve({ sessionId: id, session }), release() { calls.push(['release', id]); } };
      },
    },
    workspaces: { list: { getSnapshot: () => ({ phase: 'ready', items: [{ workspaceId: 'w1', title: 'Work' }] }) } },
    uiWorkspace: { openSession: id => { calls.push(['open', id]); } },
    remote: {
      session: {
        modelCatalog: async () => ({ ok: true, value: { default: model, groups: [{ id: 'deepseek', models: [{ id: 'flash', reasoning: { efforts: [{ id: 'max' }], defaultEffort: 'max' } }] }] } }),
        selectModel: async payload => { calls.push(['model', payload]); return { ok: true, value: undefined }; },
      },
      permissionPresets: { catalog: async () => ({ ok: true, value: { defaultPreset: 'workspace', options: [{ value: 'workspace' }, { value: 'unrestricted' }] } }) },
      agentPresets: { list: async () => ({ ok: true, value: { presets: [{ id: 'standard', isDefault: true }] } }) },
      commands: { execute: async (...args) => { calls.push(['command', ...args]); return { ok: true, value: { result: { kind: 'success' } } }; } },
    },
    conversation: {
      fileUploads: { getSnapshot: () => uploads, subscribe: callback => { uploadListeners.add(callback); return () => uploadListeners.delete(callback); } },
      createDrafts: (sessionId, files) => files.map(file => {
        const descriptor = { id: `a${++nextAttachment}`, file, kind: file.type.startsWith('image/') ? 'image' : 'file' };
        descriptors.set(descriptor.id, descriptor);
        calls.push(['attachment', sessionId, file.name]);
        if (descriptor.kind === 'file') uploads[descriptor.id] = { status: 'uploading' };
        return descriptor;
      }),
      serializeDraftAttachments: async ids => ({ attachments: ids.map(id => descriptors.get(id).kind === 'image' ? { type: 'image', mediaType: 'image/png', data: 'YWJj' } : { type: 'file', receiptId: uploads[id].receiptId }) }),
      releaseDraftAttachment: id => { descriptors.delete(id); calls.push(['releaseAttachment', id]); },
      retryFileUpload: (id, attachmentId) => { calls.push(['retryUpload', id, attachmentId]); uploads[attachmentId] = { status: 'uploading' }; },
    },
  };
  return { ctx, calls, session, model,
    setUpload(id, value) { uploads = { ...uploads, [id]: value }; for (const callback of uploadListeners) callback(); },
    listenerCount: () => uploadListeners.size,
  };
}

const draft = overrides => ({ workspaceId: 'w1', agentPreset: 'standard', modelSelection: null, permissionPreset: null, text: 'Hello', files: [], ...overrides });

test('opening menus and reading global defaults create no Session or permission changes', async () => {
  const host = mockHost();
  const adapter = createHostAdapter(host.ctx);
  assert.equal((await adapter.loadModels())[0].id, 'deepseek');
  assert.equal((await adapter.loadPermissions())[0].value, 'workspace');
  assert.equal((await adapter.loadPresets())[0].id, 'standard');
  assert.equal((await adapter.loadWorkspaces())[0].workspaceId, 'w1');
  assert.deepEqual(await adapter.loadDefaults(), { modelSelection: host.model, permissionPreset: 'workspace', agentPreset: 'standard', workspaceId: null });
  assert.deepEqual(host.calls, []);
});

test('create requests a fresh Session without navigation or reusing another draft', async () => {
  const host = mockHost();
  const adapter = createHostAdapter(host.ctx);
  const handle = await adapter.create(draft());
  assert.deepEqual(handle, { sessionId: 'fresh-session' });
  assert.deepEqual(host.calls, [['create', { workspaceId: 'w1', agentPreset: 'standard' }], ['retain', 'fresh-session', { source: 'controllerOperation' }]]);
});

test('stale selections fail before a Session is created', async () => {
  const host = mockHost();
  const adapter = createHostAdapter(host.ctx);
  await assert.rejects(adapter.create(draft({ modelSelection: { provider: 'removed', model: 'old' } })), /模型已不可用/);
  await assert.rejects(adapter.create(draft({ permissionPreset: 'removed' })), /权限已不可用/);
  assert.deepEqual(host.calls, []);
});

test('broken presets are excluded from menus and refused before creation', async () => {
  const host = mockHost();
  host.ctx.remote.agentPresets.list = async () => ({ ok: true, value: { presets: [{ id: 'standard', isDefault: true }, { id: 'broken-mode', broken: { message: 'missing tool' } }] } });
  const adapter = createHostAdapter(host.ctx);
  assert.deepEqual((await adapter.loadPresets()).map(item => item.id), ['standard']);
  await assert.rejects(adapter.create(draft({ agentPreset: 'broken-mode' })), /模式已不可用/);
  assert.deepEqual(host.calls, []);
});

test('default workspace follows the actually-retained current Session membership, then cwd', async () => {
  const host = mockHost();
  host.ctx.workspaces.list.getSnapshot = () => ({ phase: 'ready', items: [{ workspaceId: 'amazon', path: '/amazon', sessionIds: [] }, { workspaceId: 'video', path: '/video', sessionIds: ['video-session'] }] });
  host.ctx.sessions.list = { getSnapshot: () => ({ byId: { current: { id: 'video-session', cwd: '/amazon', retainedBy: { mainView: 1 } } } }) };
  const adapter = createHostAdapter(host.ctx);
  assert.equal((await adapter.loadDefaults()).workspaceId, 'video');
  host.ctx.sessions.list.getSnapshot = () => ({ byId: { current: { id: 'ungrouped', cwd: '/video', retainedBy: { mainView: 1 } } } });
  assert.equal((await adapter.loadDefaults()).workspaceId, 'video');
  assert.deepEqual(host.calls, []);
});

test('configuration applies only to the newly-created Session and refuses handler errors', async () => {
  const host = mockHost();
  const adapter = createHostAdapter(host.ctx);
  const snapshot = draft({ modelSelection: host.model, permissionPreset: 'workspace' });
  const handle = await adapter.create(snapshot);
  await adapter.configure(handle, snapshot);
  assert.deepEqual(host.calls.filter(call => call[0] === 'model'), [['model', { sessionId: 'fresh-session', ...host.model }]]);
  assert.deepEqual(host.calls.filter(call => call[0] === 'command'), [['command', 'fresh-session', '/permission workspace', []]]);
  host.ctx.remote.commands.execute = async () => ({ ok: true, value: { result: { kind: 'error', text: 'denied' } } });
  await assert.rejects(adapter.configure(handle, snapshot), /denied/);
  assert.equal(host.calls.some(call => call[0] === 'prompt'), false);
});

test('disposal during model configuration stops the following permission write', async () => {
  const host = mockHost();
  const selection = deferred();
  host.ctx.remote.session.selectModel = async () => selection.promise;
  const adapter = createHostAdapter(host.ctx);
  const snapshot = draft({ modelSelection: host.model, permissionPreset: 'workspace' });
  const handle = await adapter.create(snapshot);
  const configuring = adapter.configure(handle, snapshot);
  await new Promise(resolve => setImmediate(resolve));
  adapter.dispose();
  selection.resolve({ ok: true, value: undefined });
  await assert.rejects(configuring, /插件已关闭/);
  assert.equal(host.calls.some(call => call[0] === 'command'), false);
});

test('a failed opening can retry a new reference to the same Session without creating another', async () => {
  const host = mockHost();
  const opening = deferred();
  let retainCount = 0;
  host.ctx.sessions.retain = (id, options) => {
    host.calls.push(['retain', id, options]);
    const ready = ++retainCount === 1 ? opening.promise : Promise.resolve({ sessionId: id, session: host.session });
    return { ready, release() { host.calls.push(['release', id]); } };
  };
  const adapter = createHostAdapter(host.ctx);
  const handle = await adapter.create(draft());
  const configuring = adapter.configure(handle, draft());
  opening.reject(new Error('offline during open'));
  await assert.rejects(configuring, /offline during open/);
  await adapter.configure(handle, draft());
  assert.equal((await adapter.send(handle, draft())).accepted, true);
  assert.equal(host.calls.filter(call => call[0] === 'create').length, 1);
  assert.equal(retainCount, 2);
  assert.equal(host.calls.filter(call => call[0] === 'release').length, 1);
  adapter.dispose();
  assert.equal(host.calls.filter(call => call[0] === 'release').length, 2);
});

test('a synchronous retain failure also preserves the already-created Session handle', async () => {
  const host = mockHost();
  const retain = host.ctx.sessions.retain;
  let attempts = 0;
  host.ctx.sessions.retain = (...args) => {
    if (++attempts === 1) throw new Error('temporarily closed');
    return retain(...args);
  };
  const adapter = createHostAdapter(host.ctx);
  const handle = await adapter.create(draft());
  await assert.rejects(adapter.configure(handle, draft()), /temporarily closed/);
  await adapter.configure(handle, draft());
  assert.equal(host.calls.filter(call => call[0] === 'create').length, 1);
  adapter.dispose();
});

test('send resolves only after accepted:true and coalesces double clicks', async () => {
  const host = mockHost();
  const admission = deferred();
  host.session.prompt = (...args) => { host.calls.push(['prompt', ...args]); return admission.promise; };
  const adapter = createHostAdapter(host.ctx);
  const handle = await adapter.create(draft());
  const first = adapter.send(handle, draft());
  assert.equal(adapter.send(handle, draft()), first);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(host.calls.filter(call => call[0] === 'prompt').length, 1);
  let done = false;
  first.then(() => { done = true; });
  await Promise.resolve();
  assert.equal(done, false);
  admission.resolve({ ok: true, value: { accepted: true } });
  assert.equal((await first).accepted, true);
  await adapter.send(handle, draft());
  assert.equal(host.calls.filter(call => call[0] === 'prompt').length, 1);
  assert.equal(host.calls.some(call => call[0] === 'open'), false);
  adapter.open(handle);
  assert.deepEqual(host.calls.slice(-2), [['open', 'fresh-session'], ['release', 'fresh-session']]);
});

test('explicit Host refusal preserves the handle and supports retry without another Session', async () => {
  const host = mockHost();
  let attempt = 0;
  host.session.prompt = async () => ++attempt === 1 ? { ok: false, error: { code: 'ACCOUNT_QUOTA', message: 'quota exhausted' } } : { ok: true, value: { accepted: true } };
  const adapter = createHostAdapter(host.ctx);
  const handle = await adapter.create(draft());
  await assert.rejects(adapter.send(handle, draft()), /quota exhausted/);
  assert.equal((await adapter.send(handle, draft())).accepted, true);
  assert.equal(host.calls.filter(call => call[0] === 'create').length, 1);
});

test('lost transport response locks resending to avoid duplicate admission', async () => {
  const host = mockHost();
  let attempt = 0;
  host.session.prompt = async () => { attempt++; throw Object.assign(new Error('closed'), { code: 'ECONNRESET' }); };
  const adapter = createHostAdapter(host.ctx);
  const handle = await adapter.create(draft());
  await assert.rejects(adapter.send(handle, draft()), error => error.code === 'SEND_UNCERTAIN');
  await assert.rejects(adapter.send(handle, draft()), error => error.code === 'SEND_UNCERTAIN');
  assert.equal(attempt, 1);
});

test('Gateway-folded transport failures and malformed admission replies are uncertain', async () => {
  for (const result of [
    { ok: false, error: { code: 'gateway/internal', message: 'client api: session/prompt failed: closed' } },
    { ok: false, error: { code: 'gateway/cancelled', message: 'aborted' } },
    { ok: true, value: undefined },
  ]) {
    const host = mockHost();
    let attempts = 0;
    host.session.prompt = async () => { attempts++; return result; };
    const adapter = createHostAdapter(host.ctx);
    const handle = await adapter.create(draft());
    await assert.rejects(adapter.send(handle, draft()), error => error.code === 'SEND_UNCERTAIN');
    await assert.rejects(adapter.send(handle, draft()), error => error.code === 'SEND_UNCERTAIN');
    assert.equal(attempts, 1);
  }
});

test('files wait for upload receipts and share one admitted prompt with text and images', async () => {
  const host = mockHost();
  const adapter = createHostAdapter(host.ctx);
  const snapshot = draft({ files: [{ id: 'i', file: { name: 'image.png', type: 'image/png' } }, { id: 'f', file: { name: 'notes.txt', type: 'text/plain' } }] });
  const handle = await adapter.create(snapshot);
  const sending = adapter.send(handle, snapshot);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(host.calls.some(call => call[0] === 'prompt'), false);
  host.setUpload('a2', { status: 'ready', receiptId: 'receipt-1' });
  assert.equal((await sending).accepted, true);
  assert.deepEqual(host.calls.find(call => call[0] === 'prompt'), ['prompt', [{ type: 'image', mediaType: 'image/png', data: 'YWJj' }, { type: 'file', receiptId: 'receipt-1' }, { type: 'text', text: 'Hello' }], 'queue']);
  assert.equal(host.listenerCount(), 0);
  assert.equal(host.calls.filter(call => call[0] === 'releaseAttachment').length, 2);
});

test('a slash command uses command admission and an unknown slash preserves the draft without prompting', async () => {
  const host = mockHost();
  const adapter = createHostAdapter(host.ctx);
  const handle = await adapter.create(draft());
  assert.equal((await adapter.send(handle, draft({ text: '/plan' }))).command, true);
  assert.equal(host.calls.some(call => call[0] === 'prompt'), false);
  const secondHost = mockHost();
  secondHost.ctx.remote.commands.execute = async () => ({ ok: true, value: undefined });
  const secondAdapter = createHostAdapter(secondHost.ctx);
  const secondHandle = await secondAdapter.create(draft());
  await assert.rejects(secondAdapter.send(secondHandle, draft({ text: '/unknown-command' })), error => error.code === 'COMMAND_NOT_FOUND');
  assert.equal(secondHost.calls.some(call => call[0] === 'prompt'), false);
});

test('opening an unaccepted prepared Session for inspection preserves its handle for retry', async () => {
  const host = mockHost();
  const adapter = createHostAdapter(host.ctx);
  const handle = await adapter.create(draft());
  adapter.open(handle);
  assert.equal(host.calls.some(call => call[0] === 'release'), false);
  await adapter.configure(handle, draft());
  await adapter.send(handle, draft());
  adapter.open(handle);
  adapter.open(handle);
  assert.equal(host.calls.filter(call => call[0] === 'open').length, 3);
  assert.equal(host.calls.filter(call => call[0] === 'release').length, 1);
});

test('an unknown creation response is locked instead of creating duplicate Sessions on retry', async () => {
  const host = mockHost();
  let attempts = 0;
  host.ctx.sessions.create = async () => { attempts++; throw { rpcError: { code: 'gateway/internal' } }; };
  const adapter = createHostAdapter(host.ctx);
  await assert.rejects(adapter.create(draft()), error => error.code === 'CREATE_UNCERTAIN');
  await assert.rejects(adapter.create(draft()), error => error.code === 'CREATE_UNCERTAIN');
  assert.equal(attempts, 1);
  host.ctx.sessions.create = async () => { attempts++; return 'checked-new-session'; };
  assert.equal(adapter.resetCreateUncertainty(), true);
  assert.equal((await adapter.create(draft())).sessionId, 'checked-new-session');
  assert.equal(attempts, 2);
});

test('recovered Session ids can be opened without a retained adapter handle', () => {
  const host = mockHost();
  const adapter = createHostAdapter(host.ctx);
  adapter.open({ sessionId: 'previously-prepared-session' });
  assert.deepEqual(host.calls, [['open', 'previously-prepared-session']]);
});

test('a create response arriving after disposal does not retain a leaked Session', async () => {
  const host = mockHost();
  const creation = deferred();
  host.ctx.sessions.create = () => creation.promise;
  const adapter = createHostAdapter(host.ctx);
  const creating = adapter.create(draft());
  await new Promise(resolve => setImmediate(resolve));
  adapter.dispose();
  creation.resolve('late-session');
  await assert.rejects(creating, /插件已关闭/);
  assert.deepEqual(host.calls, []);
});

test('disposal during read-only creation validation never starts Session creation', async () => {
  const host = mockHost();
  const catalog = deferred();
  host.ctx.remote.session.modelCatalog = () => catalog.promise;
  const adapter = createHostAdapter(host.ctx);
  const creating = adapter.create(draft({ modelSelection: host.model }));
  await new Promise(resolve => setImmediate(resolve));
  adapter.dispose();
  catalog.resolve({ ok: true, value: { groups: [{ id: 'deepseek', models: [{ id: 'flash', reasoning: { efforts: [{ id: 'max' }] } }] }] } });
  await assert.rejects(creating, /插件已关闭/);
  assert.deepEqual(host.calls, []);
});

test('disposal cancels upload waiting and releases its own resources', async () => {
  const host = mockHost();
  const adapter = createHostAdapter(host.ctx);
  const snapshot = draft({ files: [{ id: 'f', file: { name: 'notes.txt', type: 'text/plain' } }] });
  const handle = await adapter.create(snapshot);
  const sending = adapter.send(handle, snapshot);
  await new Promise(resolve => setImmediate(resolve));
  adapter.dispose();
  await assert.rejects(sending, /插件已关闭/);
  assert.equal(host.listenerCount(), 0);
  assert.equal(host.calls.some(call => call[0] === 'prompt'), false);
});
