import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {createConversationLayoutModel} from '../src/conversation-layout-model.js';
import {FloatingConversationHeader} from '../src/conversation-layout-ui.js';

const h = React.createElement;

// Keep the primitive boundary visible so these tests inspect the real Menu props.
function MenuProbe({anchor, open, children}) {
  return h('span', null, anchor, open && h('div', {role: 'menu'}, children));
}
function MenuItemProbe({children}) {
  return h('div', {role: 'menuitem'}, children);
}

function pointerDocument() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, listener, capture = false) {
      assert.equal(type, 'pointerdown');
      listeners.set(listener, capture);
    },
    removeEventListener(type, listener, capture = false) {
      assert.equal(type, 'pointerdown');
      assert.equal(listeners.get(listener), capture);
      listeners.delete(listener);
    },
    pointerDown(target, path = [target], targetHandler = () => {}) {
      let stopped = false;
      const event = {target, composedPath: () => path, stopPropagation() { stopped = true; }};
      for (const [listener, capture] of [...listeners]) if (capture) listener(event);
      targetHandler(event);
      if (!stopped) for (const [listener, capture] of [...listeners]) if (!capture) listener(event);
    },
  };
}

async function fixture(t) {
  const preferences = new Map();
  const storage = {
    getItem: key => preferences.get(key) ?? null,
    setItem: (key, value) => preferences.set(key, value),
  };
  const model = createConversationLayoutModel({storage, eventTarget: undefined});
  model.setContext({sessionId: 'a', available: true, title: '会话 A', contentOpen: true});
  model.setMode('floating');
  const calls = [];
  const actions = {
    setMode(mode) { calls.push(mode); model.setMode(mode); },
    showConversation() { calls.push('conversation'); model.setMode('left'); },
  };
  const ownerDocument = pointerDocument();
  const anchor = {
    ownerDocument,
    contains: node => node === anchor || node?.anchor === anchor,
    getBoundingClientRect: () => ({left: 800, right: 828, top: 520, bottom: 548}),
  };
  let view;
  await act(async () => {
    view = TestRenderer.create(h(FloatingConversationHeader, {model, actions, Menu: MenuProbe, MenuItem: MenuItemProbe}), {
      createNodeMock: node => node.props['aria-label'] === '会话布局' ? anchor : null,
    });
  });
  t.after(async () => { await act(async () => view.unmount()); model.dispose(); });
  return {view, model, anchor, calls, storage, ownerDocument};
}

const menu = view => view.root.findByType(MenuProbe).props;
const trigger = view => view.root.findByProps({'aria-label': '会话布局'});
const activate = async (view, detail = 1) => {
  await act(async () => trigger(view).props.onClick({detail, stopPropagation() {}}));
};

test('floating menu uses a stable in-flow anchorRef without selecting the point-anchor branch', async t => {
  const {view, model, anchor} = await fixture(t);
  const reference = menu(view).anchorRef;
  assert.equal(reference.current, anchor);
  assert.equal(menu(view).open, false);
  assert.equal(menu(view).portal, true);
  assert.equal(menu(view).autoFocus, true);
  assert.equal(menu(view).align, 'end');
  for (const name of ['anchorPoint', 'contextual', 'getAnchorRect']) assert.equal(name in menu(view), false);
  assert.equal(menu(view).anchor.type, 'button');
  assert.equal(menu(view).anchor.props.style, undefined);
  assert.equal(menu(view).anchor.props['aria-haspopup'], 'menu');
  assert.equal(view.root.findByProps({'aria-label': '最小化输入框'}).props['aria-expanded'], undefined);
  const menuIcon = trigger(view).findByType('svg');
  assert.equal(menuIcon.props.strokeWidth, 2.4);
  assert.equal(menuIcon.findByType('path').props.d.split('M').length - 1, 6);

  // Keyboard activation reaches the native button's click handler with detail 0.
  await activate(view, 0);
  assert.equal(menu(view).open, true);
  assert.equal(trigger(view).props['aria-expanded'], true);
  assert.equal(menu(view).anchorRef, reference);
  assert.equal(reference.current, anchor);
  assert.equal(view.root.findAllByProps({role: 'menuitem'}).length, 5);
  await act(async () => model.setRect({left: 600, top: 300, width: 600}));
  assert.equal(menu(view).open, true);
  assert.equal(menu(view).anchorRef.current, anchor);
  for (const name of ['anchorPoint', 'contextual', 'getAnchorRect']) assert.equal(name in menu(view), false);
});

