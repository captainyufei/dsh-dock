import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import { mountConversationLayout } from '../src/conversation-layout-host.js';
import { createConversationLayoutModel } from '../src/conversation-layout-model.js';

test('floating input styles stay scoped to the selected native composer', async () => {
  const css = await readFile(new URL('../src/conversation-layout-host.css', import.meta.url), 'utf8');
  const controls = await readFile(new URL('../src/conversation-layout.css', import.meta.url), 'utf8');
  const resizeLayer = Number(css.match(/\.cgpt-floating-conversation-resize-seat\s*\{[^}]*z-index:\s*(\d+)/)[1]);
  const headerLayer = Number(controls.match(/\.cgpt-floating-conversation-header\s*\{[^}]*z-index:\s*(\d+)/)[1]);
  assert.ok(resizeLayer > headerLayer, 'the top resize handle must receive input above the title bar');
  const floatingSurface = css.match(/\[data-cgpt-conversation-mode='floating'\] \[data-cgpt-conversation-content\]\s*\{([^}]+)\}/)[1];
  assert.match(floatingSurface, /--cgpt-floating-radius:\s*28px/);
  assert.match(floatingSurface, /border-radius:\s*var\(--cgpt-floating-radius\)/);
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (rule[1].includes('data-cgpt-floating-presentation')) {
      assert.doesNotMatch(rule[2], /border-radius\s*:/, 'activating or expanding the conversation must retain its corner radius');
    }
  }
  assert.match(controls, /border-radius:\s*calc\(var\(--cgpt-floating-radius, 28px\) - 1px\)/);
  assert.match(css, /border-radius:\s*0 0 calc\(var\(--cgpt-floating-radius\) - 1px\)/);
  assert.match(controls, /\.cgpt-floating-conversation-header \.cgpt-conversation-layout-button\s*\{[^}]*border-radius:\s*50%/);
  const floatingHeader = controls.match(/\.cgpt-floating-conversation-header\s*\{([^}]+)\}/)[1];
  assert.doesNotMatch(floatingHeader, /border-bottom\s*:/);
  assert.match(css, /\[data-cgpt-floating-presentation='expanded'\]\) \[data-cgpt-conversation-scroll\]\s*\{[^}]*overflow-y:\s*hidden/);
  assert.match(css, /\[data-cgpt-conversation-scroll\]::-webkit-scrollbar-track\s*\{[^}]*margin-bottom:\s*calc\(var\(--cgpt-floating-composer-height, 54px\) \+ 2px\)/);
  assert.match(css, /\[data-cgpt-conversation-composer\] \[data-input-scroll\]\s*\{[^}]*scrollbar-width:\s*none/);
  assert.match(css, /\[data-cgpt-conversation-composer\] \[data-input-scroll\]::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
  assert.match(css, /\[data-slot='conversation.composer.bar'\] > :has\(> \[data-composer-card\] \[data-composer-placeholder\]\)\s*\{[^}]*padding-bottom:\s*0/);
  const emptyCard = css.match(/\[data-cgpt-conversation-composer\] \[data-composer-card\]:has\(\[data-composer-placeholder\]\)\s*\{([^}]+)\}/)[1];
  assert.match(emptyCard, /align-items:\s*center/);
  assert.match(emptyCard, /padding:\s*10px 8px/);
  const emptyToolbar = css.match(/\[data-composer-card\]:has\(\[data-composer-placeholder\]\) > \[data-input-scroll\] \+ div\s*\{([^}]+)\}/)[1];
  assert.match(emptyToolbar, /display:\s*grid/);
  assert.match(emptyToolbar, /grid-template-columns:\s*subgrid/);
  assert.match(emptyToolbar, /container-type:\s*normal/);
  assert.match(css, /\[data-composer-card\]:has\(\[data-composer-placeholder\]\) > \[data-input-scroll\] \+ div > :last-child > button\s*\{[^}]*transform:\s*none/);
  for (const rule of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    for (const selector of rule[1].split(',')) {
      if (!/\[data-(?:composer-card|input-scroll|composer-input|composer-dock)\]/.test(selector)) continue;
      assert.ok(selector.includes('[data-cgpt-conversation-composer]'), selector.trim());
    }
  }
});

