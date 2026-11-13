import React from 'react';

const h = React.createElement;
const stopPropagation = event => event.stopPropagation();

const iconPaths = {
  left: 'M3 3h14v14H3zM8 3v14M12 7l-3 3 3 3',
  right: 'M3 3h14v14H3zM12 3v14M8 7l3 3-3 3',
  floating: 'M3 4h14v12H3zM6 10h8v4H6z',
  full: 'M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4',
  minimize: 'M4 10h12',
  menu: 'M7 4h.01M13 4h.01M7 10h.01M13 10h.01M7 16h.01M13 16h.01',
  conversation: 'M17 9a6 6 0 0 1-6 6H7l-4 2 1-4a6 6 0 1 1 13-4Z',
};

function LayoutIcon({kind, size = 16}) {
  return h('svg', {
    width: size,
    height: size,
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: kind === 'menu' ? 2.4 : 1.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }, h('path', {d: iconPaths[kind] || iconPaths.menu}));
}

/** Keep asynchronous results with the Session that initiated the action. */
function useLayoutActionState(model, sessionId) {
  const [pending, setPending] = React.useState(null);
  const [error, setError] = React.useState(null);
  const alive = React.useRef(false);
  const operation = React.useRef(null);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operation.current = null;
    };
  }, [model]);

  React.useEffect(() => {
    setError(null);
  }, [model, sessionId]);

  function reportError(reason) {
    if (!alive.current || model.getSnapshot().sessionId !== sessionId) return;
    setError({sessionId, text: reason?.message || '暂时无法调整会话布局，请重试。'});
  }

  async function run(action) {
    if (operation.current || !model.getSnapshot().available) return;
    const ticket = {sessionId};
    operation.current = ticket;
    setPending(ticket);
    setError(null);
    try {
      await action();
    } catch (reason) {
      if (operation.current === ticket && reason?.code !== 'cancelled') reportError(reason);
    } finally {
      if (alive.current && operation.current === ticket) {
        operation.current = null;
        setPending(null);
      }
    }
  }

  return {
    busy: Boolean(pending && pending.sessionId === sessionId),
    error: error?.sessionId === sessionId ? error.text : null,
    dismissError: () => setError(null),
    reportError,
    run,
  };
}

function LayoutNotice({error, dismissError}) {
  if (!error) return null;
  return h('div', {className: 'cgpt-conversation-layout-notice', role: 'alert'},
    h('span', null, error),
    h('button', {type: 'button', 'aria-label': '关闭布局提示', onClick: dismissError}, '×'),
  );
}

function watchGestureViewport(element, cancel) {
  const viewport = element.ownerDocument?.defaultView;
  const visualViewport = viewport?.visualViewport;
  viewport?.addEventListener('resize', cancel);
  viewport?.addEventListener('blur', cancel);
  visualViewport?.addEventListener('resize', cancel);
  return () => {
    viewport?.removeEventListener('resize', cancel);
    viewport?.removeEventListener('blur', cancel);
    visualViewport?.removeEventListener('resize', cancel);
  };
}

