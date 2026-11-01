import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftController } from './draft-controller.js';

const initial = { text: 'hello', workspaceId: 'workspace-a', agentPreset: 'standard', modelSelection: { provider: 'account', model: 'flash', reasoningEffort: 'max' }, permissionPreset: 'workspace-write' };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(overrides = {}) {
  const calls = [];
  let count = 0;
  const adapter = {
    async create(snapshot) { calls.push(['create', snapshot]); return { sessionId: `session-${++count}` }; },
    async configure(handle, snapshot) { calls.push(['configure', handle.sessionId, snapshot]); },
    async send(handle, snapshot) { calls.push(['send', handle.sessionId, snapshot]); return { accepted: true }; },
    async open(handle) { calls.push(['open', handle.sessionId]); },
    ...overrides,
  };
  return { adapter, calls };
}

// A return to eager Session creation or mutable snapshots must fail here.
test('editing the local draft publishes immutable snapshots without calling a host adapter', () => {
  const controller = createDraftController(initial);
  const original = controller.getSnapshot();
  const states = [];
  const unsubscribe = controller.subscribe(() => states.push(controller.getSnapshot()));
  controller.setText('local text');
  controller.update({ modelSelection: { provider: 'official', model: 'pro' } });
  assert.equal(original.text, 'hello');
  assert.equal(controller.getSnapshot().text, 'local text');
  assert.equal(controller.getSnapshot().preparedSessionId, null);
  assert.equal(states.length, 2);
  assert.throws(() => { original.modelSelection.model = 'modified'; }, TypeError);
  unsubscribe();
  controller.setText('still local');
  assert.equal(states.length, 2);
  controller.dispose();
});

// Reloading after a prepared or potentially admitted request cannot silently replay it.
for (const recovery of [{ recoverySessionId: 'interrupted-session' }, { sendUncertain: true }]) {
  test(`restored ${Object.keys(recovery)[0]} locks submission without inventing a host handle`, async () => {
    const { adapter, calls } = fixture();
    const controller = createDraftController({ ...initial, ...recovery });
    const state = controller.getSnapshot();
    assert.equal(state.sendUncertain, true);
    assert.equal(state.status, 'error');
    assert.equal(state.preparedSessionId, recovery.recoverySessionId ?? null);
    assert.match(state.error, /上次发送\/准备过程被中断，请先打开会话核对/);
    await assert.rejects(controller.submit(adapter), { code: 'SEND_UNCERTAIN' });
    assert.deepEqual(calls, []);
    assert.equal(controller.resetPreparedSession(), null);
    await controller.submit(adapter);
    assert.equal(calls.filter(([kind]) => kind === 'create').length, 1);
    controller.dispose();
  });
}

// A lost create result may already have allocated a real Session on the host.
test('an uncertain creation is locked instead of allocating another session on retry', async () => {
  let creations = 0;
  const { adapter } = fixture({ async create() { creations += 1; throw Object.assign(new Error('准备结果不明，请先核对'), { code: 'CREATE_UNCERTAIN' }); } });
  const controller = createDraftController(initial);
  await assert.rejects(controller.submit(adapter), { code: 'CREATE_UNCERTAIN' });
  assert.equal(controller.getSnapshot().sendUncertain, true);
  assert.equal(controller.getSnapshot().preparedSessionId, null);
  assert.equal(controller.getSnapshot().text, 'hello');
  await assert.rejects(controller.submit(adapter), { code: 'SEND_UNCERTAIN' });
  assert.equal(creations, 1);
  controller.dispose();
});

// Duplicate clicks must share one transaction, and configuring must gate sending.
test('duplicate submits share one promise and wait for configuration before sending', async () => {
  const creation = deferred(), configuration = deferred();
  const order = [];
  const controller = createDraftController(initial);
  const adapter = {
    create(snapshot) { order.push('create'); assert.equal(snapshot.workspaceId, 'workspace-a'); return creation.promise; },
    configure(handle, snapshot) { order.push('configure'); assert.equal(handle.sessionId, 'only-session'); assert.equal(snapshot.modelSelection.model, 'flash'); return configuration.promise; },
    async send(handle, snapshot) { order.push('send'); assert.equal(snapshot.text, 'hello'); return { accepted: true }; },
    open() { order.push('open'); },
  };
  const first = controller.submit(adapter);
  const second = controller.submit(adapter);
  assert.equal(first, second);
  assert.equal(controller.getSnapshot().status, 'creating');
  assert.throws(() => controller.setText('racing edit'), { code: 'DRAFT_BUSY' });
  assert.throws(() => controller.update({ modelSelection: { model: 'different' } }), { code: 'DRAFT_BUSY' });
  await tick();
  assert.deepEqual(order, ['create']);
  creation.resolve({ sessionId: 'only-session' });
  await tick();
  assert.deepEqual(order, ['create', 'configure']);
  assert.equal(controller.getSnapshot().text, 'hello');
  configuration.resolve();
  const result = await first;
  assert.equal(result.accepted, true);
  assert.deepEqual(order, ['create', 'configure', 'send', 'open']);
  assert.equal(controller.getSnapshot().text, '');
  assert.equal(controller.getSnapshot().status, 'idle');
  controller.dispose();
});