test('folding the title keeps its height limit and divider independent of animated geometry', async () => {
  const css = await readFile(new URL('../src/conversation-layout-host.css', import.meta.url), 'utf8');
  const floatingSurface = css.match(/\[data-cgpt-conversation-mode='floating'\] \[data-cgpt-conversation-content\]\s*\{([^}]+)\}/)[1];
  const maximumHeight = floatingSurface.match(/max-height:\s*([^;]+);/)[1];
  assert.equal(maximumHeight, 'max(40px, calc(100dvh - 16px))');
  assert.doesNotMatch(maximumHeight, /--cgpt-floating-top/, 'the destination top must not clip the current animation frame');

  const divider = css.match(/\[data-cgpt-conversation-content\]:is\(\[data-cgpt-floating-presentation='focused'\], \[data-cgpt-floating-presentation='expanded'\]\) \[data-cgpt-conversation-composer\]\s*\{([^}]+)\}/)[1];
  assert.match(divider, /box-shadow:\s*inset 0 1px(?: 0)? var\(--dsw-alias-border-l1/);
  assert.doesNotMatch(divider, /(?:^|;)\s*(?:border(?:-(?:top|bottom))?|padding(?:-(?:top|bottom))?|height|min-height|max-height)\s*:/,
    'showing the divider must not change the measured composer height');
});

function source(value) {
  const listeners = new Set();
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      value = next;
      for (const listener of [...listeners]) listener();
    },
    get listenerCount() { return listeners.size; },
  };
}