test('layout menu activation and dismissal preserve the compact presentation', async t => {
  const {view, model} = await fixture(t);
  const initial = model.getSnapshot();
  assert.equal(initial.floatingPresentation, 'idle');
  const header = view.root.findByProps({className: 'cgpt-floating-conversation-header'});
  assert.equal(typeof header.props.onClick, 'function');
  assert.equal(trigger(view).props.onDoubleClick, undefined);
  let stopped = 0;
  await act(async () => trigger(view).props.onPointerDown({stopPropagation() { stopped++; }}));
  await activate(view, 2);
  await act(async () => header.props.onClick({
    target: {closest: () => ({tagName: 'BUTTON'})},
    preventDefault() { throw new Error('A menu-trigger click must keep its native action'); },
    stopPropagation() {},
  }));
  assert.equal(menu(view).open, true);
  assert.equal(model.getSnapshot(), initial);
  await act(async () => menu(view).onClose());
  assert.equal(menu(view).open, false);
  assert.equal(model.getSnapshot(), initial);
  assert.equal(stopped, 1);
});

test('native dismissal, repeated activation and Session or mode changes close the controlled menu', async t => {
  const {view, model} = await fixture(t);
  await activate(view);
  await act(async () => menu(view).onClose());
  assert.equal(menu(view).open, false);
  assert.equal(trigger(view).props['aria-expanded'], false);
  await activate(view, 0);
  await activate(view, 0);
  assert.equal(menu(view).open, false);

  await activate(view);
  await act(async () => {
    model.setContext({sessionId: 'b', available: true, title: '会话 B', contentOpen: true});
    model.setMode('floating');
  });
  assert.equal(menu(view).open, false);
  await activate(view);
  await act(async () => model.setMode('right'));
  assert.equal(view.root.findAllByType(MenuProbe).length, 0);
  await act(async () => model.setMode('floating'));
  assert.equal(menu(view).open, false);
  await activate(view);
  await act(async () => model.setContext({sessionId: 'b', available: false}));
  assert.equal(view.root.findAllByType(MenuProbe).length, 0);
  await act(async () => model.setContext({sessionId: 'b', available: true}));
  assert.equal(menu(view).open, false);
});

test('outside dismissal captures pointerdown while preserving trigger and menu content clicks', async t => {
  const {view, anchor, ownerDocument} = await fixture(t);
  assert.equal(ownerDocument.listeners.size, 0);
  await activate(view);
  assert.deepEqual([...ownerDocument.listeners.values()], [true]);

  const icon = {anchor, nodeType: 1};
  await act(async () => ownerDocument.pointerDown(anchor));
  await act(async () => ownerDocument.pointerDown(icon));
  await act(async () => ownerDocument.pointerDown({}, [{}, anchor]));
  assert.equal(menu(view).open, true, 'the trigger controls its own click toggle');

  const menuList = {classList: {contains: name => name === 'cgpt-conversation-layout-menu-list'}};
  await act(async () => ownerDocument.pointerDown(menuList));
  await act(async () => ownerDocument.pointerDown({}, [{}, menuList]));
  assert.equal(menu(view).open, true, 'menu selection retains the native item action');

  await act(async () => ownerDocument.pointerDown(icon));
  await activate(view);
  assert.equal(menu(view).open, false, 'a second trigger click closes without reopening');
  await activate(view);
  assert.deepEqual([...ownerDocument.listeners.values()], [true]);

  await act(async () => ownerDocument.pointerDown({}));
  assert.equal(menu(view).open, false);
  assert.equal(ownerDocument.listeners.size, 0);
});

