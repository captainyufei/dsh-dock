import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {createConversationLayoutModel} from '../src/conversation-layout-model.js';
import {FloatingConversationHeader, FloatingConversationResizeHandles} from '../src/conversation-layout-ui.js';

const h = React.createElement;
const Menu = ({anchor, open, children}) => h('span', null, anchor, open && children);
const MenuItem = ({children}) => h('button', {role: 'menuitem'}, children);

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener, capture = false) {
      if (!listeners.has(type)) listeners.set(type, new Map());
      listeners.get(type).set(listener, capture);
    },
    removeEventListener(type, listener, capture = false) {
      if (listeners.get(type)?.get(listener) === capture) listeners.get(type).delete(listener);
    },
    emit(type, event) { for (const listener of [...listeners.get(type)?.keys() || []]) listener(event); },
    hasCapturedListener(type) { return [...listeners.get(type)?.values() || []].includes(true); },
    get count() { return [...listeners.values()].reduce((count, entries) => count + entries.size, 0); },
  };
}

async function fixture(t, options = {}) {
  const model = createConversationLayoutModel();
  model.setContext({sessionId: 'a', available: true, contentOpen: true, title: '会话 A'});
  model.setMode('floating');
  model.setRect({left: 300, top: 200, width: 560, height: 260});
  model.setFloatingPresentation(options.presentation ?? 'expanded');
  if (options.bounds) model.setBounds(options.bounds);
  const commits = [];
  const setDisplayRect = model.setDisplayRect;
  model.setDisplayRect = value => { commits.push({...value}); return setDisplayRect(value); };
  let snaps = 0;
  const snapAfterDrag = model.snapAfterDrag;
  model.snapAfterDrag = () => {
    snaps++;
    if (options.failure) throw new Error(options.failure);
    return snapAfterDrag();
  };
  const edges = [];
  const snapToEdge = model.snapToEdge;
  model.snapToEdge = side => {
    edges.push(side);
    if (options.failure) throw new Error(options.failure);
    return snapToEdge(side);
  };
  const modes = [];
  const actions = {
    async setMode(mode) {
      modes.push(mode);
      model.setMode(mode);
    },
    showConversation() { model.setMode('left'); },
  };
  const viewport = eventTarget();
  viewport.visualViewport = eventTarget();
  const frames = new Map();
  let sequence = 0;
  viewport.requestAnimationFrame = callback => { frames.set(++sequence, callback); return sequence; };
  viewport.cancelAnimationFrame = id => frames.delete(id);
  let bubbleFocus = 0;
  let editorFocus = 0;
  const editor = {draft: '保留的草稿', focus() { editorFocus++; }};
  const attributes = new Map();
  if (options.draggingAttribute !== undefined) attributes.set('data-cgpt-floating-dragging', options.draggingAttribute);
  const composer = {
    ownerDocument: {defaultView: viewport},
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute(name, value) { attributes.set(name, value); },
    removeAttribute(name) { attributes.delete(name); },
    querySelector: () => editor,
  };
  const captures = new Set();
  const handleAttributes = new Map();
  const element = {
    ownerDocument: {defaultView: viewport},
    closest: () => composer,
    setPointerCapture(id) { captures.add(id); },
    hasPointerCapture: id => captures.has(id),
    releasePointerCapture(id) { captures.delete(id); },
    setAttribute(name, value) { handleAttributes.set(name, value); },
    removeAttribute(name) { handleAttributes.delete(name); },
    focus() {},
  };
  let view;
  await act(async () => {
    view = TestRenderer.create(h(React.Fragment, null,
      h(FloatingConversationHeader, {model, actions, Menu, MenuItem}),
      h(FloatingConversationResizeHandles, {model}),
    ), {createNodeMock: node => {
      if (node.props.className === 'cgpt-floating-conversation-header') return {closest: () => composer};
      if (node.props.className === 'cgpt-floating-conversation-restore') return {closest: () => composer, focus() { bubbleFocus++; }};
      return null;
    }});
  });
  t.after(async () => { await act(async () => view.unmount()); model.dispose(); });
  return {
    model, view, element, viewport, captures, attributes, handleAttributes, modes, edges, commits, frames, editor,
    get snaps() { return snaps; },
    get bubbleFocus() { return bubbleFocus; },
    get editorFocus() { return editorFocus; },
    flushFrames() { for (const callback of [...frames.values()]) callback(); frames.clear(); },
  };
}