function fixture() {
  const mutations = [];
  const resizes = [];
  const frames = new Map();
  let nextFrame = 0;
  let writes = 0;
  let document;

  function listenersFor(target) {
    const listeners = new Map();
    target.addEventListener = (type, callback, options = false) => {
      if (!listeners.has(type)) listeners.set(type, new Map());
      listeners.get(type).set(callback, typeof options === 'boolean' ? options : Boolean(options.capture));
    };
    target.removeEventListener = (type, callback, options = false) => {
      const capture = typeof options === 'boolean' ? options : Boolean(options.capture);
      if (listeners.get(type)?.get(callback) === capture) listeners.get(type).delete(callback);
    };
    target.dispatchListeners = (type, event, capture) => {
      for (const [callback, listenerCapture] of [...listeners.get(type) || []]) {
        if (listenerCapture === capture) callback(event);
      }
    };
    Object.defineProperty(target, 'listenerCount', {
      get: () => [...listeners.values()].reduce((count, entries) => count + entries.size, 0),
    });
  }

  function node(tag = 'div', initial = {}) {
    const attributes = new Map(Object.entries(initial));
    const properties = new Map();
    const captures = new Set();
    const element = {
      tagName: tag,
      ownerDocument: document,
      children: [],
      parentElement: null,
      previousElementSibling: null,
      rect: { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 },
      getAttribute: name => attributes.get(name) ?? null,
      hasAttribute: name => attributes.has(name),
      setAttribute(name, value) { writes++; attributes.set(name, String(value)); },
      removeAttribute(name) { writes++; attributes.delete(name); },
      appendChild(child) {
        child.remove();
        this.children.push(child);
        child.parentElement = this;
      },
      prepend(child) {
        child.remove();
        this.children.unshift(child);
        child.parentElement = this;
      },
      remove() {
        const children = this.parentElement?.children;
        if (children) children.splice(children.indexOf(this), 1);
        this.parentElement = null;
      },
      closest(selector) {
        let current = this;
        while (current) {
          if (current.matches(selector)) return current;
          current = current.parentElement;
        }
        return null;
      },
      contains(candidate) {
        for (let current = candidate; current; current = current.parentElement) {
          if (current === this) return true;
        }
        return false;
      },
      matches(selector) {
        if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
        if (selector.includes('][')) return selector.match(/\[[^\]]+\]/g)
          .every(part => this.matches(part));
        if (selector.startsWith('.')) return String(this.className || '').split(/\s+/).includes(selector.slice(1));
        const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
        if (attribute) return this.hasAttribute(attribute[1])
          && (attribute[2] === undefined || this.getAttribute(attribute[1]) === attribute[2]);
        return selector === this.tagName;
      },
      querySelectorAll(selector) {
        const results = [];
        for (const child of this.children) {
          if (child.matches(selector)) results.push(child);
          results.push(...child.querySelectorAll(selector));
        }
        return results;
      },
      querySelector(selector) {
        if (selector === '[data-slot="conversation.header"] > header') {
          return this.querySelector('[data-slot="conversation.header"]')?.children
            .find(child => child.tagName === 'header') ?? null;
        }
        return this.querySelectorAll(selector)[0] ?? null;
      },
      getBoundingClientRect() { return { ...this.rect }; },
      focus() { document.activeElement = this; },
      setPointerCapture(id) { captures.add(id); },
      hasPointerCapture: id => captures.has(id),
      releasePointerCapture(id) { captures.delete(id); },
      style: {
        gridTemplateColumns: '',
        getPropertyValue: name => properties.get(name) || '',
        setProperty(name, value) { writes++; properties.set(name, value); },
        removeProperty(name) { writes++; properties.delete(name); },
      },
    };
    listenersFor(element);
    return element;
  }

  class MutationObserver {
    constructor(callback) { this.callback = callback; mutations.push(this); }
    observe() { this.connected = true; }
    disconnect() { this.connected = false; }
  }
  class ResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.targets = new Set();
      resizes.push(this);
    }
    observe(target) { this.connected = true; this.targets.add(target); }
    unobserve(target) { this.targets.delete(target); }
    disconnect() { this.connected = false; this.targets.clear(); }
  }
  document = {
    createElement: tag => node(tag),
    defaultView: {
      MutationObserver,
      ResizeObserver,
      requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
      cancelAnimationFrame(id) { frames.delete(id); },
      setTimeout,
    },
  };
  listenersFor(document);
  const frame = node();
  frame.rect = { left: 0, top: 0, width: 1280, height: 800, right: 1280, bottom: 800 };
  frame.style.gridTemplateColumns = '240px minmax(400px, 1fr) minmax(0px, 480px)';
  const sidebarColumn = node();
  sidebarColumn.rect.width = 240;
  const sidebarSlot = node('div', { 'data-slot': 'sidebar' });
  const center = node();
  const root = node('div', { 'data-phase': 'active' });
  const headerSlot = node('div', { 'data-slot': 'conversation.header' });
  const header = node('header');
  const content = node('div', { 'data-conversation-content': '', 'data-conversation-session': 'a' });
  const scroll = node('div', { 'data-conversation-scroll': '' });
  const transcript = node('div', {'data-slot': 'conversation.session'});
  const composer = node('div', { 'data-composer-seat': '' });
  composer.rect = {left: 0, top: 0, width: 560, height: 106, right: 560, bottom: 106};
  const editor = node('div', { contenteditable: 'true' });
  const modelSlot = node('div', { 'data-slot': 'conversation.input.model' });
  const modelTrigger = node('button');
  modelTrigger.rect = {left: 900, top: 700, width: 28, height: 28, right: 928, bottom: 728};
  const permissionSlot = node('div', { 'data-slot': 'conversation.input.permission' });
  const permissionAnchor = node('span');
  const permissionTrigger = node('button', { 'aria-label': '访问模式，当前：工作区内修改' });
  let permissionClicks = 0;
  permissionTrigger.click = () => { permissionClicks++; };
  const rightColumn = node('div', { 'data-rightbar-col': '' });
  rightColumn.previousElementSibling = center;
  rightColumn.rect = { left: 800, top: 0, width: 480, height: 800, right: 1280, bottom: 800 };
  const overlay = node('div', { 'data-shell-overlay': '' });
  const anchor = node('span');
  frame.appendChild(sidebarColumn);
  sidebarColumn.appendChild(sidebarSlot);
  frame.appendChild(center);
  center.appendChild(root);
  root.appendChild(headerSlot);
  headerSlot.appendChild(header);
  root.appendChild(content);
  content.appendChild(scroll);
  scroll.appendChild(transcript);
  scroll.appendChild(composer);
  composer.appendChild(editor);
  composer.appendChild(modelSlot);
  modelSlot.appendChild(modelTrigger);
  composer.appendChild(permissionSlot);
  permissionSlot.appendChild(permissionAnchor);
  permissionAnchor.appendChild(permissionTrigger);
  frame.appendChild(rightColumn);
  frame.appendChild(overlay);
  overlay.appendChild(anchor);
  document.body = frame;
  document.activeElement = frame;
  const panels = new Map();
  for (const id of ['a', 'b']) {
    const wrapper = node('div', id === 'a' ? {} : { hidden: '' });
    const panel = node('div', {
      'data-sidebar-right-session': id,
      'data-sidebar-right-open': '',
      'data-sidebar-right-panel': 'push',
    });
    rightColumn.appendChild(wrapper);
    wrapper.appendChild(panel);
    panels.set(id, { panel, wrapper });
  }
  const sessions = source({ byId: { a: { title: '会话 A' }, b: { title: '会话 B' } } });
  const panelInfo = source({ activePanelId: null });
  const currentPanel = () => panels.get(content.getAttribute('data-conversation-session')).panel;
  const sidebar = {
    commandTarget: () => ({ sessionId: content.getAttribute('data-conversation-session') }),
    isExpanded: () => currentPanel().hasAttribute('data-sidebar-right-open'),
    openTab() { currentPanel().setAttribute('data-sidebar-right-open', ''); },
    toggleExpanded() {
      const panel = currentPanel();
      if (panel.hasAttribute('data-sidebar-right-open')) panel.removeAttribute('data-sidebar-right-open');
      else panel.setAttribute('data-sidebar-right-open', '');
    },
    toggleFullscreen() {
      const panel = currentPanel();
      panel.setAttribute('data-sidebar-right-panel', panel.getAttribute('data-sidebar-right-panel') === 'fullscreen' ? 'push' : 'fullscreen');
    },
  };
  const ctx = { get: () => sidebar, layout: { panelInfo }, sessions: { list: sessions } };

  function flush() {
    let iterations = 0;
    while (frames.size) {
      assert.ok(++iterations < 20, 'layout settles without scheduling indefinitely');
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback();
    }
  }
  function emit() {
    for (const observer of mutations) if (observer.connected) observer.callback([]);
    flush();
  }
  function switchSession(id) {
    content.setAttribute('data-conversation-session', id);
    for (const [sessionId, { wrapper }] of panels) {
      if (sessionId === id) wrapper.removeAttribute('hidden');
      else wrapper.setAttribute('hidden', '');
    }
    emit();
  }
  function dispatch(type, target, details = {}) {
    const path = [];
    for (let current = target; current; current = current.parentElement) path.push(current);
    path.push(document);
    let stopped = false;
    const event = {
      type, target, button: 0,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { stopped = true; },
      composedPath: () => path,
      ...details,
    };
    if (type === 'focusin') document.activeElement = target;
    for (const current of [...path].reverse()) {
      event.currentTarget = current;
      current.dispatchListeners(type, event, true);
      if (stopped) return event;
    }
    for (const current of path) {
      event.currentTarget = current;
      current.dispatchListeners(type, event, false);
      if (stopped) return event;
    }
    return event;
  }
  return {
    frame, center, content, scroll, transcript, composer, editor, header, anchor,
    ctx, sessions, panelInfo, panels, mutations, resizes, frames, flush, emit, switchSession, dispatch, document, node,
    modelSlot, modelTrigger, permissionSlot, permissionAnchor, permissionTrigger,
    get permissionClicks() { return permissionClicks; },
    get writes() { return writes; },
  };
}