function LayoutMenu({model, snapshot, actions, state, Menu, MenuItem}) {
  const button = React.useRef(null);
  const [open, setOpen] = React.useState(false);
  const disabled = !snapshot.available || state.busy;
  const close = React.useCallback(() => setOpen(false), []);

  React.useEffect(close, [close, model, snapshot.sessionId, snapshot.mode, snapshot.available]);

  React.useEffect(() => {
    if (!open) return undefined;
    const trigger = button.current;
    const ownerDocument = trigger?.ownerDocument;
    if (!ownerDocument) return undefined;

    function dismissOutside(event) {
      const path = event.composedPath?.() ?? [event.target];
      const inside = path.some(node => node === trigger
        || (node?.nodeType && trigger.contains?.(node))
        || node?.classList?.contains('cgpt-conversation-layout-menu-list'));
      if (!inside) close();
    }

    // Title dragging stops bubbling before the native Menu's outside listener.
    ownerDocument.addEventListener('pointerdown', dismissOutside, true);
    return () => ownerDocument.removeEventListener('pointerdown', dismissOutside, true);
  }, [open, close]);

  function toggle(event) {
    event.stopPropagation();
    if (disabled) return;
    setOpen(value => !value);
  }

  function selectMode(mode) {
    close();
    void state.run(() => actions.setMode(mode));
  }

  function showConversation() {
    close();
    void state.run(() => actions.showConversation());
  }

  function toggleStatistics() {
    const sessionId = snapshot.sessionId;
    close();
    void state.run(() => {
      const current = model.getSnapshot();
      if (current.sessionId !== sessionId || current.mode !== 'floating' || current.minimized) return;
      return model.setShowStatistics(!current.showStatistics);
    });
  }

  const anchor = h('button', {
    ref: button,
    type: 'button',
    className: 'cgpt-conversation-layout-button',
    'aria-label': '会话布局',
    title: '会话布局',
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-busy': state.busy,
    disabled,
    onClick: toggle,
    onPointerDown: stopPropagation,
  }, h(LayoutIcon, {kind: 'menu'}));

  return h(Menu, {
    open,
    anchor,
    anchorRef: button,
    portal: true,
    autoFocus: true,
    align: 'end',
    className: 'cgpt-conversation-layout-menu',
    listClassName: 'cgpt-conversation-layout-menu-list',
    onClose: close,
  },
  h(MenuItem, {
    icon: h(LayoutIcon, {kind: 'left'}),
    selected: snapshot.mode === 'left',
    disabled,
    onSelect: () => selectMode('left'),
  }, '移至左侧窗格'),
  h(MenuItem, {
    icon: h(LayoutIcon, {kind: 'right'}),
    selected: snapshot.mode === 'right',
    disabled,
    onSelect: () => selectMode('right'),
  }, '移至右侧窗格'),
  h(MenuItem, {
    icon: h(LayoutIcon, {kind: 'floating'}),
    selected: snapshot.mode === 'floating',
    disabled,
    onSelect: () => selectMode('floating'),
  }, '悬浮输入框'),
  h(MenuItem, {
    icon: h(LayoutIcon, {kind: 'full'}),
    disabled,
    onSelect: showConversation,
  }, '会话完整视图'),
  h(MenuItem, {
    separatorBefore: true,
    selected: Boolean(snapshot.showStatistics),
    'aria-label': '显示会话用量，' + (snapshot.showStatistics ? '已开启' : '已关闭'),
    disabled,
    onSelect: toggleStatistics,
  }, '显示会话用量'),
  );
}