const dragHandle = view => view.root.findByProps({className: 'cgpt-floating-conversation-drag-handle'});
const floatingHeader = view => view.root.findByProps({className: 'cgpt-floating-conversation-header'});
const clickEvent = (extra = {}) => ({
  target: {closest: () => null},
  preventDefault() {}, stopPropagation() {}, ...extra,
});
const resizeHandle = (view, edge) => view.root.findByProps({'data-edge': edge});
const pointer = (f, x, y, extra = {}) => ({
  currentTarget: f.element, button: 0, isPrimary: true, pointerId: 1, clientX: x, clientY: y,
  preventDefault() {}, stopPropagation() {}, ...extra,
});

test('drag commits final release coordinates before snapping to bottom and restores its owned marker', async t => {
  const f = await fixture(t, {draggingAttribute: 'before'});
  await act(async () => dragHandle(f.view).props.onPointerDown(pointer(f, 500, 250)));
  assert.equal(f.attributes.get('data-cgpt-floating-dragging'), 'before');
  await act(async () => dragHandle(f.view).props.onPointerMove(pointer(f, 600, 300)));
  assert.equal(f.attributes.get('data-cgpt-floating-dragging'), '');
  assert.equal(f.handleAttributes.has('data-dragging'), true);
  await act(async () => dragHandle(f.view).props.onPointerUp(pointer(f, 650, 350)));
  assert.deepEqual(f.commits.at(-1), {left: 450, top: 300, width: 560, height: 260});
  assert.deepEqual(f.model.getSnapshot().rect, {left: 360, top: 524, width: 560, height: 260});
  assert.equal(f.snaps, 1);
  assert.deepEqual(f.modes, []);
  assert.equal(f.attributes.get('data-cgpt-floating-dragging'), 'before');
  assert.equal(f.captures.size + f.viewport.count + f.viewport.visualViewport.count, 0);
});

test('a click under four pixels stays in place and a release-only drag still commits and snaps', async t => {
  const f = await fixture(t);
  const initial = f.model.getSnapshot().rect;
  let prevented = 0;
  await act(async () => dragHandle(f.view).props.onPointerDown(pointer(f, 500, 250, {preventDefault() { prevented++; }})));
  assert.equal(f.captures.size, 0, 'a potential click retains its native target');
  assert.equal(prevented, 0, 'a potential title click retains native mouse events');
  await act(async () => dragHandle(f.view).props.onPointerUp(pointer(f, 502, 252)));
  assert.deepEqual(f.model.getSnapshot().rect, initial);
  assert.equal(f.commits.length + f.snaps, 0);
  let releaseCaptureRequests = 0;
  f.element.setPointerCapture = () => {
    releaseCaptureRequests++;
    throw new Error('The pointer has already been released');
  };
  await act(async () => dragHandle(f.view).props.onPointerDown(pointer(f, 500, 250)));
  await act(async () => dragHandle(f.view).props.onPointerUp(pointer(f, 530, 270, {type: 'pointerup', buttons: 0})));
  assert.equal(releaseCaptureRequests, 0, 'release-only drags commit without reacquiring a released pointer');
  assert.deepEqual(f.commits.at(-1), {left: 330, top: 220, width: 560, height: 260});
  assert.equal(f.snaps, 1);
});

test('a zero-distance title gesture preserves each presentation without committing or snapping', async t => {
  for (const presentation of ['idle', 'focused', 'expanded']) {
    const f = await fixture(t, {presentation});
    const initial = f.model.getSnapshot();
    await act(async () => dragHandle(f.view).props.onPointerDown(pointer(f, 500, 250)));
    await act(async () => dragHandle(f.view).props.onPointerUp(pointer(f, 500, 250)));
    assert.equal(f.model.getSnapshot(), initial, presentation);
    assert.equal(f.commits.length + f.snaps, 0, presentation);
    assert.equal(f.captures.size + f.viewport.count + f.viewport.visualViewport.count, 0, presentation);
  }
});