test('native fullscreen follows the selected Session and preserves its existing content and editor nodes', async t => {
  const f = fixture();
  const model = createConversationLayoutModel({storage: {getItem: () => null, setItem() {}}});
  const parents = new Map([f.content, f.scroll, f.composer, f.editor].map(element => [element, element.parentElement]));
  const host = mountConversationLayout(f.anchor, f.ctx, model);
  t.after(() => { host.dispose(); model.dispose(); });
  f.flush();
  assert.equal(model.getSnapshot().title, '会话 A');
  assert.equal(f.composer.getAttribute('data-cgpt-floating-statistics'), 'hidden');
  const geometry = model.getSnapshot().rect;
  model.setShowStatistics(true);
  f.flush();
  assert.equal(f.composer.getAttribute('data-cgpt-floating-statistics'), 'shown');
  assert.deepEqual(model.getSnapshot().rect, geometry);
  assert.equal(host.floatingSeat.parentElement, f.content);
  assert.equal(host.resizeSeat.parentElement, f.content);
  assert.equal(f.resizes[0].targets.has(f.composer), true);

  await host.actions.setMode('right');
  f.flush();
  assert.equal(model.getSnapshot().mode, 'right');
  assert.equal(f.frame.hasAttribute('data-cgpt-conversation-swapped'), true);
  f.panels.get('a').panel.setAttribute('data-sidebar-right-panel', 'fullscreen');
  f.emit();
  assert.equal(model.getSnapshot().mode, 'floating');
  model.setMinimized(true);
  f.flush();
  assert.equal(f.content.getAttribute('data-cgpt-conversation-minimized'), 'true');
  assert.equal(f.content.style.getPropertyValue('--cgpt-floating-width'), '48px');
  assert.equal(f.content.style.getPropertyValue('--cgpt-floating-height'), '48px');
  model.setMinimized(false);
  f.flush();
  assert.equal(f.content.getAttribute('data-cgpt-conversation-minimized'), 'false');
  assert.equal(f.content.style.getPropertyValue('--cgpt-floating-height'), model.getSnapshot().displayRect.height + 'px');

  f.panels.get('a').panel.setAttribute('data-sidebar-right-panel', 'push');
  f.emit();
  assert.equal(model.getSnapshot().mode, 'right');
  f.switchSession('b');
  assert.equal(model.getSnapshot().mode, 'left');
  assert.equal(model.getSnapshot().title, '会话 B');
  f.panels.get('b').panel.setAttribute('data-sidebar-right-panel', 'fullscreen');
  f.emit();
  assert.equal(model.getSnapshot().mode, 'floating');
  f.switchSession('a');
  assert.equal(model.getSnapshot().mode, 'right');
  for (const [element, parent] of parents) assert.equal(element.parentElement, parent);
  assert.equal(f.editor.parentElement, f.composer);
  assert.equal(f.scroll.children[0], f.transcript);
});

