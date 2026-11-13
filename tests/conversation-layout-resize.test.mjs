import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {createConversationLayoutModel} from '../src/conversation-layout-model.js';
import {FloatingConversationResizeHandles} from '../src/conversation-layout-ui.js';

function floatingModel() {
  const model = createConversationLayoutModel();
  model.setContext({sessionId: 'a', title: '会话 A', available: true, contentOpen: true});
  model.setMode('floating');
  model.setRect({left: 500, top: 120, width: 560});
  model.setFloatingPresentation('expanded');
  return model;
}

test('edge resizing preserves the opposite edge through minimum and maximum width', () => {
  const model = floatingModel();
  const origin = model.getSnapshot().rect;
  const right = origin.left + origin.width;
  model.resizeFromEdge('left', 500, origin);
  assert.deepEqual(model.getSnapshot().rect, {left: 740, top: 120, width: 320, height: 260});
  model.resizeFromEdge('left', 800, origin);
  assert.equal(model.getSnapshot().rect.left + model.getSnapshot().rect.width, right);
  assert.equal(model.getSnapshot().rect.width, 320);
  model.resizeFromEdge('left', -1000, origin);
  assert.deepEqual(model.getSnapshot().rect, {left: 16, top: 120, width: 1044, height: 260});

  model.resizeFromEdge('right', -1000, origin);
  assert.deepEqual(model.getSnapshot().rect, {left: 500, top: 120, width: 320, height: 260});
  model.resizeFromEdge('right', 1000, origin);
  assert.deepEqual(model.getSnapshot().rect, {left: 500, top: 120, width: 764, height: 260});
  model.dispose();
});

test('resizing fits narrow viewports and retains only the current Session width', () => {
  const model = floatingModel();
  const origin = model.getSnapshot().rect;
  model.resizeFromEdge('right', -100, origin);
  model.setContext({sessionId: 'b', available: true});
  model.setMode('floating');
  assert.equal(model.getSnapshot().rect.width, 749);
  model.setContext({sessionId: 'a', available: true});
  assert.equal(model.getSnapshot().rect.width, 460);
  model.setBounds({left: 0, top: 0, width: 300, height: 500});
  model.resizeFromEdge('left', -1000, origin);
  assert.deepEqual(model.getSnapshot().rect, {left: 16, top: 120, width: 268, height: 260});
  model.resizeFromEdge('right', 1000, origin);
  assert.deepEqual(model.getSnapshot().rect, {left: 16, top: 120, width: 268, height: 260});
  const current = model.getSnapshot();
  for (const [edge, delta, rect] of [
    ['corner', 10, origin], ['left', NaN, origin], ['right', 20, {left: NaN, top: 0, width: 560}],
  ]) assert.equal(model.resizeFromEdge(edge, delta, rect), false);
  assert.equal(model.getSnapshot(), current);
  model.dispose();
});

test('content visibility participates in snapshot identity and follows availability', () => {
  const model = createConversationLayoutModel();
  const context = {sessionId: 'a', available: true, contentOpen: false};
  model.setContext(context);
  const closed = model.getSnapshot();
  model.setContext({...context, contentOpen: true});
  const opened = model.getSnapshot();
  assert.notEqual(opened, closed);
  assert.equal(opened.contentOpen, true);
  model.setContext({...context, contentOpen: true});
  assert.equal(model.getSnapshot(), opened);
  model.setContext({...context, available: false, contentOpen: true});
  assert.equal(model.getSnapshot().contentOpen, false);
  model.dispose();
});

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    emit(type) { for (const listener of [...listeners.get(type) || []]) listener(); },
    get count() { return [...listeners.values()].reduce((total, entries) => total + entries.size, 0); },
  };
}