/** The Host retains its conversation and editor; this header controls their presentation. */
export function FloatingConversationHeader({model, actions, Menu, MenuItem}) {
  const snapshot = React.useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  const state = useLayoutActionState(model, snapshot.sessionId);
  const drag = React.useRef(null);
  const draggedTitle = React.useRef(false);
  const header = React.useRef(null);
  const restoreButton = React.useRef(null);
  const previousPresentation = React.useRef({sessionId: snapshot.sessionId, minimized: snapshot.minimized});

  React.useLayoutEffect(() => {
    const previous = previousPresentation.current;
    previousPresentation.current = {sessionId: snapshot.sessionId, minimized: snapshot.minimized};
    if (!snapshot.available || snapshot.mode !== 'floating' || previous.sessionId !== snapshot.sessionId
      || previous.minimized === snapshot.minimized) return undefined;
    const control = snapshot.minimized ? restoreButton.current : header.current;
    const content = control?.closest?.('[data-cgpt-conversation-content]');
    const viewport = content?.ownerDocument?.defaultView;
    const restoreFocus = () => {
      const current = model.getSnapshot();
      if (!current.available || current.sessionId !== snapshot.sessionId
        || current.minimized !== snapshot.minimized || current.mode !== 'floating') return;
      const target = current.minimized ? restoreButton.current : content?.querySelector('[contenteditable="true"]');
      target?.focus({preventScroll: true});
    };
    if (!viewport?.requestAnimationFrame) {
      restoreFocus();
      return undefined;
    }
    const frame = viewport.requestAnimationFrame(restoreFocus);
    return () => viewport.cancelAnimationFrame(frame);
  }, [model, snapshot.sessionId, snapshot.mode, snapshot.available, snapshot.minimized]);

  function finishDrag() {
    const previous = drag.current;
    drag.current = null;
    if (!previous) return;
    previous.stopViewport();
    previous.stopPointer();
    previous.element.removeAttribute('data-dragging');
    if (previous.active && previous.content?.getAttribute('data-cgpt-floating-dragging') === '') {
      if (previous.previousDragging === null) previous.content.removeAttribute('data-cgpt-floating-dragging');
      else previous.content.setAttribute('data-cgpt-floating-dragging', previous.previousDragging);
    }
    if (previous.element.hasPointerCapture?.(previous.pointerId)) {
      previous.element.releasePointerCapture(previous.pointerId);
    }
  }

  React.useEffect(() => {
    return finishDrag;
  }, [model, snapshot.sessionId, snapshot.mode, snapshot.available, snapshot.minimized]);

  function startDrag(event) {
    if (event.button !== 0 || event.isPrimary === false || !snapshot.available || state.busy) return;
    const current = model.getSnapshot();
    if (current.mode !== 'floating' || current.minimized || current.sessionId !== snapshot.sessionId) return;
    const element = event.currentTarget;
    const content = element.closest?.('[data-cgpt-conversation-content]');
    const viewport = element.ownerDocument?.defaultView;
    finishDrag();
    draggedTitle.current = false;
    drag.current = {
      element,
      content,
      previousDragging: content?.getAttribute('data-cgpt-floating-dragging') ?? null,
      active: false,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      rect: {...current.displayRect},
      sessionId: current.sessionId,
      stopViewport: watchGestureViewport(element, settleDrag),
      stopPointer: () => {
        viewport?.removeEventListener('pointermove', moveDrag, true);
        viewport?.removeEventListener('pointerup', endDrag, true);
        viewport?.removeEventListener('pointercancel', cancelDrag, true);
      },
    };
    // Native views can take pointer capture; retain the gesture through its release.
    viewport?.addEventListener('pointermove', moveDrag, true);
    viewport?.addEventListener('pointerup', endDrag, true);
    viewport?.addEventListener('pointercancel', cancelDrag, true);
    element.focus({preventScroll: true});
    event.stopPropagation();
  }

  function moveDrag(event) {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const latest = model.getSnapshot();
    if (!latest.available || latest.mode !== 'floating' || latest.minimized || latest.sessionId !== current.sessionId) {
      finishDrag();
      return;
    }
    if (!current.active && event.type !== 'pointerup' && event.buttons === 0) return;
    const deltaX = event.clientX - current.x;
    const deltaY = event.clientY - current.y;
    if (!current.active && Math.hypot(deltaX, deltaY) < 4) return;
    if (!current.active) {
      // Preserve native click targeting until this becomes an actual drag.
      if (event.type !== 'pointerup') {
        try {
          current.element.setPointerCapture(event.pointerId);
        } catch (reason) {
          finishDrag();
          state.reportError(reason);
          return;
        }
      }
      current.active = true;
      draggedTitle.current = true;
      current.element.setAttribute('data-dragging', '');
      current.content?.setAttribute('data-cgpt-floating-dragging', '');
    }
    event.preventDefault();
    event.stopPropagation();
    try {
      model.setDisplayRect({
        ...current.rect,
        left: current.rect.left + deltaX,
        top: current.rect.top + deltaY,
      });
    } catch (reason) {
      finishDrag();
      state.reportError(reason);
    }
  }

  function endDrag(event) {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) moveDrag(event);
    if (drag.current === current) settleDrag();
  }

  function settleDrag() {
    const current = drag.current;
    if (!current) return;
    const latest = model.getSnapshot();
    const shouldSnap = current.active && latest.available && latest.mode === 'floating'
      && !latest.minimized && latest.sessionId === current.sessionId;
    finishDrag();
    if (!shouldSnap) return;
    try { model.snapAfterDrag(); }
    catch (reason) { state.reportError(reason); }
  }

  function cancelDrag(event) {
    if (event.pointerId === drag.current?.pointerId) settleDrag();
  }

  function loseDragCapture(event) {
    if (event.pointerId === drag.current?.pointerId && !drag.current.active) finishDrag();
  }

  function moveWithKeyboard(event) {
    const directions = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};
    const direction = directions[event.key];
    if (!direction || event.altKey || event.ctrlKey || event.metaKey || !snapshot.available) return;
    const current = model.getSnapshot();
    if (current.mode !== 'floating' || current.sessionId !== snapshot.sessionId) return;
    event.preventDefault();
    event.stopPropagation();
    finishDrag();
    const step = event.shiftKey ? 40 : 10;
    try {
      model.setDisplayRect({
        ...current.displayRect,
        left: current.displayRect.left + direction[0] * step,
        top: current.displayRect.top + direction[1] * step,
      });
    } catch (reason) {
      state.reportError(reason);
    }
  }

  function toggleTranscript(event) {
    event.preventDefault();
    event.stopPropagation();
    finishDrag();
    const current = model.getSnapshot();
    if (state.busy || current.sessionId !== snapshot.sessionId || current.minimized) return;
    model.setFloatingPresentation(current.floatingPresentation === 'expanded' ? 'focused' : 'expanded');
  }

  function titleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') toggleTranscript(event);
    else moveWithKeyboard(event);
  }

  function headerClick(event) {
    event.stopPropagation();
    if (draggedTitle.current || event.target?.closest?.('button, [role="menuitem"]')) return;
    toggleTranscript(event);
  }

  if (!snapshot.available || snapshot.mode !== 'floating') return null;

  if (snapshot.minimized) {
    return h('button', {
      ref: restoreButton,
      type: 'button',
      className: 'cgpt-floating-conversation-restore',
      'aria-label': '恢复悬浮输入框',
      title: '恢复悬浮输入框',
      disabled: state.busy,
      onClick: () => void state.run(() => model.setMinimized(false)),
      onPointerDown: stopPropagation,
      onContextMenu: stopPropagation,
    }, h(LayoutIcon, {kind: 'conversation', size: 24}));
  }

  const minimizeLabel = '最小化输入框';
  return h('div', {
    ref: header,
    className: 'cgpt-floating-conversation-header',
    onPointerDown: () => { draggedTitle.current = false; },
    onClick: headerClick,
    onDoubleClick: stopPropagation,
    onContextMenu: stopPropagation,
  },
  h('button', {
    type: 'button',
    className: 'cgpt-conversation-layout-button',
    title: minimizeLabel,
    'aria-label': minimizeLabel,
    disabled: !snapshot.available || state.busy,
    onClick: () => void state.run(() => model.setMinimized(!model.getSnapshot().minimized)),
    onPointerDown: stopPropagation,
  }, h(LayoutIcon, {kind: 'minimize'})),
  h('div', {
    className: 'cgpt-floating-conversation-drag-handle',
    role: 'group',
    tabIndex: snapshot.available ? 0 : -1,
    'aria-label': '移动悬浮输入框，可使用方向键，按住 Shift 加速',
    'aria-keyshortcuts': 'ArrowLeft ArrowRight ArrowUp ArrowDown Shift+ArrowLeft Shift+ArrowRight Shift+ArrowUp Shift+ArrowDown',
    'aria-expanded': snapshot.floatingPresentation === 'expanded',
    title: snapshot.floatingPresentation === 'expanded' ? '单击收起历史消息' : '单击展开历史消息',
    onPointerDown: startDrag,
    onPointerMove: moveDrag,
    onPointerUp: endDrag,
    onPointerCancel: cancelDrag,
    onLostPointerCapture: loseDragCapture,
    onKeyDown: titleKeyDown,
  },
  h(LayoutIcon, {kind: 'conversation'}),
  h('span', {className: 'cgpt-floating-conversation-title', title: snapshot.title || '当前会话'}, snapshot.title || '当前会话'),
  ),
  h(LayoutMenu, {model, snapshot, actions, state, Menu, MenuItem}),
  h(LayoutNotice, state),
  );
}