test('the floating card retains its history and composer through resizing and layout changes', async t => {
  const f = fixture();
  const model = createConversationLayoutModel();
  const parents = new Map([f.content, f.scroll, f.transcript, f.composer, f.editor]
    .map(element => [element, element.parentElement]));
  f.editor.textContent = '仍在编辑的草稿';
  const host = mountConversationLayout(f.anchor, f.ctx, model);
  t.after(() => { host.dispose(); model.dispose(); });

  function assertNativeTree() {
    for (const [element, parent] of parents) assert.equal(element.parentElement, parent);
    assert.deepEqual(f.content.children, [host.floatingSeat, f.scroll, host.resizeSeat]);
    assert.deepEqual(f.scroll.children, [f.transcript, f.composer]);
    assert.equal(f.content.querySelector('[contenteditable="true"]'), f.editor);
    assert.equal(f.content.querySelectorAll('[contenteditable="true"]').length, 1);
    assert.equal(f.editor.textContent, '仍在编辑的草稿');
    assert.equal(f.content.parentElement.hasAttribute('data-cgpt-conversation-ancestor'), true);
    for (const element of [f.content, f.scroll, f.transcript, f.composer, f.editor]) {
      assert.equal(element.hasAttribute('data-cgpt-conversation-ancestor'), false);
      assert.equal(element.hasAttribute('data-cgpt-composer-stretch'), false);
    }
    assert.equal(f.composer.style.getPropertyValue('--cgpt-floating-height'), '');
    assert.equal(f.resizes[0].targets.has(f.composer), true);
  }

  await host.actions.setMode('floating');
  model.setFloatingPresentation('expanded');
  f.flush();
  assertNativeTree();
  const initial = model.getSnapshot().rect;
  model.resizeFromEdge('top', -160, initial);
  f.flush();
  const expanded = model.getSnapshot().rect;
  assert.equal(expanded.top + expanded.height, initial.top + initial.height);
  assert.equal(expanded.height, initial.height + 160);
  assert.equal(f.content.style.getPropertyValue('--cgpt-floating-top'), expanded.top + 'px');
  assert.equal(f.content.style.getPropertyValue('--cgpt-floating-height'), expanded.height + 'px');
  assertNativeTree();

  model.setMinimized(true);
  f.flush();
  assert.equal(f.content.getAttribute('data-cgpt-conversation-minimized'), 'true');
  assert.equal(f.content.style.getPropertyValue('--cgpt-floating-height'), '48px');
  assert.deepEqual(model.getSnapshot().rect, expanded);
  assertNativeTree();
  model.setMinimized(false);
  f.flush();
  assert.equal(f.content.style.getPropertyValue('--cgpt-floating-height'), expanded.height + 'px');
  assertNativeTree();

  for (const mode of ['right', 'left', 'floating']) {
    await host.actions.setMode(mode);
    f.flush();
    assert.equal(model.getSnapshot().mode, mode);
    assert.deepEqual(model.getSnapshot().rect, expanded);
    assertNativeTree();
  }
});