function resizeElement() {
  const viewport = eventTarget();
  viewport.visualViewport = eventTarget();
  const captures = new Set();
  const attributes = new Map();
  return {
    viewport,
    captures,
    attributes,
    ownerDocument: {defaultView: viewport},
    setPointerCapture(id) { captures.add(id); },
    hasPointerCapture(id) { return captures.has(id); },
    releasePointerCapture(id) { captures.delete(id); },
    setAttribute(name, value) { attributes.set(name, value); },
    removeAttribute(name) { attributes.delete(name); },
    focus() {},
  };
}

const pointer = (element, clientX, values = {}) => ({
  currentTarget: element, button: 0, isPrimary: true, pointerId: 1, clientX,
  preventDefault() {}, stopPropagation() {}, ...values,
});
const handle = (view, edge) => view.root.findByProps({'data-edge': edge});

test('pointer resizing keeps its initial anchor, commits release coordinates and releases capture', async () => {
  const model = floatingModel();
  const element = resizeElement();
  let view;
  await act(async () => { view = TestRenderer.create(React.createElement(FloatingConversationResizeHandles, {model})); });
  assert.equal(view.root.findAllByProps({role: 'separator'}).length, 4);
  assert.equal(handle(view, 'left').props['aria-orientation'], 'vertical');
  await act(async () => { handle(view, 'left').props.onPointerDown(pointer(element, 500)); });
  assert.equal(element.captures.has(1), true);
  assert.equal(element.viewport.count, 2);
  assert.equal(element.viewport.visualViewport.count, 1);
  await act(async () => { handle(view, 'left').props.onPointerMove(pointer(element, 900)); });
  assert.deepEqual(model.getSnapshot().rect, {left: 740, top: 120, width: 320, height: 260});
  await act(async () => { handle(view, 'left').props.onPointerUp(pointer(element, 600)); });
  assert.deepEqual(model.getSnapshot().rect, {left: 600, top: 120, width: 460, height: 260});
  assert.equal(element.captures.size, 0);
  assert.equal(element.attributes.has('data-resizing'), false);
  assert.equal(element.viewport.count + element.viewport.visualViewport.count, 0);
  await act(async () => view.unmount());
  model.dispose();
});

test('viewport changes, lost capture, Session switching and unmount cancel active resizing', async () => {
  const model = floatingModel();
  const element = resizeElement();
  let view;
  await act(async () => { view = TestRenderer.create(React.createElement(FloatingConversationResizeHandles, {model})); });
  await act(async () => { handle(view, 'right').props.onPointerDown(pointer(element, 1060)); });
  element.viewport.emit('resize');
  assert.equal(element.captures.size, 0);
  const before = model.getSnapshot();
  await act(async () => { handle(view, 'right').props.onPointerMove(pointer(element, 1100)); });
  assert.equal(model.getSnapshot(), before);

  await act(async () => { handle(view, 'right').props.onPointerDown(pointer(element, 1060)); });
  await act(async () => { handle(view, 'right').props.onLostPointerCapture(pointer(element, 1060)); });
  assert.equal(element.captures.size, 0);
  await act(async () => { handle(view, 'right').props.onPointerDown(pointer(element, 1060)); });
  const oldMove = handle(view, 'right').props.onPointerMove;
  await act(async () => { model.setContext({sessionId: 'b', available: true}); });
  assert.equal(element.captures.size, 0);
  assert.equal(view.root.findAllByProps({role: 'separator'}).length, 0);
  const next = model.getSnapshot();
  oldMove(pointer(element, 1200));
  assert.equal(model.getSnapshot(), next);

  await act(async () => model.setMode('floating'));
  await act(async () => { handle(view, 'left').props.onPointerDown(pointer(element, next.rect.left)); });
  await act(async () => view.unmount());
  assert.equal(element.captures.size, 0);
  assert.equal(element.viewport.count + element.viewport.visualViewport.count, 0);
  model.dispose();
});