for (const failure of ['create', 'configure', 'send']) {
  // Retrying configure/send must never allocate a second successful Session.
  test(`${failure} failure preserves the draft and retry reuses an already created session`, async () => {
    let fail = true;
    const calls = [];
    const controller = createDraftController(initial);
    const adapter = {
      async create() { calls.push('create'); if (failure === 'create' && fail) throw new Error('create unavailable'); return { sessionId: 'retained-session' }; },
      async configure(handle, snapshot) { calls.push('configure'); assert.equal(snapshot.permissionPreset, 'workspace-write'); if (failure === 'configure' && fail) throw new Error('configure unavailable'); },
      async send(handle, snapshot) { calls.push('send'); assert.equal(handle.sessionId, 'retained-session'); assert.equal(snapshot.text, 'hello'); if (failure === 'send' && fail) throw new Error('send unavailable'); return { accepted: true }; },
      open() { calls.push('open'); },
    };
    await assert.rejects(controller.submit(adapter), new RegExp(`${failure} unavailable`));
    assert.equal(controller.getSnapshot().text, 'hello');
    assert.equal(controller.getSnapshot().status, 'error');
    assert.equal(controller.getSnapshot().preparedSessionId, failure === 'create' ? null : 'retained-session');
    assert.ok(!calls.includes('open'));
    fail = false;
    await controller.submit(adapter);
    assert.equal(calls.filter((call) => call === 'create').length, failure === 'create' ? 2 : 1);
    assert.equal(controller.getSnapshot().text, '');
    assert.equal(calls.at(-1), 'open');
    controller.dispose();
  });
}

// Resolving a send promise alone is not an acceptance receipt.
test('an absent acceptance receipt keeps the draft, locks retry and does not open a session', async () => {
  let accepted = false;
  const fixtureState = fixture({ async send() { return accepted ? { accepted: true } : undefined; } });
  const controller = createDraftController(initial);
  await assert.rejects(controller.submit(fixtureState.adapter), { code: 'SEND_UNCERTAIN' });
  assert.equal(controller.getSnapshot().text, 'hello');
  assert.equal(controller.getSnapshot().preparedSessionId, 'session-1');
  assert.equal(controller.getSnapshot().sendUncertain, true);
  assert.ok(!fixtureState.calls.some(([kind]) => kind === 'open'));
  accepted = true;
  await assert.rejects(controller.submit(fixtureState.adapter), { code: 'SEND_UNCERTAIN' });
  controller.resetPreparedSession();
  await controller.submit(fixtureState.adapter);
  assert.equal(fixtureState.calls.filter(([kind]) => kind === 'create').length, 2);
  controller.dispose();
});

// A lost transport receipt might mean the host already accepted the message.
test('an uncertain send cannot be retried until the user explicitly resets the prepared session', async () => {
  let sends = 0;
  const { adapter, calls } = fixture({ async send() { sends += 1; throw Object.assign(new Error('请打开会话核对发送结果'), { code: 'SEND_UNCERTAIN' }); } });
  const controller = createDraftController(initial);
  await assert.rejects(controller.submit(adapter), { code: 'SEND_UNCERTAIN' });
  assert.equal(controller.getSnapshot().sendUncertain, true);
  assert.equal(controller.getSnapshot().text, 'hello');
  assert.equal(controller.getSnapshot().preparedSessionId, 'session-1');
  controller.setText('reviewed text');
  await assert.rejects(controller.submit(adapter), { code: 'SEND_UNCERTAIN' });
  assert.equal(sends, 1);
  assert.equal(calls.filter(([kind]) => kind === 'create').length, 1);
  assert.match(controller.getSnapshot().error, /核对/);
  assert.equal(controller.resetPreparedSession().sessionId, 'session-1');
  assert.equal(controller.getSnapshot().sendUncertain, false);
  adapter.send = async () => { sends += 1; return { accepted: true }; };
  await controller.submit(adapter);
  assert.equal(sends, 2);
  assert.equal(calls.filter(([kind]) => kind === 'create').length, 2);
  controller.dispose();
});

