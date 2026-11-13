import test from 'node:test';
import assert from 'node:assert/strict';
import {installConversationLayoutMenu} from '../src/conversation-layout-menu.js';

function fixture() {
  let snapshot = {sessionId: 'one', available: true, contentOpen: true, mode: 'left'};
  const calls = [];
  const existing = {id: 'native.export', target: 'sessionHeader'};
  const providers = [existing];
  let withdrawals = 0;
  const model = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
  };
  const actions = {
    setMode(mode, options) {
      calls.push({mode, options});
    },
  };
  const contextMenus = {
    register(provider) {
      providers.push(provider);
      return () => {
        withdrawals++;
        providers.splice(providers.indexOf(provider), 1);
      };
    },
  };
  const dispose = installConversationLayoutMenu({contextMenus}, {model, actions});
  const provider = providers[1];
  return {
    model, actions, calls, providers, provider, existing, dispose,
    setSnapshot: value => { snapshot = {...snapshot, ...value}; },
    get withdrawals() { return withdrawals; },
  };
}

test('adds one reactive native Header provider while preserving existing contributions', () => {
  const f = fixture();
  assert.equal(f.providers[0], f.existing);
  assert.equal(f.provider.id, 'chatgpt-rail.conversation-layout');
  assert.equal(f.provider.target, 'sessionHeader');
  assert.equal(f.provider.order, 400);
  assert.deepEqual(f.provider.observe({sessionId: 'one'}), [f.model]);
  const [action] = f.provider.resolve({sessionId: 'one'});
  assert.equal(action.label, '移至右侧面板');
  assert.equal(action.separatorBefore, true);
  action.run();
  assert.deepEqual(f.calls, [{mode: 'right', options: {sessionId: 'one', requireContentOpen: true}}]);
  f.setSnapshot({mode: 'right'});
  const [reverse] = f.provider.resolve({sessionId: 'one'});
  assert.equal(reverse.label, '移至左侧面板');
  reverse.run();
  assert.equal(f.calls[1].mode, 'left');
  f.dispose();
  f.dispose();
  assert.equal(f.withdrawals, 1);
  assert.deepEqual(f.providers, [f.existing]);
});

test('omits movement for hidden content, other Sessions, floating mode and dismissed preparation', () => {
  const f = fixture();
  const signal = new AbortController();
  signal.abort();
  assert.deepEqual(f.provider.resolve({sessionId: 'one'}, signal.signal), []);
  assert.deepEqual(f.provider.resolve({sessionId: 'two'}), []);
  for (const patch of [
    {available: false},
    {available: true, contentOpen: false},
    {contentOpen: true, mode: 'floating'},
  ]) {
    f.setSnapshot(patch);
    assert.deepEqual(f.provider.resolve({sessionId: 'one'}), []);
  }
  f.dispose();
});

test('rechecks the captured Session, open panel and mode before executing', () => {
  for (const patch of [
    {sessionId: 'two'},
    {available: false},
    {contentOpen: false},
    {mode: 'right'},
    {mode: 'floating'},
  ]) {
    const f = fixture();
    const [action] = f.provider.resolve({sessionId: 'one'});
    f.setSnapshot(patch);
    assert.throws(() => action.run(), /重新打开菜单/);
    assert.deepEqual(f.calls, []);
    assert.match(action.failureLabel, /重新打开菜单/);
    f.dispose();
  }
});

test('selection can execute after native preparation disposal and propagates Host failures', async () => {
  const f = fixture();
  const preparation = new AbortController();
  const [action] = f.provider.resolve({sessionId: 'one'}, preparation.signal);
  preparation.abort();
  action.run();
  assert.equal(f.calls.length, 1);
  const failure = new Error('Host refused stale panel');
  f.actions.setMode = () => Promise.reject(failure);
  await assert.rejects(action.run(), reason => reason === failure);
  f.dispose();
  assert.equal(action.run(), undefined);
  assert.deepEqual(f.provider.resolve({sessionId: 'one'}), []);
});

test('older Hosts without context menus skip installation without a failure', () => {
  assert.doesNotThrow(() => installConversationLayoutMenu({}, {})());
  assert.doesNotThrow(() => installConversationLayoutMenu({get() { throw new Error('missing service'); }}, {})());
});