test('floating input activates its title without exposing history and only collapses after an outside gesture', async t => {
  const f = fixture();
  const model = createConversationLayoutModel();
  const host = mountConversationLayout(f.anchor, f.ctx, model);
  t.after(() => {host.dispose(); model.dispose();});
  await host.actions.setMode('floating');
  f.flush();
  const expanded = model.getSnapshot().rect;
  const initialBottom = model.getSnapshot().displayRect.top + model.getSnapshot().displayRect.height;
  assert.equal(model.getSnapshot().floatingPresentation, 'idle');
  assert.equal(f.content.getAttribute('data-cgpt-floating-presentation'), 'idle');
  assert.equal(f.content.style.getPropertyValue('--cgpt-floating-height'), model.getSnapshot().displayRect.height + 'px');
  assert.equal(f.transcript.getAttribute('aria-hidden'), 'true');
  assert.equal(f.transcript.hasAttribute('inert'), true);

  f.dispatch('pointerdown', f.editor);
  f.flush();
  const focused = model.getSnapshot();
  assert.equal(focused.floatingPresentation, 'focused');
  assert.equal(focused.displayRect.height, f.composer.rect.height + 42);
  assert.equal(focused.displayRect.top + focused.displayRect.height, initialBottom);
  assert.equal(f.transcript.getAttribute('aria-hidden'), 'true');
  assert.equal(f.transcript.hasAttribute('inert'), true);
  assert.deepEqual(focused.rect, expanded);

  const titleButton = f.node('button');
  host.floatingSeat.appendChild(titleButton);
  f.dispatch('pointerdown', titleButton);
  f.flush();
  assert.equal(model.getSnapshot().floatingPresentation, 'focused');
  for (const role of ['menu', 'listbox', 'dialog']) {
    const popup = f.node('div', {role});
    const popupAction = f.node('button');
    f.frame.appendChild(popup);
    popup.appendChild(popupAction);
    f.dispatch('pointerdown', popupAction);
    f.flush();
    assert.equal(model.getSnapshot().floatingPresentation, 'focused', role + ' is a native portal');
    popup.remove();
  }

  f.dispatch('pointerdown', f.frame);
  f.flush();
  assert.equal(model.getSnapshot().floatingPresentation, 'idle');
  f.dispatch('focusin', f.editor);
  f.flush();
  assert.equal(model.getSnapshot().floatingPresentation, 'focused');

  model.setFloatingPresentation('expanded');
  f.flush();
  assert.equal(f.content.getAttribute('data-cgpt-floating-presentation'), 'expanded');
  assert.equal(f.content.style.getPropertyValue('--cgpt-floating-height'), expanded.height + 'px');
  assert.equal(f.transcript.hasAttribute('inert'), false);
  assert.equal(f.transcript.getAttribute('aria-hidden'), null);
  f.dispatch('pointerdown', f.transcript);
  f.dispatch('pointerdown', f.editor);
  f.dispatch('pointerdown', f.frame);
  f.flush();
  assert.equal(model.getSnapshot().floatingPresentation, 'expanded');
});