test('each single title click toggles history while preserving its saved geometry and editor', async t => {
  for (const presentation of ['focused', 'expanded']) {
    const f = await fixture(t, {presentation});
    const expandedRect = f.model.getSnapshot().rect;
    let expected = presentation;
    for (const detail of [1, 2, 3]) {
      await act(async () => dragHandle(f.view).props.onPointerDown(pointer(f, 500, 250)));
      await act(async () => dragHandle(f.view).props.onPointerUp(pointer(f, 500, 250, {type: 'pointerup'})));
      await act(async () => floatingHeader(f.view).props.onClick(clickEvent({detail})));
      expected = expected === 'expanded' ? 'focused' : 'expanded';
      const snapshot = f.model.getSnapshot();
      assert.equal(snapshot.floatingPresentation, expected, presentation + ' click ' + detail);
      assert.equal(dragHandle(f.view).props['aria-expanded'], expected === 'expanded');
      assert.equal(dragHandle(f.view).props.title, expected === 'expanded' ? '单击收起历史消息' : '单击展开历史消息');
      assert.deepEqual(snapshot.rect, expandedRect);
      if (expected === 'expanded') assert.deepEqual(snapshot.displayRect, expandedRect);
      else assert.ok(snapshot.displayRect.height < expandedRect.height);
      assert.equal(f.editor.draft, '保留的草稿');
      assert.equal(f.commits.length + f.snaps, 0);
    }
  }
});

test('a native double-click sequence performs its two click toggles without an extra double-click action', async t => {
  const f = await fixture(t, {presentation: 'focused'});
  assert.equal(dragHandle(f.view).props.onDoubleClick, undefined);
  for (const detail of [1, 2]) {
    await act(async () => dragHandle(f.view).props.onPointerDown(pointer(f, 500, 250)));
    await act(async () => dragHandle(f.view).props.onPointerUp(pointer(f, 500, 250, {type: 'pointerup'})));
    await act(async () => floatingHeader(f.view).props.onClick(clickEvent({detail})));
    assert.equal(f.model.getSnapshot().floatingPresentation, detail === 1 ? 'expanded' : 'focused');
    assert.equal(f.captures.size, 0);
  }
  let stopped = 0;
  await act(async () => floatingHeader(f.view).props.onDoubleClick(clickEvent({stopPropagation() { stopped++; }})));
  assert.equal(f.model.getSnapshot().floatingPresentation, 'focused');
  assert.equal(stopped, 1);
  assert.equal(f.commits.length + f.snaps, 0);
});

test('a completed title drag suppresses its generated click and the next fresh title click still toggles', async t => {
  const f = await fixture(t, {presentation: 'expanded'});
  await act(async () => dragHandle(f.view).props.onPointerDown(pointer(f, 500, 250)));
  await act(async () => dragHandle(f.view).props.onPointerMove(pointer(f, 550, 300)));
  assert.equal(f.captures.size, 1);
  await act(async () => dragHandle(f.view).props.onPointerUp(pointer(f, 550, 300, {type: 'pointerup'})));
  await act(async () => floatingHeader(f.view).props.onClick(clickEvent()));
  assert.equal(f.model.getSnapshot().floatingPresentation, 'expanded');
  assert.equal(f.snaps, 1);
  await act(async () => dragHandle(f.view).props.onPointerDown(pointer(f, 550, 300)));
  await act(async () => dragHandle(f.view).props.onPointerUp(pointer(f, 550, 300, {type: 'pointerup'})));
  await act(async () => floatingHeader(f.view).props.onClick(clickEvent()));
  assert.equal(f.model.getSnapshot().floatingPresentation, 'focused');
  assert.equal(f.snaps, 1);
});

