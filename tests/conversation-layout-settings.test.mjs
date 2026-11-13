import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {installFloatingComposerSettings} from '../src/conversation-layout-settings.js';

const h = React.createElement;
function fixture(options = {}) {
  let snapshot = {sessionId: 'one', available: true, mode: 'floating', minimized: false, rect: {width: 550}};
  let catalog = {value: {options: [{value: 'workspace-write', name: 'Workspace Write'}]}};
  let selection = {currentValue: 'workspace-write'};
  const listeners = new Set();
  const slotListeners = new Set();
  const calls = [];
  let injection;
  let withdrawals = 0;
  let contribution;
  const entry = {
    component() {}, locale: 'permission.access',
    inject(sessionId) {
      injection = sessionId;
      return {
        hooks: {permissionCatalog: {subscribe: () => () => {}, getSnapshot: () => catalog}},
        select() { throw new Error('Adapter must never mutate permission'); },
      };
    },
  };
  let entries = [entry];
  const slots = {
    spec: () => ({kind: 'list', scope: 'session'}),
    entriesOfSlot(name) {
      assert.equal(name, 'conversation.input.permission');
      return entries;
    },
    subscribe(name, listener) {
      assert.equal(name, 'conversation.input.permission');
      slotListeners.add(listener);
      return () => slotListeners.delete(listener);
    },
    register(spec, component) {
      contribution = {spec, component};
      return () => { withdrawals++; };
    },
  };
  const model = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
  const adapter = installFloatingComposerSettings({slots}, {
    model,
    onOpenPermission(sessionId) { calls.push('open:' + sessionId); return options.open?.(sessionId); },
  });
  const failures = [];
  let view;
  const props = () => ({
    sessionId: 'one', ...contribution.spec.inject('one'),
    useProjection(key) { assert.equal(key, 'permissions'); return selection; },
    dismiss() { calls.push('dismiss'); },
    reportFailure(message) { failures.push(message); },
    locked: false,
  });
  return {
    adapter, slots, model, calls, failures,
    get contribution() { return contribution; },
    get injection() { return injection; },
    get withdrawals() { return withdrawals; },
    get view() { return view; },
    render(patch = {}) { act(() => { view = TestRenderer.create(h(contribution.component, {...props(), ...patch})); }); return view; },
    setSnapshot(patch) { act(() => { snapshot = {...snapshot, ...patch}; for (const fn of listeners) fn(); }); },
    setSelection(value) { selection = value; },
    setCatalog(value) { catalog = value; },
    removePermission() { act(() => { entries = []; for (const fn of slotListeners) fn(); }); },
    cleanup() { act(() => view?.unmount()); adapter.dispose(); },
  };
}

test('adds one session-scoped settings row and opens the original permission selector after dismissing', async () => {
  const f = fixture();
  assert.equal(f.contribution.spec.name, 'conversation.input.model.options');
  assert.equal(f.contribution.spec.id, 'chatgpt-rail.floating-permission-settings');
  assert.deepEqual(f.contribution.spec.inject('actual-session'), {capturedSessionId: 'actual-session'});
  f.render();
  assert.equal(f.injection, 'one');
  const button = f.view.root.findByType('button');
  assert.equal(button.props.role, 'menuitem');
  assert.equal(button.props['aria-label'], '访问权限，当前：工作区内修改');
  await act(async () => { await button.props.onClick(); });
  assert.deepEqual(f.calls, ['dismiss', 'open:one']);
  assert.deepEqual(f.failures, []);
  f.cleanup();
  f.adapter.dispose();
  assert.equal(f.withdrawals, 1);
});

test('shows current custom catalog name and hides outside the active compact floating Session', () => {
  const f = fixture();
  f.setSelection({currentValue: 'custom'});
  f.setCatalog({value: {options: [{value: 'custom', name: '只修改文档'}]}});
  f.render();
  assert.equal(f.view.root.findByType('button').props['aria-label'], '访问权限，当前：只修改文档');
  for (const patch of [
    {sessionId: 'two'}, {sessionId: 'one', available: false},
    {available: true, mode: 'left'}, {mode: 'floating', minimized: true},
    {minimized: false, rect: {width: 641}},
  ]) {
    f.setSnapshot(patch);
    assert.equal(f.view.toJSON(), null);
  }
  f.setSnapshot({rect: {width: 640}});
  assert.notEqual(f.view.toJSON(), null);
  f.removePermission();
  assert.equal(f.adapter.available, false);
  assert.equal(f.view.toJSON(), null);
  f.cleanup();
});

test('rejects stale row gestures and locked controls without opening or mutating permissions', async () => {
  const f = fixture();
  f.render();
  const click = f.view.root.findByType('button').props.onClick;
  f.setSnapshot({sessionId: 'two'});
  await click();
  assert.deepEqual(f.calls, []);
  f.cleanup();
  const locked = fixture();
  locked.render({locked: true});
  const button = locked.view.root.findByType('button');
  assert.equal(button.props.disabled, true);
  await button.props.onClick();
  assert.deepEqual(locked.calls, []);
  locked.cleanup();
});

test('prevents duplicate opens and reports opening failures through the native menu owner', async () => {
  let reject;
  const f = fixture({open: () => new Promise((_, fail) => { reject = fail; })});
  f.render();
  const click = f.view.root.findByType('button').props.onClick;
  let pending;
  act(() => { pending = click(); click(); });
  assert.deepEqual(f.calls, ['dismiss', 'open:one']);
  await act(async () => { reject(new Error('原权限控件不可用')); await pending; });
  assert.deepEqual(f.failures, ['原权限控件不可用']);
  assert.equal(f.view.root.findByType('button').props.disabled, false);
  f.cleanup();
});

test('older Hosts without the declared Session options slot or native permission control fail open', () => {
  const model = {getSnapshot() {}, subscribe() {}};
  const args = {model, onOpenPermission() {}};
  assert.equal(installFloatingComposerSettings({}, args), null);
  assert.equal(installFloatingComposerSettings({slots: {
    spec: () => undefined, register() { throw new Error('must not register'); },
    entriesOfSlot: () => [], subscribe() {},
  }}, args), null);
  assert.equal(installFloatingComposerSettings({slots: {
    spec: () => ({kind: 'list', scope: 'session'}), register() { throw new Error('must not register'); },
    entriesOfSlot: () => [], subscribe() {},
  }}, args), null);
});