test('keyboard resizing supports Shift while expanded and minimization hides every handle', async () => {
  const model = floatingModel();
  let view;
  await act(async () => { view = TestRenderer.create(React.createElement(FloatingConversationResizeHandles, {model})); });
  const key = (value, shiftKey = false) => ({key: value, shiftKey, preventDefault() {}, stopPropagation() {}});
  await act(async () => { handle(view, 'right').props.onKeyDown(key('ArrowLeft')); });
  assert.deepEqual(model.getSnapshot().rect, {left: 500, top: 120, width: 550, height: 260});
  await act(async () => { handle(view, 'right').props.onKeyDown(key('ArrowRight', true)); });
  assert.deepEqual(model.getSnapshot().rect, {left: 500, top: 120, width: 590, height: 260});
  await act(async () => { handle(view, 'left').props.onKeyDown(key('ArrowRight')); });
  assert.deepEqual(model.getSnapshot().rect, {left: 510, top: 120, width: 580, height: 260});
  await act(async () => model.setMinimized(true));
  assert.equal(model.getSnapshot().minimized, true);
  assert.equal(view.root.findAllByProps({role: 'separator'}).length, 0);
  await act(async () => model.setMinimized(false));
  assert.equal(view.root.findAllByProps({role: 'separator'}).length, 4);
  await act(async () => view.unmount());
  model.dispose();
});

test('focused width resizing retains compact height and vertical resizing expands from visible geometry', async () => {
  const model = floatingModel();
  model.setFloatingPresentation('focused');
  const expandedHeight = model.getSnapshot().rect.height;
  const element = resizeElement();
  let view;
  await act(async () => { view = TestRenderer.create(React.createElement(FloatingConversationResizeHandles, {model})); });
  const initial = model.getSnapshot().displayRect;
  await act(async () => handle(view, 'right').props.onKeyDown({
    key: 'ArrowRight', shiftKey: true, preventDefault() {}, stopPropagation() {},
  }));
  assert.equal(model.getSnapshot().floatingPresentation, 'focused');
  assert.deepEqual(model.getSnapshot().displayRect, {...initial, width: initial.width + 40});
  assert.equal(model.getSnapshot().rect.height, expandedHeight);
  const visible = model.getSnapshot().displayRect;
  const bottom = visible.top + visible.height;
  await act(async () => handle(view, 'bottom').props.onPointerDown(pointer(element, 800, {clientY: bottom})));
  await act(async () => handle(view, 'bottom').props.onPointerMove(pointer(element, 800, {clientY: bottom + 100})));
  assert.equal(model.getSnapshot().floatingPresentation, 'expanded');
  assert.deepEqual(model.getSnapshot().displayRect, {...visible, height: visible.height + 100});
  await act(async () => handle(view, 'bottom').props.onPointerUp(pointer(element, 800, {clientY: bottom + 100})));
  assert.equal(element.captures.size + element.viewport.count + element.viewport.visualViewport.count, 0);
  await act(async () => view.unmount());
  model.dispose();
});

test('accessible resize ranges follow viewport limits while retaining a moved card position', async () => {
  const model = floatingModel();
  let view;
  await act(async () => { view = TestRenderer.create(React.createElement(FloatingConversationResizeHandles, {model})); });
  const original = model.getSnapshot().rect;
  assert.deepEqual(model.getResizeLimits(), {min: 320, max: 1248});
  assert.equal(handle(view, 'left').props['aria-valuemin'], 320);
  assert.equal(handle(view, 'left').props['aria-valuemax'], 1248);
  assert.equal(handle(view, 'left').props['aria-valuenow'], 560);
  await act(async () => model.setBounds({width: 1400}));
  assert.deepEqual(model.getSnapshot().rect, original);
  assert.equal(handle(view, 'right').props['aria-valuemax'], 1368);
  await act(async () => model.setBounds({width: 300}));
  assert.deepEqual(model.getResizeLimits(), {min: 268, max: 268});
  assert.equal(handle(view, 'right').props['aria-valuemin'], 268);
  assert.equal(handle(view, 'right').props['aria-valuemax'], 268);
  assert.equal(handle(view, 'right').props['aria-valuenow'], 268);
  await act(async () => view.unmount());
  model.dispose();
});