test('single-clicking title-bar padding toggles history while title controls and menu items remain isolated', async t => {
  const f = await fixture(t, {presentation: 'focused'});
  for (const interactive of [{tagName: 'BUTTON'}, {role: 'menuitem'}]) {
    await act(async () => floatingHeader(f.view).props.onClick(clickEvent({target: {closest: () => interactive}})));
    assert.equal(f.model.getSnapshot().floatingPresentation, 'focused');
  }
  await act(async () => floatingHeader(f.view).props.onPointerDown(pointer(f, 500, 250)));
  await act(async () => floatingHeader(f.view).props.onClick(clickEvent()));
  assert.equal(f.model.getSnapshot().floatingPresentation, 'expanded');
  await act(async () => floatingHeader(f.view).props.onPointerDown(pointer(f, 500, 250)));
  await act(async () => floatingHeader(f.view).props.onClick(clickEvent()));
  assert.equal(f.model.getSnapshot().floatingPresentation, 'focused');
  assert.equal(f.snaps, 0);
});

test('fresh title-bar padding clicks reset drag suppression after cancellation or window blur', async t => {
  for (const interruption of ['pointercancel', 'blur']) {
    const f = await fixture(t, {presentation: 'expanded'});
    await act(async () => dragHandle(f.view).props.onPointerDown(pointer(f, 500, 250)));
    await act(async () => dragHandle(f.view).props.onPointerMove(pointer(f, 550, 300)));
    await act(async () => {
      if (interruption === 'pointercancel') dragHandle(f.view).props.onPointerCancel(pointer(f, 550, 300));
      else f.viewport.emit('blur');
    });
    assert.equal(f.model.getSnapshot().floatingPresentation, 'expanded', interruption);
    assert.equal(f.snaps, 1, interruption);
    await act(async () => floatingHeader(f.view).props.onPointerDown(pointer(f, 550, 300)));
    await act(async () => floatingHeader(f.view).props.onClick(clickEvent()));
    assert.equal(f.model.getSnapshot().floatingPresentation, 'focused', interruption);
    assert.equal(f.snaps, 1, interruption);
    assert.equal(f.captures.size + f.viewport.count + f.viewport.visualViewport.count, 0, interruption);
  }
});

test('Enter and Space toggle the title transcript while arrow keys move its current presentation', async t => {
  const f = await fixture(t, {presentation: 'focused'});
  const expandedRect = f.model.getSnapshot().rect;
  const key = value => ({key: value, preventDefault() {}, stopPropagation() {}});
  await act(async () => dragHandle(f.view).props.onKeyDown(key('Enter')));
  assert.equal(f.model.getSnapshot().floatingPresentation, 'expanded');
  await act(async () => dragHandle(f.view).props.onKeyDown(key(' ')));
  assert.equal(f.model.getSnapshot().floatingPresentation, 'focused');
  const previous = f.model.getSnapshot().displayRect;
  await act(async () => dragHandle(f.view).props.onKeyDown(key('ArrowRight')));
  assert.equal(f.model.getSnapshot().floatingPresentation, 'focused');
  assert.deepEqual(f.model.getSnapshot().displayRect, {...previous, left: previous.left + 10});
  assert.equal(f.model.getSnapshot().rect.height, expandedRect.height);
  assert.equal(f.snaps, 0);
});

test('an active drag survives lost capture and snaps once after release outside the handle', async t => {
  const f = await fixture(t);
  await act(async () => dragHandle(f.view).props.onPointerDown(pointer(f, 500, 250)));
  await act(async () => dragHandle(f.view).props.onPointerMove(pointer(f, 280, 150)));
  f.captures.clear();
  await act(async () => dragHandle(f.view).props.onLostPointerCapture(pointer(f, 280, 150)));
  assert.equal(f.snaps, 0);
  assert.equal(f.attributes.get('data-cgpt-floating-dragging'), '');
  await act(async () => f.viewport.emit('pointerup', pointer(f, 250, 140, {currentTarget: f.viewport})));
  assert.deepEqual(f.commits.at(-1), {left: 50, top: 90, width: 560, height: 260});
  assert.deepEqual(f.model.getSnapshot().rect, {left: 16, top: 16, width: 560, height: 260});
  assert.equal(f.snaps, 1);
  assert.equal(f.attributes.has('data-cgpt-floating-dragging'), false);
  assert.equal(f.viewport.count + f.viewport.visualViewport.count, 0);
});