/** Resize only the floating card's geometry, leaving its native editor mounted. */
export function FloatingConversationResizeHandles({model}) {
  const snapshot = React.useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  const resizing = React.useRef(null);

  function finishResize() {
    const previous = resizing.current;
    resizing.current = null;
    if (!previous) return;
    previous.stopViewport();
    previous.element.removeAttribute('data-resizing');
    if (previous.element.hasPointerCapture?.(previous.pointerId)) {
      previous.element.releasePointerCapture(previous.pointerId);
    }
  }

  React.useEffect(() => finishResize, [model, snapshot.sessionId, snapshot.mode, snapshot.available, snapshot.minimized]);

  function startResize(edge, event) {
    if (event.button !== 0 || event.isPrimary === false) return;
    const current = model.getSnapshot();
    if (!current.available || current.mode !== 'floating' || current.minimized || current.sessionId !== snapshot.sessionId) return;
    finishResize();
    const element = event.currentTarget;
    resizing.current = {
      edge,
      element,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      rect: {...current.displayRect},
      sessionId: current.sessionId,
      stopViewport: watchGestureViewport(element, finishResize),
    };
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      finishResize();
      return;
    }
    element.setAttribute('data-resizing', '');
    element.focus({preventScroll: true});
    event.preventDefault();
    event.stopPropagation();
  }

  function moveResize(event) {
    const current = resizing.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const latest = model.getSnapshot();
    if (!latest.available || latest.mode !== 'floating' || latest.minimized || latest.sessionId !== current.sessionId) {
      finishResize();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const vertical = current.edge === 'top' || current.edge === 'bottom';
    const delta = vertical ? event.clientY - current.y : event.clientX - current.x;
    model.resizeFromEdge(current.edge, delta, current.rect);
  }

  function endResize(event) {
    if (event.pointerId !== resizing.current?.pointerId) return;
    const vertical = resizing.current.edge === 'top' || resizing.current.edge === 'bottom';
    if (Number.isFinite(vertical ? event.clientY : event.clientX)) moveResize(event);
    finishResize();
  }

  function cancelResize(event) {
    if (event.pointerId === resizing.current?.pointerId) finishResize();
  }

  function resizeWithKeyboard(edge, event) {
    const vertical = edge === 'top' || edge === 'bottom';
    const decreaseKey = vertical ? 'ArrowUp' : 'ArrowLeft';
    const increaseKey = vertical ? 'ArrowDown' : 'ArrowRight';
    if (![decreaseKey, increaseKey].includes(event.key)
      || event.altKey || event.ctrlKey || event.metaKey) return;
    const current = model.getSnapshot();
    if (!current.available || current.mode !== 'floating' || current.minimized || current.sessionId !== snapshot.sessionId) return;
    event.preventDefault();
    event.stopPropagation();
    finishResize();
    const step = event.shiftKey ? 40 : 10;
    model.resizeFromEdge(edge, event.key === decreaseKey ? -step : step, current.displayRect);
  }

  if (!snapshot.available || snapshot.mode !== 'floating' || snapshot.minimized) return null;
  return h(React.Fragment, null, ['left', 'right', 'top', 'bottom'].map(edge => {
    const vertical = edge === 'top' || edge === 'bottom';
    const axis = vertical ? 'height' : 'width';
    const limits = model.getResizeLimits(axis);
    const label = {left: '左', right: '右', top: '上', bottom: '下'}[edge];
    return h('div', {
    key: edge,
    className: 'cgpt-floating-conversation-resize-handle',
    'data-edge': edge,
    role: 'separator',
    tabIndex: 0,
    'aria-label': '调整悬浮输入框' + label + '边缘' + (vertical ? '高度' : '宽度'),
    'aria-orientation': vertical ? 'horizontal' : 'vertical',
    'aria-valuemin': Math.min(limits.min, snapshot.displayRect[axis]),
    'aria-valuemax': limits.max,
    'aria-valuenow': snapshot.displayRect[axis],
    'aria-valuetext': Math.round(snapshot.displayRect[axis]) + ' 像素',
    'aria-keyshortcuts': vertical
      ? 'ArrowUp ArrowDown Shift+ArrowUp Shift+ArrowDown'
      : 'ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight',
    onPointerDown: event => startResize(edge, event),
    onPointerMove: moveResize,
    onPointerUp: endResize,
    onPointerCancel: cancelResize,
    onLostPointerCapture: cancelResize,
    onKeyDown: event => resizeWithKeyboard(edge, event),
    onClick: stopPropagation,
    });
  }));
}