test('native composer measurement updates the collapsed surface while retaining expanded dimensions and the reading owner', async t => {
  const f = fixture();
  const model = createConversationLayoutModel();
  const host = mountConversationLayout(f.anchor, f.ctx, model);
  t.after(() => {host.dispose(); model.dispose();});
  await host.actions.setMode('floating');
  f.flush();
  f.scroll.scrollTop = 619;
  f.editor.textContent = '输入变化仍使用同一编辑器';
  const expanded = model.getSnapshot().rect;
  const bottom = model.getSnapshot().displayRect.top + model.getSnapshot().displayRect.height;
  f.composer.rect.height = 138;
  f.resizes[0].callback([]);
  f.flush();
  assert.equal(model.getSnapshot().displayRect.height, 140);
  assert.equal(model.getSnapshot().displayRect.top + model.getSnapshot().displayRect.height, bottom);
  assert.deepEqual(model.getSnapshot().rect, expanded);
  assert.equal(f.content.style.getPropertyValue('--cgpt-floating-expanded-height'), expanded.height + 'px');
  assert.equal(f.content.style.getPropertyValue('--cgpt-floating-composer-height'), '138px');
  assert.equal(f.scroll.scrollTop, 619);
  assert.equal(f.editor.parentElement, f.composer);

  model.setMinimized(true);
  f.flush();
  f.composer.rect.height = 0;
  f.resizes[0].callback([]);
  f.flush();
  assert.equal(model.getSnapshot().displayRect.height, 48);
  f.composer.rect.height = 138;
  model.setMinimized(false);
  f.flush();
  assert.equal(model.getSnapshot().displayRect.height, 140);
  assert.equal(f.scroll.scrollTop, 619);
  assert.equal(f.editor.textContent, '输入变化仍使用同一编辑器');
  await host.actions.setMode('left');
  f.flush();
  assert.equal(f.transcript.hasAttribute('inert'), false);
  assert.equal(f.transcript.getAttribute('aria-hidden'), null);
});

test('collapsed draft scrolling stops native history forwarding only at the draft boundary', async t => {
  const f = fixture();
  const model = createConversationLayoutModel();
  const host = mountConversationLayout(f.anchor, f.ctx, model);
  t.after(() => {host.dispose(); model.dispose();});
  const draft = f.node('div', {'data-input-scroll': ''});
  f.composer.appendChild(draft);
  draft.appendChild(f.editor);
  draft.clientHeight = 48;
  draft.scrollHeight = 240;
  draft.scrollTop = 40;
  f.scroll.scrollTop = 619;
  let forwarded = 0;
  draft.addEventListener('wheel', event => {
    const atBoundary = event.deltaY < 0 ? draft.scrollTop <= 0
      : draft.scrollTop + draft.clientHeight >= draft.scrollHeight - 1;
    if (atBoundary) { forwarded++; f.scroll.scrollTop += event.deltaY; }
  });
  await host.actions.setMode('floating');
  f.flush();
  for (const presentation of ['idle', 'focused']) {
    model.setFloatingPresentation(presentation);
    f.flush();
    draft.scrollTop = 40;
    const withinDraft = f.dispatch('wheel', f.editor, {deltaY: 12});
    assert.equal(withinDraft.defaultPrevented, undefined);
    for (const boundary of [{top: 0, delta: -12}, {top: 192, delta: 12}]) {
      draft.scrollTop = boundary.top;
      const event = f.dispatch('wheel', f.editor, {deltaY: boundary.delta});
      assert.equal(event.defaultPrevented, true);
      assert.equal(forwarded, 0);
      assert.equal(f.scroll.scrollTop, 619);
    }
    const toolbarWheel = f.dispatch('wheel', f.modelTrigger, {deltaY: 24});
    assert.equal(toolbarWheel.defaultPrevented, true);
    assert.equal(forwarded, 0);
    assert.equal(f.scroll.scrollTop, 619);
  }
  model.setFloatingPresentation('expanded');
  f.flush();
  draft.scrollTop = 0;
  const expandedWheel = f.dispatch('wheel', f.editor, {deltaY: -12});
  assert.equal(expandedWheel.defaultPrevented, undefined);
  assert.equal(forwarded, 1);
  assert.equal(f.scroll.scrollTop, 607);
});