test('an outside target that stops propagation still dismisses the menu on its first pointerdown', async t => {
  const {view, model, ownerDocument} = await fixture(t);
  await activate(view);
  let stopped = 0;
  await act(async () => ownerDocument.pointerDown({}, undefined, event => {
    event.stopPropagation();
    stopped++;
    model.setFloatingPresentation('expanded');
  }));
  assert.equal(stopped, 1);
  assert.equal(menu(view).open, false);
  assert.equal(model.getSnapshot().floatingPresentation, 'expanded');
  assert.equal(ownerDocument.listeners.size, 0);
});

test('outside capture listeners are cleaned after native close, Session changes and unmount', async t => {
  const {view, model, ownerDocument} = await fixture(t);
  await activate(view);
  assert.equal(ownerDocument.listeners.size, 1);
  await act(async () => menu(view).onClose());
  assert.equal(ownerDocument.listeners.size, 0);

  await activate(view);
  assert.equal(ownerDocument.listeners.size, 1);
  await act(async () => {
    model.setContext({sessionId: 'b', available: true, title: '会话 B', contentOpen: true});
    model.setMode('floating');
  });
  assert.equal(menu(view).open, false);
  assert.equal(ownerDocument.listeners.size, 0);

  await activate(view);
  assert.equal(ownerDocument.listeners.size, 1);
  await act(async () => view.unmount());
  assert.equal(ownerDocument.listeners.size, 0);
});

test('native menu rows retain selection state and dispatch one requested layout action', async t => {
  const {view, calls} = await fixture(t);
  await activate(view);
  const rows = view.root.findAllByType(MenuItemProbe);
  assert.deepEqual(rows.map(row => row.props.children), ['移至左侧窗格', '移至右侧窗格', '悬浮输入框', '会话完整视图', '显示会话用量']);
  assert.equal(rows[2].props.selected, true);
  await act(async () => rows[1].props.onSelect());
  assert.deepEqual(calls, ['right']);
  assert.equal(view.root.findAllByType(MenuProbe).length, 0);
});

test('the usage toggle changes once, reflects its checked state and reports a persistence failure', async t => {
  const {view, model, storage} = await fixture(t);
  assert.equal(model.getSnapshot().showStatistics, false);
  await activate(view);
  let toggle = view.root.findAllByType(MenuItemProbe).at(-1);
  assert.equal(toggle.props.children, '显示会话用量');
  assert.equal(toggle.props.separatorBefore, true);
  assert.equal(toggle.props.selected, false);
  assert.match(toggle.props['aria-label'], /已关闭/);
  await act(async () => { toggle.props.onSelect(); toggle.props.onSelect(); });
  assert.equal(model.getSnapshot().showStatistics, true);
  assert.equal(menu(view).open, false);

  await activate(view);
  toggle = view.root.findAllByType(MenuItemProbe).at(-1);
  assert.equal(toggle.props.selected, true);
  assert.match(toggle.props['aria-label'], /已开启/);
  await act(async () => toggle.props.onSelect());
  assert.equal(model.getSnapshot().showStatistics, false);

  storage.setItem = () => { throw new Error('Storage is unavailable'); };
  await activate(view);
  toggle = view.root.findAllByType(MenuItemProbe).at(-1);
  await act(async () => toggle.props.onSelect());
  assert.equal(model.getSnapshot().showStatistics, true);
  const notice = view.root.findByProps({role: 'alert'});
  assert.match(notice.findByType('span').children[0], /未能保存到本机/);
  await act(async () => view.root.findByProps({'aria-label': '关闭布局提示'}).props.onClick());
  assert.equal(view.root.findAllByProps({role: 'alert'}).length, 0);
});

test('the usage toggle reads the latest value and discards a stale Session callback', async t => {
  const {view, model} = await fixture(t);
  await activate(view);
  const previous = view.root.findAllByType(MenuItemProbe).at(-1).props.onSelect;
  await act(async () => model.setShowStatistics(true));
  await act(async () => previous());
  assert.equal(model.getSnapshot().showStatistics, false);

  await activate(view);
  const stale = view.root.findAllByType(MenuItemProbe).at(-1).props.onSelect;
  await act(async () => {
    model.setContext({sessionId: 'b', available: true});
    model.setMode('floating');
    stale();
  });
  assert.equal(model.getSnapshot().showStatistics, false);
  assert.equal(menu(view).open, false);
});