test('an active owner-window drag tracks zero-button moves and deduplicates release handlers', async t => {
  const f = await fixture(t);
  await act(async () => dragHandle(f.view).props.onPointerDown(pointer(f, 500, 250)));
  assert.equal(f.viewport.hasCapturedListener('pointermove'), true);
  assert.equal(f.viewport.hasCapturedListener('pointerup'), true);
  const staleUp = dragHandle(f.view).props.onPointerUp;
  await act(async () => f.viewport.emit('pointermove', pointer(f, 490, 240, {
    type: 'pointermove', buttons: 1, currentTarget: f.viewport,
  })));
  assert.equal(f.captures.size, 1);
  await act(async () => f.viewport.emit('pointermove', pointer(f, 280, 150, {
    type: 'pointermove', buttons: 0, currentTarget: f.viewport,
  })));
  assert.deepEqual(f.model.getSnapshot().rect, {left: 80, top: 100, width: 560, height: 260});
  await act(async () => f.viewport.emit('pointerup', pointer(f, 250, 140, {
    type: 'pointerup', buttons: 0, currentTarget: f.viewport,
  })));
  await act(async () => staleUp(pointer(f, 250, 140)));
  assert.equal(f.snaps, 1);
  assert.deepEqual(f.model.getSnapshot().rect, {left: 16, top: 16, width: 560, height: 260});
  assert.equal(f.captures.size + f.viewport.count + f.viewport.visualViewport.count, 0);
});

test('a zero-button phantom move leaves a stationary title click available without starting a drag', async t => {
  const f = await fixture(t, {presentation: 'focused'});
  const initial = f.model.getSnapshot();
  await act(async () => dragHandle(f.view).props.onPointerDown(pointer(f, 500, 250, {
    type: 'pointerdown', buttons: 1,
  })));
  await act(async () => f.viewport.emit('pointermove', pointer(f, 900, 600, {
    type: 'pointermove', buttons: 0, currentTarget: f.viewport,
  })));
  assert.equal(f.model.getSnapshot(), initial);
  assert.equal(f.captures.size + f.commits.length + f.snaps, 0);
  assert.equal(f.handleAttributes.has('data-dragging'), false);
  assert.equal(f.attributes.has('data-cgpt-floating-dragging'), false);
  await act(async () => f.viewport.emit('pointerup', pointer(f, 500, 250, {
    type: 'pointerup', buttons: 0, currentTarget: f.viewport,
  })));
  await act(async () => floatingHeader(f.view).props.onClick(clickEvent()));
  assert.equal(f.model.getSnapshot().floatingPresentation, 'expanded');
  assert.equal(f.commits.length + f.snaps, 0);
  assert.equal(f.captures.size + f.viewport.count + f.viewport.visualViewport.count, 0);
});

test('pointer cancellation and viewport interruptions settle an active drag using its last valid position', async t => {
  for (const interruption of ['pointercancel', 'global-pointercancel', 'resize', 'blur', 'visual-resize']) {
    const f = await fixture(t);
    await act(async () => dragHandle(f.view).props.onPointerDown(pointer(f, 500, 250)));
    await act(async () => dragHandle(f.view).props.onPointerMove(pointer(f, 280, 150)));
    const staleUp = dragHandle(f.view).props.onPointerUp;
    await act(async () => {
      if (interruption === 'pointercancel') dragHandle(f.view).props.onPointerCancel(pointer(f, 900, 600));
      if (interruption === 'global-pointercancel') f.viewport.emit('pointercancel', pointer(f, 900, 600));
      if (interruption === 'resize' || interruption === 'blur') f.viewport.emit(interruption);
      if (interruption === 'visual-resize') f.viewport.visualViewport.emit('resize');
    });
    await act(async () => staleUp(pointer(f, 900, 600)));
    assert.equal(f.snaps, 1, interruption);
    assert.deepEqual(f.model.getSnapshot().rect, {left: 16, top: 16, width: 560, height: 260}, interruption);
    assert.equal(f.commits.length, 1, interruption);
    assert.equal(f.captures.size + f.viewport.count + f.viewport.visualViewport.count, 0, interruption);
    assert.equal(f.attributes.has('data-cgpt-floating-dragging'), false, interruption);
  }
});