test('disposal cancels queued work, releases observers and restores owned presentation state', t => {
  const f = fixture();
  const model = createConversationLayoutModel();
  t.after(() => model.dispose());
  f.frame.setAttribute('data-cgpt-conversation-frame', 'before');
  f.content.style.setProperty('--cgpt-floating-top', 'prior-top');
  const host = mountConversationLayout(f.anchor, f.ctx, model);
  f.flush();
  assert.equal(f.sessions.listenerCount, 1);
  assert.equal(f.panelInfo.listenerCount, 1);
  assert.equal(f.frame.listenerCount, 4);
  assert.equal(f.document.listenerCount, 1);
  f.mutations[0].callback([]);
  assert.equal(f.frames.size, 1);
  host.dispose();
  host.dispose();
  assert.equal(f.frames.size, 0);
  assert.equal(f.mutations[0].connected, false);
  assert.equal(f.resizes[0].connected, false);
  assert.equal(f.sessions.listenerCount, 0);
  assert.equal(f.panelInfo.listenerCount, 0);
  assert.equal(f.frame.listenerCount, 0);
  assert.equal(f.document.listenerCount, 0);
  assert.equal(host.resizeSeat.parentElement, null);
  assert.equal(host.floatingSeat.parentElement, null);
  assert.equal(f.frame.children.some(element => element.className === 'cgpt-conversation-divider'), false);
  assert.equal(f.frame.getAttribute('data-cgpt-conversation-frame'), 'before');
  assert.equal(f.frame.hasAttribute('data-cgpt-conversation-mode'), false);
  assert.equal(f.composer.hasAttribute('data-cgpt-conversation-composer'), false);
  assert.equal(f.composer.hasAttribute('data-cgpt-floating-statistics'), false);
  assert.equal(f.content.style.getPropertyValue('--cgpt-floating-top'), 'prior-top');
  assert.equal(f.content.hasAttribute('data-cgpt-conversation-content'), false);
  assert.equal(f.content.hasAttribute('data-cgpt-conversation-minimized'), false);
  assert.deepEqual(f.content.children, [f.scroll]);
  assert.deepEqual(f.composer.children, [f.editor, f.modelSlot, f.permissionSlot]);
  const writes = f.writes;
  f.mutations[0].callback([]);
  f.resizes[0].callback([]);
  model.setMode('floating');
  f.panelInfo.set({ activePanelId: 'plugins' });
  f.flush();
  assert.equal(f.writes, writes);
});

test('compact settings route to the retained native permission trigger and reject stale Sessions', async t => {
  const f = fixture();
  f.composer.rect.left = 500;
  f.composer.rect.top = 200;
  f.composer.clientLeft = 1;
  f.composer.clientTop = 1;
  const model = createConversationLayoutModel();
  const host = mountConversationLayout(f.anchor, f.ctx, model, {settingsAvailable: true});
  t.after(() => {host.dispose(); model.dispose();});
  await host.actions.setMode('floating');
  f.flush();
  assert.equal(f.composer.getAttribute('data-cgpt-floating-settings'), 'compact');
  assert.equal(f.permissionAnchor.getAttribute('data-cgpt-permission-anchor'), '');
  assert.equal(f.permissionTrigger.getAttribute('tabindex'), '-1');
  const opening = host.actions.openPermissionSettings('a');
  f.flush();
  await opening;
  assert.equal(f.permissionClicks, 1);
  assert.equal(f.composer.style.getPropertyValue('--cgpt-settings-left'), '399px');
  assert.equal(f.composer.style.getPropertyValue('--cgpt-settings-top'), '499px');
  const stale = host.actions.openPermissionSettings('a');
  f.switchSession('b');
  await assert.rejects(stale, /会话/);
  assert.equal(f.permissionClicks, 1);
  model.setMode('floating');
  model.setRect({width: 750});
  f.flush();
  assert.equal(f.composer.getAttribute('data-cgpt-floating-settings'), null);
  assert.equal(f.permissionTrigger.getAttribute('tabindex'), null);
  host.dispose();
  assert.equal(f.permissionAnchor.getAttribute('data-cgpt-permission-anchor'), null);
  assert.equal(f.permissionTrigger.getAttribute('aria-hidden'), null);
});