// A previously prepared handle must not silently receive a different workspace/preset.
test('changing a prepared session identity requires an explicit reset', async () => {
  const { adapter, calls } = fixture({ async send() { throw new Error('retry later'); } });
  const controller = createDraftController(initial);
  await assert.rejects(controller.submit(adapter), /retry later/);
  assert.throws(() => controller.update({ workspaceId: 'workspace-b' }), { code: 'PREPARED_SESSION_MISMATCH' });
  assert.throws(() => controller.update({ agentPreset: 'cordis' }), { code: 'PREPARED_SESSION_MISMATCH' });
  assert.equal(controller.getSnapshot().workspaceId, 'workspace-a');
  assert.equal(controller.resetPreparedSession().sessionId, 'session-1');
  controller.update({ workspaceId: 'workspace-b', agentPreset: 'cordis' });
  adapter.send = async () => ({ accepted: true });
  await controller.submit(adapter);
  assert.deepEqual(calls.filter(([kind]) => kind === 'create').map(([, snapshot]) => snapshot.workspaceId), ['workspace-a', 'workspace-b']);
  controller.dispose();
});

// A failed configuration can be edited and re-applied before retrying the same session.
test('retry configures the current model and permission after a failed configuration', async () => {
  const seen = [];
  const { adapter, calls } = fixture({ async configure(handle, snapshot) { seen.push([snapshot.modelSelection.model, snapshot.permissionPreset]); if (seen.length === 1) throw new Error('settings failed'); } });
  const controller = createDraftController(initial);
  await assert.rejects(controller.submit(adapter), /settings failed/);
  controller.update({ modelSelection: { provider: 'official', model: 'pro' }, permissionPreset: 'read-only' });
  await controller.submit(adapter);
  assert.deepEqual(seen, [['flash', 'workspace-write'], ['pro', 'read-only']]);
  assert.equal(calls.filter(([kind]) => kind === 'create').length, 1);
  controller.dispose();
});

// Object URLs belong to this draft and must survive failures but be released once.
test('files remain local on failure and object URLs are released on removal, accepted send and disposal', async () => {
  const revoked = [];
  let id = 0;
  const urlApi = { createObjectURL() { return `blob:${++id}`; }, revokeObjectURL(url) { revoked.push(url); } };
  const controller = createDraftController(initial, { urlApi });
  const one = new Blob(['a']), two = new Blob(['b']);
  controller.addFiles([one, two]);
  const files = controller.getSnapshot().files;
  assert.equal(files[0].file, one);
  assert.throws(() => files.push({}), TypeError);
  controller.removeFile(files[0].id);
  assert.deepEqual(revoked, ['blob:1']);
  const { adapter } = fixture({ async send() { throw new Error('offline'); } });
  await assert.rejects(controller.submit(adapter), /offline/);
  assert.equal(controller.getSnapshot().files[0].file, two);
  assert.deepEqual(revoked, ['blob:1']);
  adapter.send = async () => ({ accepted: true });
  await controller.submit(adapter);
  assert.deepEqual(revoked, ['blob:1', 'blob:2']);
  controller.addFiles([one]);
  controller.dispose();
  controller.dispose();
  assert.deepEqual(revoked, ['blob:1', 'blob:2', 'blob:3']);
});

// Failure to navigate after acceptance cannot make a retry send the same message again.
test('an open error after acceptance resolves as sent and leaves no resendable draft', async () => {
  const { adapter, calls } = fixture({ open() { throw new Error('window unavailable'); } });
  const controller = createDraftController(initial);
  const result = await controller.submit(adapter);
  assert.equal(result.accepted, true);
  assert.match(result.openError.message, /window unavailable/);
  assert.equal(controller.getSnapshot().text, '');
  await assert.rejects(controller.submit(adapter), { code: 'DRAFT_EMPTY' });
  assert.equal(calls.filter(([kind]) => kind === 'send').length, 1);
  controller.dispose();
});

// Plugin unloading during a pending create must stop later mutation/send phases.
test('disposal during creation prevents configuration and sending', async () => {
  const creation = deferred();
  let configured = false, sent = false;
  const controller = createDraftController(initial);
  const promise = controller.submit({ create: () => creation.promise, configure() { configured = true; }, send() { sent = true; return { accepted: true }; }, open() {} });
  await tick();
  controller.dispose();
  creation.resolve({ sessionId: 'created-before-unload' });
  await assert.rejects(promise, { code: 'DRAFT_DISPOSED' });
  assert.equal(configured, false);
  assert.equal(sent, false);
});