test('Session and presentation changes or unmount clean up without snapping a stale drag', async t => {
  for (const cancellation of ['session', 'mode', 'minimized', 'unavailable', 'unmount']) {
    const f = await fixture(t);
    await act(async () => dragHandle(f.view).props.onPointerDown(pointer(f, 500, 250)));
    await act(async () => dragHandle(f.view).props.onPointerMove(pointer(f, 30, 280)));
    const staleUp = dragHandle(f.view).props.onPointerUp;
    await act(async () => {
      if (cancellation === 'session') f.model.setContext({sessionId: 'b', available: true});
      if (cancellation === 'mode') f.model.setMode('left');
      if (cancellation === 'minimized') f.model.setMinimized(true);
      if (cancellation === 'unavailable') f.model.setContext({sessionId: 'a', available: false});
      if (cancellation === 'unmount') f.view.unmount();
    });
    await act(async () => {
      f.viewport.emit('pointerup', pointer(f, 20, 280));
      staleUp(pointer(f, 20, 280));
    });
    assert.equal(f.snaps + f.edges.length + f.modes.length, 0, cancellation);
    assert.equal(f.captures.size + f.viewport.count + f.viewport.visualViewport.count, 0, cancellation);
    assert.equal(f.attributes.has('data-cgpt-floating-dragging'), false, cancellation);
  }
});

test('lost capture before the drag threshold cleans up and leaves a click unsnapped', async t => {
  const f = await fixture(t);
  await act(async () => dragHandle(f.view).props.onPointerDown(pointer(f, 500, 250)));
  await act(async () => dragHandle(f.view).props.onLostPointerCapture(pointer(f, 502, 252)));
  await act(async () => f.viewport.emit('pointerup', pointer(f, 700, 400)));
  assert.equal(f.snaps + f.commits.length, 0);
  assert.equal(f.captures.size + f.viewport.count + f.viewport.visualViewport.count, 0);
});

test('card position selects four corners or bottom center independently of the header grip point', async t => {
  const cases = [
    {left: 80, top: 100, snappedLeft: 16, snappedTop: 16},
    {left: 650, top: 100, snappedLeft: 704, snappedTop: 16},
    {left: 80, top: 450, snappedLeft: 16, snappedTop: 524},
    {left: 650, top: 450, snappedLeft: 704, snappedTop: 524},
    {left: 360, top: 100, snappedLeft: 360, snappedTop: 524},
  ];
  for (const position of cases) {
    for (const gripOffset of [60, 440]) {
      const f = await fixture(t);
      await act(async () => dragHandle(f.view).props.onPointerDown(pointer(f, 300 + gripOffset, 220)));
      await act(async () => dragHandle(f.view).props.onPointerMove(pointer(f, position.left + gripOffset, position.top + 20)));
      assert.equal(f.snaps, 0);
      await act(async () => dragHandle(f.view).props.onPointerUp(pointer(f, position.left + gripOffset, position.top + 20)));
      assert.equal(f.snaps, 1);
      assert.deepEqual(f.edges, []);
      assert.deepEqual(f.modes, []);
      assert.equal(f.model.getSnapshot().mode, 'floating');
      assert.deepEqual(f.model.getSnapshot().rect, {
        left: position.snappedLeft, top: position.snappedTop, width: 560, height: 260,
      });
    }
  }
});

test('a card filling a tiny track settles to the bottom without changing modes', async t => {
  const tiny = await fixture(t, {bounds: {width: 120}});
  await act(async () => dragHandle(tiny.view).props.onPointerDown(pointer(tiny, 60, 250)));
  await act(async () => dragHandle(tiny.view).props.onPointerUp(pointer(tiny, 16, 300)));
  assert.deepEqual(tiny.modes, []);
  assert.deepEqual(tiny.edges, []);
  assert.equal(tiny.snaps, 1);
});

