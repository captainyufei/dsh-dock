import React from 'react';
import {createPortal} from 'react-dom';
import {createConversationLayoutModel} from './conversation-layout-model.js';
import {FloatingConversationHeader, FloatingConversationResizeHandles} from './conversation-layout-ui.js';
import {installConversationLayoutMenu} from './conversation-layout-menu.js';
import {installFloatingComposerSettings} from './conversation-layout-settings.js';

const h = React.createElement;

/** Move the existing native surfaces through geometry, preserving their React owners. */
export function mountConversationLayout(anchor, ctx, model, options = {}) {
  const document = anchor?.ownerDocument;
  const window = document?.defaultView;
  const frame = anchor?.closest('[data-shell-overlay]')?.parentElement;
  const rightColumn = frame?.querySelector('[data-rightbar-col]');
  const center = rightColumn?.previousElementSibling;
  if (!window || !frame || !center) return null;

  let sidebar;
  try { sidebar = ctx.get?.('sidebarRight'); } catch { return null; }
  if (!sidebar) return null;
  const floatingSeat = document.createElement('div');
  floatingSeat.className = 'cgpt-floating-conversation-seat';
  const resizeSeat = document.createElement('div');
  resizeSeat.className = 'cgpt-floating-conversation-resize-seat';
  const divider = document.createElement('div');
  divider.className = 'cgpt-conversation-divider';
  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-label', '调整聊天与内容宽度');
  divider.setAttribute('aria-orientation', 'vertical');
  divider.tabIndex = 0;
  frame.appendChild(divider);

  const owned = new Map();
  const properties = new Map();
  const stops = [];
  const dockModes = new Map();
  const previewWidths = new Map();
  let disposed = false;
  let scheduled = null;
  let content = null;
  let composer = null;
  let header = null;
  let panel = null;
  let previousSession = null;
  let previousFullscreen = false;
  let pending = null;
  let drag = null;
  let observedComposer = null;
  const settingsAvailable = () => typeof options.settingsAvailable === 'function'
    ? options.settingsAvailable() : Boolean(options.settingsAvailable);

  function attribute(element, name, value = '') {
    if (!element) return;
    if (!owned.has(element)) owned.set(element, new Map());
    const records = owned.get(element);
    if (!records.has(name)) records.set(name, element.getAttribute(name));
    if (value === null) {
      if (element.hasAttribute(name)) element.removeAttribute(name);
    } else if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  }

  function property(element, name, value) {
    if (!properties.has(element)) properties.set(element, new Map());
    const records = properties.get(element);
    if (!records.has(name)) records.set(name, element.style.getPropertyValue(name));
    if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
  }

  function restoreAttribute(element, name) {
    const records = owned.get(element);
    if (records?.has(name)) attribute(element, name, records.get(name));
  }

  function sessionPanel(sessionId) {
    return [...rightColumn.querySelectorAll('[data-sidebar-right-session][data-sidebar-right-panel]')].find(element =>
      element.getAttribute('data-sidebar-right-session') === sessionId && !element.closest('[hidden]'));
  }

  function refresh() {
    if (disposed) return;
    content = center.querySelector('[data-conversation-content]');
    const sessionId = content?.getAttribute('data-conversation-session') || null;
    composer = content?.querySelector('[data-composer-seat]') || null;
    header = center.querySelector('[data-slot="conversation.header"] > header');
    panel = sessionId ? sessionPanel(sessionId) : null;
    const selected = ctx.layout.panelInfo.getSnapshot().activePanelId === null;
    const available = Boolean(selected && sessionId && composer && header);
    const summary = sessionId && ctx.sessions.list.getSnapshot().byId?.[sessionId];
    const contentOpen = Boolean(panel?.hasAttribute('data-sidebar-right-open'));
    const fullscreen = contentOpen && panel.getAttribute('data-sidebar-right-panel') === 'fullscreen';
    model.setContext({sessionId, title: summary?.title || summary?.projectionValues?.title || '未命名会话', available, contentOpen});

    if (available && !pending) {
      if (fullscreen && (!previousFullscreen || previousSession !== sessionId)) {
        const mode = model.getSnapshot().mode;
        if (mode !== 'floating') dockModes.set(sessionId, mode);
        model.setMode('floating');
      } else if (!fullscreen && previousFullscreen && previousSession === sessionId) {
        model.setMode(dockModes.get(sessionId) || 'left');
      }
    }
    previousSession = sessionId;
    previousFullscreen = fullscreen;
    const state = model.getSnapshot();
    const mode = available ? state.mode : 'left';
    attribute(frame, 'data-cgpt-conversation-frame');
    attribute(frame, 'data-cgpt-conversation-mode', mode);
    attribute(center, 'data-cgpt-conversation-center');
    attribute(content, 'data-cgpt-conversation-content');
    attribute(content?.closest('[data-phase]'), 'data-cgpt-conversation-root');
    for (let ancestor = content?.parentElement; ancestor && ancestor !== center; ancestor = ancestor.parentElement) {
      attribute(ancestor, 'data-cgpt-conversation-ancestor');
    }
    attribute(content?.querySelector('[data-conversation-scroll]'), 'data-cgpt-conversation-scroll');
    attribute(composer, 'data-cgpt-conversation-composer');
    if (content && floatingSeat.parentElement !== content) content.prepend(floatingSeat);
    if (content && resizeSeat.parentElement !== content) content.appendChild(resizeSeat);
    if (observedComposer !== composer) {
      if (observedComposer) sizes.unobserve(observedComposer);
      observedComposer = composer;
      if (composer) sizes.observe(composer);
    }

    const bounds = frame.getBoundingClientRect();
    const railWidth = frame.querySelector('[data-slot="sidebar"]')?.parentElement?.getBoundingClientRect().width || 0;
    const leading = frame.hasAttribute('data-sidebar-drawer') ? 0 : railWidth;
    model.setBounds({left: bounds.left + leading, top: bounds.top + 48, width: Math.max(0, bounds.width - leading), height: Math.max(0, bounds.height - 56), floatingHeight: 260});
    const currentState = model.getSnapshot();
    const presentation = model.getSnapshot();
    const rectangle = presentation.displayRect;
    if (content) {
      property(content, '--cgpt-floating-left', rectangle.left + 'px');
      property(content, '--cgpt-floating-top', rectangle.top + 'px');
      property(content, '--cgpt-floating-width', rectangle.width + 'px');
      property(content, '--cgpt-floating-height', rectangle.height + 'px');
      property(content, '--cgpt-floating-expanded-width', presentation.rect.width + 'px');
      property(content, '--cgpt-floating-expanded-height', presentation.rect.height + 'px');
      attribute(content, 'data-cgpt-conversation-minimized', String(presentation.minimized));
      attribute(content, 'data-cgpt-floating-presentation', presentation.floatingPresentation);
      const transcript = content.querySelector('[data-slot="conversation.session"]');
      if (mode === 'floating' && presentation.floatingPresentation !== 'expanded') {
        attribute(transcript, 'inert');
        attribute(transcript, 'aria-hidden', 'true');
      } else {
        restoreAttribute(transcript, 'inert');
        restoreAttribute(transcript, 'aria-hidden');
      }
    }
    if (composer) {
      attribute(composer, 'data-cgpt-floating-statistics', currentState.showStatistics ? 'shown' : 'hidden');
      const modelTrigger = composer.querySelector('[data-slot="conversation.input.model"]')?.querySelector('button');
      const permissionTrigger = composer.querySelector('[data-slot="conversation.input.permission"]')?.querySelector('button');
      const compactSettings = Boolean(settingsAvailable() && mode === 'floating' && !currentState.minimized
        && currentState.rect.width <= 640 && modelTrigger && permissionTrigger);
      attribute(composer, 'data-cgpt-floating-settings', compactSettings ? 'compact' : null);
      const permissionAnchor = permissionTrigger?.parentElement;
      attribute(permissionAnchor, 'data-cgpt-permission-anchor', compactSettings ? '' : null);
      if (compactSettings) {
        const settingsBounds = modelTrigger.getBoundingClientRect();
        // The composer's inline-size container establishes the containing
        // block for fixed descendants. Its retained anchor uses local offsets.
        const composerBounds = composer.getBoundingClientRect();
        property(composer, '--cgpt-settings-left', (settingsBounds.left - composerBounds.left - (composer.clientLeft || 0)) + 'px');
        property(composer, '--cgpt-settings-top', (settingsBounds.top - composerBounds.top - (composer.clientTop || 0)) + 'px');
        attribute(permissionTrigger, 'tabindex', '-1');
        attribute(permissionTrigger, 'aria-hidden', 'true');
        attribute(modelTrigger, 'aria-description', '模型、推理与访问权限设置');
      } else {
        restoreAttribute(permissionTrigger, 'tabindex');
        restoreAttribute(permissionTrigger, 'aria-hidden');
        restoreAttribute(modelTrigger, 'aria-description');
      }
    }
    if (mode === 'floating' && !presentation.minimized && composer) {
      const composerHeight = composer.getBoundingClientRect().height;
      property(content, '--cgpt-floating-composer-height', composerHeight + 'px');
      model.setComposerHeight(composerHeight);
    }

    const swapped = available && mode === 'right' && !fullscreen && panel?.hasAttribute('data-sidebar-right-open') && bounds.width - leading >= 700;
    attribute(frame, 'data-cgpt-conversation-swapped', swapped ? '' : null);
    if (swapped) {
      const normal = frame.style.getPropertyValue('--cgpt-rail-columns') || frame.style.gridTemplateColumns;
      const tracks = normal.match(/^(\d+(?:\.\d+)?)px\s+(minmax\([^)]*\))\s+(minmax\([^)]*\))$/);
      if (tracks) {
        const savedWidth = previewWidths.get(sessionId);
        const previewTrack = savedWidth === undefined ? tracks[3] : 'minmax(0px, ' + Math.max(300, Math.min(savedWidth, bounds.width - leading - 400)) + 'px)';
        property(frame, '--cgpt-conversation-columns', tracks[1] + 'px ' + previewTrack + ' ' + tracks[2]);
      }
      const rightBounds = rightColumn.getBoundingClientRect();
      property(divider, 'left', rightBounds.right - bounds.left - 4 + 'px');
      divider.hidden = false;
    } else divider.hidden = true;
  }

  function schedule() {
    if (disposed || scheduled !== null) return;
    scheduled = window.requestAnimationFrame(() => { scheduled = null; refresh(); });
  }

  function activateComposer(event) {
    const current = model.getSnapshot();
    if (current.mode !== 'floating' || current.minimized || current.floatingPresentation !== 'idle'
      || event.target?.closest?.('[data-cgpt-conversation-composer]') !== composer) return;
    model.setFloatingPresentation('focused');
  }

  function dismissComposer(event) {
    const current = model.getSnapshot();
    if (current.mode !== 'floating' || current.minimized || current.floatingPresentation !== 'focused'
      || content?.contains(event.target)) return;
    if (event.target?.closest?.('[role="menu"], [role="listbox"], [role="dialog"]')) return;
    model.setFloatingPresentation('idle');
  }

  function stopHiddenTranscriptWheel(event) {
    const current = model.getSnapshot();
    if (current.mode !== 'floating' || current.minimized || current.floatingPresentation === 'expanded') return;
    if (!composer?.contains(event.target) || !event.deltaY) return;
    const draft = event.target?.closest?.('[data-input-scroll]');
    const canScrollDraft = draft && (event.deltaY < 0 ? draft.scrollTop > 0
      : draft.scrollTop + draft.clientHeight < draft.scrollHeight - 1);
    if (canScrollDraft) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function target(sessionId) {
    if (disposed || ctx.layout.panelInfo.getSnapshot().activePanelId !== null || model.getSnapshot().sessionId !== sessionId || !model.getSnapshot().available) throw new Error('会话已切换，请在当前会话重新选择布局。');
    const value = sidebar.commandTarget(null);
    if (value?.sessionId !== sessionId) throw new Error('会话面板尚未准备好，请重试。');
    return value;
  }

  async function waitForPanel(sessionId, condition) {
    const deadline = Date.now() + 5000;
    while (!disposed && Date.now() < deadline) {
      target(sessionId);
      const current = sessionPanel(sessionId);
      if (current && condition(current)) return current;
      await new Promise(resolve => window.setTimeout(resolve, 30));
    }
    throw new Error('面板切换尚未完成，请重试。');
  }

  const actions = {
    async openPermissionSettings(sessionId) {
      // The model menu dismisses first. Keep the original permission owner alive
      // so its portal menu, risk confirmation and selection rules remain native.
      await new Promise(resolve => window.setTimeout(resolve, 0));
      target(sessionId);
      refresh();
      const current = model.getSnapshot();
      if (current.mode !== 'floating' || current.minimized || current.rect.width > 640
        || !settingsAvailable()) throw new Error('输入框布局已变化，请重新打开设置。');
      const trigger = composer?.querySelector('[data-slot="conversation.input.permission"]')?.querySelector('button');
      if (!trigger || trigger.disabled || typeof trigger.click !== 'function') throw new Error('访问权限设置暂不可用，请稍后重试。');
      trigger.click();
    },
    async setMode(mode, options = {}) {
      if (!['left', 'right', 'floating'].includes(mode)) return;
      if (pending) throw new Error('正在切换布局，请稍候。');
      const {sessionId, available} = model.getSnapshot();
      if (!available) throw new Error('请先打开一个会话。');
      pending = mode;
      try {
        target(sessionId);
        if (options.sessionId && options.sessionId !== sessionId) throw new Error('会话已切换，请重新打开会话菜单。');
        if (options.requireContentOpen && !sessionPanel(sessionId)?.hasAttribute('data-sidebar-right-open')) throw new Error('内容面板已收起，请展开后再移动会话。');
        if (!sidebar.isExpanded()) sidebar.toggleExpanded();
        let current = await waitForPanel(sessionId, element => element.hasAttribute('data-sidebar-right-open'));
        // Narrow native panels always present fullscreen. Returning to Chat
        // closes that overlay instead of waiting for an unavailable split.
        if (mode !== 'floating' && frame.getBoundingClientRect().width < 768) {
          sidebar.toggleExpanded();
          await waitForPanel(sessionId, element => !element.hasAttribute('data-sidebar-right-open'));
          model.setMode(mode);
          dockModes.set(sessionId, mode);
          previousFullscreen = false;
          return;
        }
        const fullscreen = current.getAttribute('data-sidebar-right-panel') === 'fullscreen';
        if ((mode === 'floating') !== fullscreen) {
          sidebar.toggleFullscreen(target(sessionId));
          current = await waitForPanel(sessionId, element => (element.getAttribute('data-sidebar-right-panel') === 'fullscreen') === (mode === 'floating'));
        }
        target(sessionId);
        if (mode !== 'floating') dockModes.set(sessionId, mode);
        model.setMode(mode);
        previousFullscreen = current.getAttribute('data-sidebar-right-panel') === 'fullscreen';
      } finally { pending = null; schedule(); }
    },
    async showConversation() {
      if (pending) throw new Error('正在切换布局，请稍候。');
      const {sessionId} = model.getSnapshot();
      target(sessionId);
      pending = 'left';
      try {
        if (sidebar.isExpanded()) sidebar.toggleExpanded();
        model.setMode('left');
        dockModes.set(sessionId, 'left');
        previousFullscreen = false;
      } finally { pending = null; schedule(); }
    },
  };

  function resize(width) {
    previewWidths.set(model.getSnapshot().sessionId, width);
    schedule();
  }
  function endDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    divider.removeAttribute('data-dragging');
    if (divider.hasPointerCapture(event.pointerId)) divider.releasePointerCapture(event.pointerId);
  }
  divider.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    drag = {pointerId: event.pointerId, x: event.clientX, width: rightColumn.getBoundingClientRect().width};
    divider.setPointerCapture(event.pointerId);
    divider.setAttribute('data-dragging', '');
  });
  divider.addEventListener('pointermove', event => {
    if (drag?.pointerId === event.pointerId) resize(drag.width + event.clientX - drag.x);
  });
  divider.addEventListener('pointerup', endDrag);
  divider.addEventListener('pointercancel', endDrag);
  divider.addEventListener('lostpointercapture', endDrag);
  divider.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    resize(rightColumn.getBoundingClientRect().width + (event.key === 'ArrowRight' ? 24 : -24));
  });

  const observer = new window.MutationObserver(schedule);
  observer.observe(frame, {subtree: true, childList: true, attributes: true, attributeFilter: ['data-conversation-session', 'data-sidebar-right-open', 'data-sidebar-right-panel', 'data-sidebar-right-session', 'hidden', 'style', 'data-sidebar-collapsed', 'data-sidebar-drawer']});
  const sizes = new window.ResizeObserver(schedule);
  sizes.observe(frame);
  frame.addEventListener('focusin', activateComposer);
  frame.addEventListener('pointerdown', activateComposer);
  frame.addEventListener('input', schedule);
  frame.addEventListener('wheel', stopHiddenTranscriptWheel, {capture: true, passive: false});
  document.addEventListener('pointerdown', dismissComposer, true);
  stops.push(() => {
    frame.removeEventListener('focusin', activateComposer);
    frame.removeEventListener('pointerdown', activateComposer);
    frame.removeEventListener('input', schedule);
    frame.removeEventListener('wheel', stopHiddenTranscriptWheel, true);
    document.removeEventListener('pointerdown', dismissComposer, true);
  });
  stops.push(model.subscribe(schedule), ctx.sessions.list.subscribe(schedule), ctx.layout.panelInfo.subscribe(schedule));
  if (typeof options.subscribeSettings === 'function') stops.push(options.subscribeSettings(schedule));
  refresh();
  return {
    floatingSeat, resizeSeat, actions,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (scheduled !== null) window.cancelAnimationFrame(scheduled);
      observer.disconnect(); sizes.disconnect();
      for (const stop of stops) stop();
      floatingSeat.remove(); resizeSeat.remove(); divider.remove();
      for (const [element, records] of owned) for (const [name, value] of records) {
        if (value === null) element.removeAttribute(name); else element.setAttribute(name, value);
      }
      for (const [element, records] of properties) for (const [name, value] of records) {
        if (value) element.style.setProperty(name, value); else element.style.removeProperty(name);
      }
    },
  };
}

export function GlobalConversationLayout({ctx, Menu, MenuItem}) {
  const anchor = React.useRef(null);
  const model = React.useMemo(() => createConversationLayoutModel(), []);
  const [host, setHost] = React.useState(null);
  React.useLayoutEffect(() => {
    let mounted;
    const settings = installFloatingComposerSettings(ctx, {
      model, onOpenPermission: sessionId => mounted?.actions.openPermissionSettings(sessionId),
    });
    mounted = mountConversationLayout(anchor.current, ctx, model, {
      settingsAvailable: () => settings?.available === true,
      subscribeSettings: settings?.subscribe,
    });
    setHost(mounted);
    return () => { settings?.dispose(); mounted?.dispose(); model.dispose(); };
  }, [ctx, model]);
  React.useEffect(() => {
    if (!host) return undefined;
    return installConversationLayoutMenu(ctx, {model, actions: host.actions});
  }, [ctx, model, host]);
  return h(React.Fragment, null,
    h('span', {ref: anchor, hidden: true}),
    host && createPortal(h(FloatingConversationHeader, {model, actions: host.actions, Menu, MenuItem}), host.floatingSeat),
    host && createPortal(h(FloatingConversationResizeHandles, {model}), host.resizeSeat),
  );
}
