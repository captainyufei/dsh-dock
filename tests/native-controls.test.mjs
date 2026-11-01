import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { createNativeControls } from '../src/native-controls.js';

function fixture(options = {}) {
  let injected = 0, nativeProps, unmounted = 0;
  const readiness = { connected: true, catalog: null };
  const source = { getSnapshot: () => readiness, subscribe: () => () => {} };
  function VoiceInput(props) {
    nativeProps = props;
    props.useSpeechReadiness((value) => value);
    React.useEffect(() => () => { unmounted++; }, []);
    return React.createElement('button', { 'aria-label': '真实语音' }, 'mic');
  }
  const entry = { locale: 'voice-input', component: VoiceInput, inject() {
    injected++;
    return { createRecording() {}, transcribe() {}, openSettings() {}, hooks: { speechReadiness: source } };
  } };
  let entries = options.absent ? [] : [entry];
  const listeners = new Set();
  const ctx = {
    slots: {
      // Inspection wrappers may return equivalent fresh arrays.
      entries: (key) => key === 'conversation.input.activity' ? [...entries] : [],
      subscribe(_key, listener) { listeners.add(listener); return () => listeners.delete(listener); },
    },
    locale: { bind: () => (key) => key },
    get sessions() { throw new Error('Voice must not access a Session'); },
  };
  const native = createNativeControls(ctx, React);
  return {
    native, entry,
    get props() { return nativeProps; },
    get injected() { return injected; },
    get unmounted() { return unmounted; },
    remove() { entries = []; for (const listener of listeners) listener(); },
  };
}

test('native microphone mounts over a local controller and never requests a Session', async () => {
  const f = fixture();
  let snapshot = { text: 'hello world', status: 'idle' };
  const controller = { getSnapshot: () => snapshot, setText(text) { snapshot = { ...snapshot, text }; } };
  const textareaRef = { current: { selectionStart: 6, selectionEnd: 11, isConnected: false } };
  let tree;
  await act(async () => { tree = TestRenderer.create(React.createElement(f.native.VoiceControl, { controller, textareaRef })); });
  assert.equal(tree.root.findByType('button').props['aria-label'], '真实语音');
  assert.equal(f.props.sessionId, undefined);
  const capture = f.props.inputActions.captureInsertion();
  assert.equal(f.props.inputActions.insertText('DeepSeek', capture), true);
  assert.equal(snapshot.text, 'hello DeepSeek');
  assert.equal(f.injected, 1);
  await act(async () => tree.unmount());
  assert.equal(f.unmounted, 1);
});

test('late transcripts cannot overwrite an edited or locked draft', () => {
  const { native } = fixture();
  let text = 'first draft', revision = 0, locked = false;
  const input = native.createTextareaInputActions({
    textareaRef: { current: { selectionStart: 0, selectionEnd: 5, isConnected: false } },
    getText: () => text, getRevision: () => revision, isLocked: () => locked,
    setText(next) { text = next; revision++; },
  });
  const stale = input.captureInsertion();
  text = 'newer draft'; revision++;
  assert.equal(input.insertText('transcript', stale), false);
  assert.equal(text, 'newer draft');
  const current = input.captureInsertion();
  locked = true;
  assert.equal(input.insertText('transcript', current), false);
  assert.equal(text, 'newer draft');
  locked = false;
  assert.equal(input.insertText('transcript', current), true);
  assert.equal(text, 'transcript draft');
});

test('an insertion captured for another textarea is refused', () => {
  const { native } = fixture();
  let text = 'retained';
  const config = { getText: () => text, getRevision: () => 1, setText(next) { text = next; } };
  const first = native.createTextareaInputActions(config);
  const second = native.createTextareaInputActions(config);
  assert.equal(second.insertText('wrong owner', first.captureInsertion()), false);
  assert.equal(text, 'retained');
});

test('disabled or withdrawn voice contribution gives an explicit explanation', async () => {
  const f = fixture();
  const onError = [];
  const inputActions = { captureInsertion: () => ({}), insertText: () => true };
  let tree;
  await act(async () => { tree = TestRenderer.create(React.createElement(f.native.VoiceControl, { inputActions, onError: (message) => onError.push(message) })); });
  await act(async () => f.remove());
  assert.equal(f.unmounted, 1);
  const button = tree.root.findByType('button');
  assert.equal(button.props['aria-label'], '语音输入不可用');
  await act(async () => button.props.onClick());
  assert.match(onError[0], /尚未启用/);
  assert.match(tree.root.findByProps({ role: 'status' }).children.join(''), /尚未启用/);
  await act(async () => tree.unmount());
});