test('a refused drag snap keeps the floating editor and shows a dismissible failure', async t => {
  const f = await fixture(t, {failure: '吸附暂不可用'});
  await act(async () => dragHandle(f.view).props.onPointerDown(pointer(f, 500, 250)));
  await act(async () => dragHandle(f.view).props.onPointerUp(pointer(f, 20, 300)));
  assert.equal(f.model.getSnapshot().mode, 'floating');
  assert.deepEqual(f.modes, []);
  assert.equal(f.view.root.findByProps({role: 'alert'}).findByType('span').children[0], '吸附暂不可用');
  await act(async () => f.view.root.findByProps({'aria-label': '关闭布局提示'}).props.onClick());
  assert.equal(f.view.root.findAllByProps({role: 'alert'}).length, 0);
});

test('minimization becomes one focused restore bubble and restores the original editor and dimensions', async t => {
  const f = await fixture(t);
  const original = f.model.getSnapshot().rect;
  await act(async () => f.view.root.findByProps({'aria-label': '最小化输入框'}).props.onClick());
  assert.equal(f.view.root.findAllByType(Menu).length, 0);
  assert.equal(f.view.root.findAllByProps({role: 'separator'}).length, 0);
  assert.equal(f.view.root.findAllByProps({className: 'cgpt-floating-conversation-title'}).length, 0);
  assert.equal(f.bubbleFocus, 0);
  f.flushFrames();
  assert.equal(f.bubbleFocus, 1);
  assert.deepEqual(f.model.getSnapshot().rect, original);
  assert.deepEqual(f.model.getSnapshot().bubbleRect, {left: 1216, top: 736, width: 48, height: 48});
  await act(async () => f.view.root.findByProps({'aria-label': '恢复悬浮输入框'}).props.onClick());
  assert.equal(f.view.root.findAllByProps({role: 'separator'}).length, 4);
  assert.equal(f.editorFocus, 0);
  f.flushFrames();
  assert.equal(f.editorFocus, 1);
  assert.equal(f.editor.draft, '保留的草稿');
  assert.deepEqual(f.model.getSnapshot().rect, original);
});

test('a Session switch cancels a queued bubble focus before the Host next frame', async t => {
  const f = await fixture(t);
  await act(async () => f.model.setMinimized(true));
  assert.equal(f.frames.size, 1);
  assert.equal(f.bubbleFocus, 0);
  await act(async () => f.model.setContext({sessionId: 'b', available: true}));
  assert.equal(f.frames.size, 0);
  f.flushFrames();
  assert.equal(f.bubbleFocus + f.editorFocus, 0);
});

test('top and bottom handles use vertical pointer deltas, horizontal separators and Up or Down keys', async t => {
  const f = await fixture(t);
  const top = resizeHandle(f.view, 'top');
  assert.equal(top.props['aria-orientation'], 'horizontal');
  assert.equal(top.props['aria-valuemin'], 90);
  assert.equal(top.props['aria-valuemax'], 768);
  await act(async () => top.props.onPointerDown(pointer(f, 500, 200)));
  await act(async () => resizeHandle(f.view, 'top').props.onPointerMove(pointer(f, 800, 240)));
  assert.deepEqual(f.model.getSnapshot().rect, {left: 300, top: 240, width: 560, height: 220});
  await act(async () => resizeHandle(f.view, 'top').props.onPointerUp(pointer(f, 800, 220)));
  assert.deepEqual(f.model.getSnapshot().rect, {left: 300, top: 220, width: 560, height: 240});
  const key = value => ({key: value, shiftKey: true, preventDefault() {}, stopPropagation() {}});
  await act(async () => resizeHandle(f.view, 'bottom').props.onKeyDown(key('ArrowDown')));
  assert.deepEqual(f.model.getSnapshot().rect, {left: 300, top: 220, width: 560, height: 280});
  const current = f.model.getSnapshot();
  await act(async () => resizeHandle(f.view, 'top').props.onKeyDown(key('ArrowRight')));
  assert.equal(f.model.getSnapshot(), current);
  assert.equal(f.captures.size + f.viewport.count + f.viewport.visualViewport.count, 0);
});
