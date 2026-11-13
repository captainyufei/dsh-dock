const MODES = new Set(['left', 'right', 'floating']);
const FLOATING_PRESENTATIONS = new Set(['idle', 'focused', 'expanded']);
const STATISTICS_KEY = 'dsh-dock.floating.showStatistics';
const finite = value => typeof value === 'number' && Number.isFinite(value);
const sameRect = (left, right) => left.left === right.left
  && left.top === right.top && left.width === right.width && left.height === right.height;
const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

/** Window-local preferences for the one visible composer of each Session. */
export function createConversationLayoutModel(options = {}) {
  let storage = options.storage;
  let eventTarget = options.eventTarget;
  if (!Object.hasOwn(options, 'storage')) {
    try { storage = globalThis.localStorage; } catch {}
  }
  if (!Object.hasOwn(options, 'eventTarget')) {
    try { eventTarget = globalThis.window; } catch {}
  }
  const sessions = new Map();
  const listeners = new Set();
  let bounds = { left: 0, top: 0, width: 1280, height: 800, floatingHeight: 260 };
  let context = { sessionId: null, title: '', available: false, contentOpen: false };
  let disposed = false;
  let storageListening = false;
  let statisticsDirty = false;
  let showStatistics = false;
  try { showStatistics = readStatistics(); } catch {}

  function readStatistics() {
    const raw = storage?.getItem?.(STATISTICS_KEY) ?? null;
    if (raw === null) return false;
    try { return JSON.parse(raw) === true; } catch { return false; }
  }

  function syncStatistics() {
    try {
      const next = readStatistics();
      statisticsDirty = false;
      if (next === showStatistics) return;
      showStatistics = next;
      publish();
    } catch {}
  }

  function onStorage(event) {
    if (disposed || event.key !== STATISTICS_KEY && event.key !== null) return;
    if (event.storageArea != null && event.storageArea !== storage) return;
    syncStatistics();
  }

  function detachStorage() {
    if (!storageListening) return;
    eventTarget.removeEventListener('storage', onStorage);
    storageListening = false;
  }

  function geometry() {
    // Very small viewports need the whole track to keep the card reachable.
    const horizontalMargin = bounds.width >= 64 ? 16 : 0;
    const verticalMargin = bounds.height >= 64 ? 16 : 0;
    const maximumWidth = Math.max(0, bounds.width - horizontalMargin * 2);
    const maximumHeight = Math.max(0, bounds.height - verticalMargin * 2);
    return {
      left: bounds.left + horizontalMargin,
      top: bounds.top + verticalMargin,
      right: bounds.left + bounds.width - horizontalMargin,
      bottom: bounds.top + bounds.height - verticalMargin,
      maximumWidth,
      maximumHeight,
    };
  }

  function minimumExpandedHeight(preference) {
    return Math.min((preference?.composerHeight || 48) + 42, geometry().maximumHeight);
  }

  function constrain(rect, preference = currentPreference()) {
    const area = geometry();
    const minimumWidth = Math.min(320, area.maximumWidth);
    const width = clamp(rect.width, minimumWidth, area.maximumWidth);
    const minimumHeight = minimumExpandedHeight(preference);
    const height = clamp(rect.height, minimumHeight, area.maximumHeight);
    return {
      left: clamp(rect.left, area.left, area.right - width),
      top: clamp(rect.top, area.top, area.bottom - height),
      width,
      height,
    };
  }

  function bottomCentered(rect, preference = currentPreference()) {
    const area = geometry();
    const constrained = constrain(rect, preference);
    return {
      ...constrained,
      left: area.left + (area.maximumWidth - constrained.width) / 2,
      top: area.bottom - constrained.height,
    };
  }

  function anchoredRect(rect, snap, preference = currentPreference()) {
    if (snap === 'bottom') return bottomCentered(rect, preference);
    const constrained = constrain(rect, preference);
    const area = geometry();
    if (snap?.endsWith('left')) constrained.left = area.left;
    if (snap?.endsWith('right')) constrained.left = area.right - constrained.width;
    if (snap?.startsWith('top-')) constrained.top = area.top;
    if (snap?.startsWith('bottom-')) constrained.top = area.bottom - constrained.height;
    return constrained;
  }

  function defaultRect() {
    const area = geometry();
    return bottomCentered({
      left: area.left,
      top: area.top,
      width: defaultWidth(area.maximumWidth),
      height: bounds.floatingHeight,
    }, null);
  }

  function defaultWidth(maximumWidth) {
    return Math.min(maximumWidth, clamp(Math.round(maximumWidth * 0.6), 560, 1040));
  }

  function bubbleRect() {
    const area = geometry();
    const width = Math.min(48, area.maximumWidth);
    const height = Math.min(48, area.maximumHeight);
    return {left: area.right - width, top: area.bottom - height, width, height};
  }

  function createPreference() {
    return {
      mode: 'left', minimized: false, rect: defaultRect(), snap: 'bottom',
      floatingPresentation: 'idle', composerHeight: 48, displayTop: null, manualWidth: null,
    };
  }

  function currentPreference() {
    return sessions.get(context.sessionId);
  }

  function constrainDisplayRect(rect) {
    const area = geometry();
    const width = clamp(rect.width, Math.min(320, area.maximumWidth), area.maximumWidth);
    const height = clamp(rect.height, 0, area.maximumHeight);
    return {
      left: clamp(rect.left, area.left, area.right - width),
      top: clamp(rect.top, area.top, area.bottom - height),
      width,
      height,
    };
  }

  function displayRectangle(preference) {
    if (!preference) return defaultRect();
    if (preference.floatingPresentation === 'expanded') return {...preference.rect};
    const height = preference.composerHeight + (preference.floatingPresentation === 'focused' ? 42 : 2);
    const top = preference.displayTop ?? (preference.snap?.startsWith('top-')
      ? preference.rect.top : preference.rect.top + preference.rect.height - height);
    return constrainDisplayRect({...preference.rect, top, height});
  }

  function createSnapshot() {
    const preference = currentPreference();
    const available = Boolean(context.sessionId && context.available);
    const minimized = available && preference.minimized;
    return Object.freeze({
      ...context,
      available,
      showStatistics,
      mode: available ? preference.mode : 'left',
      minimized,
      floatingPresentation: available ? preference.floatingPresentation : 'idle',
      rect: Object.freeze({ ...(preference?.rect || defaultRect()) }),
      displayRect: Object.freeze(minimized ? bubbleRect() : displayRectangle(preference)),
      bubbleRect: Object.freeze(bubbleRect()),
    });
  }

  let snapshot = createSnapshot();
  let publishedMaximumWidth = geometry().maximumWidth;
  let publishedMaximumHeight = geometry().maximumHeight;

  function publish() {
    const next = createSnapshot();
    const {maximumWidth, maximumHeight} = geometry();
    if (snapshot.sessionId === next.sessionId && snapshot.title === next.title
      && snapshot.available === next.available && snapshot.mode === next.mode
      && snapshot.contentOpen === next.contentOpen
      && snapshot.showStatistics === next.showStatistics
      && snapshot.floatingPresentation === next.floatingPresentation
      && publishedMaximumWidth === maximumWidth
      && publishedMaximumHeight === maximumHeight
      && snapshot.minimized === next.minimized && sameRect(snapshot.rect, next.rect)
      && sameRect(snapshot.displayRect, next.displayRect)
      && sameRect(snapshot.bubbleRect, next.bubbleRect)) return false;
    snapshot = next;
    publishedMaximumWidth = maximumWidth;
    publishedMaximumHeight = maximumHeight;
    for (const listener of [...listeners]) {
      try { listener(); } catch {}
    }
    return true;
  }

  return {
    getSnapshot() {
      return snapshot;
    },
    getResizeLimits(axis = 'width') {
      const area = geometry();
      if (axis === 'height') return {min: minimumExpandedHeight(currentPreference()), max: area.maximumHeight};
      return {min: Math.min(320, area.maximumWidth), max: area.maximumWidth};
    },
    getFloatingBounds() {
      const area = geometry();
      return {
        left: area.left, top: area.top, right: area.right, bottom: area.bottom,
        width: area.maximumWidth, height: area.maximumHeight,
      };
    },
    subscribe(listener) {
      if (disposed || typeof listener !== 'function') return () => {};
      const registered = () => listener();
      listeners.add(registered);
      if (listeners.size === 1) {
        if (typeof eventTarget?.addEventListener === 'function'
          && typeof eventTarget?.removeEventListener === 'function') {
          eventTarget.addEventListener('storage', onStorage);
          storageListening = true;
        }
        if (!statisticsDirty) syncStatistics();
      }
      return () => {
        listeners.delete(registered);
        if (listeners.size === 0) detachStorage();
      };
    },
    setShowStatistics(value) {
      if (disposed) return false;
      if (typeof value !== 'boolean') throw new TypeError('显示用量统计必须是布尔值。');
      let failure;
      let saveFailed = false;
      try {
        if (typeof storage?.setItem !== 'function') throw new Error('本地存储不可用。');
        storage.setItem(STATISTICS_KEY, JSON.stringify(value));
        statisticsDirty = false;
      } catch (error) {
        failure = error;
        saveFailed = true;
        statisticsDirty = true;
      }
      showStatistics = value;
      const changed = publish();
      if (saveFailed) {
        throw Object.assign(new Error('本次显示设置已应用，但未能保存到本机，刷新后可能恢复。', {cause: failure}), {
          code: 'STATISTICS_PREFERENCE_NOT_SAVED',
        });
      }
      return changed;
    },
    setContext(value = {}) {
      if (disposed) return false;
      const sessionId = typeof value?.sessionId === 'string' && value.sessionId.trim()
        ? value.sessionId.trim() : null;
      context = {
        sessionId,
        title: typeof value?.title === 'string' ? value.title.trim() : '',
        available: Boolean(sessionId && value?.available),
        contentOpen: Boolean(sessionId && value?.available && value?.contentOpen),
      };
      if (sessionId && !sessions.has(sessionId)) sessions.set(sessionId, createPreference());
      return publish();
    },
    setMode(mode) {
      const preference = currentPreference();
      if (disposed || !context.available || !preference || !MODES.has(mode)) return false;
      preference.mode = mode;
      // Returning to a pane also restores the editor for the next float.
      if (mode !== 'floating') preference.minimized = false;
      return publish();
    },
    setMinimized(minimized) {
      const preference = currentPreference();
      if (disposed || !context.available || preference?.mode !== 'floating'
        || typeof minimized !== 'boolean') return false;
      preference.minimized = minimized;
      return publish();
    },
    setFloatingPresentation(value) {
      const preference = currentPreference();
      if (disposed || !context.available || preference?.mode !== 'floating'
        || !FLOATING_PRESENTATIONS.has(value) || preference.floatingPresentation === value) return false;
      const previous = displayRectangle(preference);
      preference.floatingPresentation = value;
      if (value === 'expanded') {
        const top = preference.snap?.startsWith('top-')
          ? previous.top : previous.top + previous.height - preference.rect.height;
        preference.rect = anchoredRect({...preference.rect, top}, preference.snap, preference);
        preference.displayTop = null;
      } else {
        const height = preference.composerHeight + (value === 'focused' ? 42 : 2);
        preference.displayTop = preference.snap?.startsWith('top-')
          ? previous.top : previous.top + previous.height - height;
        if (preference.snap === 'bottom' || preference.snap?.includes('-')) preference.displayTop = null;
      }
      return publish();
    },
    setComposerHeight(height) {
      const preference = currentPreference();
      if (disposed || !context.available || !preference || !finite(height) || height <= 0
        || preference.composerHeight === height) return false;
      const previous = displayRectangle(preference);
      const bottom = preference.rect.top + preference.rect.height;
      preference.composerHeight = height;
      const expandedHeight = Math.max(preference.rect.height, minimumExpandedHeight(preference));
      const top = preference.snap?.startsWith('top-') ? preference.rect.top : bottom - expandedHeight;
      preference.rect = anchoredRect({...preference.rect, top, height: expandedHeight}, preference.snap, preference);
      if (preference.displayTop !== null) {
        const displayHeight = height + (preference.floatingPresentation === 'focused' ? 42 : 2);
        preference.displayTop = preference.snap?.startsWith('top-')
          ? previous.top : previous.top + previous.height - displayHeight;
      }
      return publish();
    },
    setRect(value = {}) {
      const preference = currentPreference();
      if (disposed || !context.available || !preference) return false;
      const rect = { ...preference.rect };
      let accepted = false;
      for (const field of ['left', 'top', 'width', 'height']) {
        if (!finite(value?.[field]) || ['width', 'height'].includes(field) && value[field] < 0) continue;
        rect[field] = value[field];
        accepted = true;
      }
      if (!accepted) return false;
      if (finite(value?.width) && value.width >= 0) preference.manualWidth = value.width;
      preference.rect = constrain(rect);
      preference.snap = null;
      preference.displayTop = null;
      return publish();
    },
    setDisplayRect(value = {}) {
      const preference = currentPreference();
      if (disposed || !context.available || preference?.mode !== 'floating') return false;
      const previous = displayRectangle(preference);
      const next = {...previous};
      let accepted = false;
      for (const field of ['left', 'top', 'width']) {
        if (!finite(value?.[field]) || field === 'width' && value[field] < 0) continue;
        next[field] = value[field];
        accepted = true;
      }
      if (!accepted) return false;
      if (next.width !== previous.width) preference.manualWidth = next.width;
      const visible = constrainDisplayRect(next);
      const top = visible.top + visible.height - preference.rect.height;
      preference.rect = constrain({...preference.rect, left: visible.left, top, width: visible.width});
      preference.displayTop = preference.floatingPresentation === 'expanded' ? null : visible.top;
      preference.snap = null;
      return publish();
    },
    resizeFromEdge(edge, delta, originRect) {
      const preference = currentPreference();
      if (disposed || !context.available || preference?.mode !== 'floating'
        || !['left', 'right', 'top', 'bottom'].includes(edge) || !finite(delta) || delta === 0) return false;
      const origin = originRect || displayRectangle(preference);
      const height = origin.height === undefined ? preference.rect.height : origin.height;
      if (!finite(origin.left) || !finite(origin.top) || !finite(origin.width)
        || !finite(height) || origin.width < 0 || height < 0) return false;
      const initial = constrainDisplayRect({...origin, height});
      const area = geometry();
      const minimumWidth = Math.min(320, area.maximumWidth);
      const minimumHeight = minimumExpandedHeight(preference);
      let left = initial.left;
      let right = initial.left + initial.width;
      let top = initial.top;
      let bottom = initial.top + initial.height;
      if (edge === 'left') left = clamp(initial.left + delta, area.left, right - minimumWidth);
      if (edge === 'right') right = clamp(right + delta, left + minimumWidth, area.right);
      if (edge === 'top') top = clamp(initial.top + delta, area.top, bottom - minimumHeight);
      if (edge === 'bottom') bottom = clamp(bottom + delta, top + minimumHeight, area.bottom);
      if (edge === 'top' || edge === 'bottom') {
        // Revealing the header may need more room than an idle card has at an edge.
        preference.rect = constrain({left, top, width: right - left, height: bottom - top}, preference);
        preference.floatingPresentation = 'expanded';
        preference.displayTop = null;
      } else {
        preference.manualWidth = right - left;
        preference.rect = constrain({...preference.rect, left, width: right - left});
        preference.displayTop = preference.floatingPresentation === 'expanded' ? null : initial.top;
      }
      preference.snap = null;
      return publish();
    },
    snapToBottom() {
      const preference = currentPreference();
      if (disposed || !context.available || !preference) return false;
      preference.rect = bottomCentered(preference.rect);
      preference.snap = 'bottom';
      preference.displayTop = null;
      return publish();
    },
    snapToEdge(side) {
      const preference = currentPreference();
      if (disposed || !context.available || preference?.mode !== 'floating'
        || !['left', 'right'].includes(side)) return false;
      const previous = displayRectangle(preference);
      preference.rect = anchoredRect(preference.rect, side);
      preference.snap = side;
      preference.displayTop = preference.floatingPresentation === 'expanded' ? null : previous.top;
      return publish();
    },
    snapAfterDrag() {
      const preference = currentPreference();
      if (disposed || !context.available || preference?.mode !== 'floating' || preference.minimized) return false;
      const rectangle = displayRectangle(preference);
      const area = geometry();
      const horizontalSpan = area.maximumWidth - rectangle.width;
      const verticalSpan = area.maximumHeight - rectangle.height;
      const horizontal = horizontalSpan > 0 ? (rectangle.left - area.left) / horizontalSpan : 0.5;
      const vertical = verticalSpan > 0 ? (rectangle.top - area.top) / verticalSpan : 0.5;
      let snap = 'bottom';
      if (horizontal <= 1 / 3 || horizontal >= 2 / 3) {
        const side = horizontal <= 1 / 3 ? 'left' : 'right';
        snap = (vertical < 0.5 ? 'top-' : 'bottom-') + side;
      }
      preference.rect = anchoredRect(preference.rect, snap);
      preference.snap = snap;
      preference.displayTop = null;
      return publish();
    },
    setBounds(value = {}) {
      if (disposed) return false;
      const next = { ...bounds };
      for (const field of ['left', 'top', 'width', 'height', 'floatingHeight']) {
        if (!finite(value?.[field])) continue;
        if (['width', 'height', 'floatingHeight'].includes(field) && value[field] < 0) continue;
        next[field] = value[field];
      }
      bounds = next;
      for (const preference of sessions.values()) {
        const width = preference.manualWidth ?? defaultWidth(geometry().maximumWidth);
        preference.rect = anchoredRect({...preference.rect, width}, preference.snap, preference);
        if (preference.displayTop !== null) preference.displayTop = displayRectangle(preference).top;
      }
      return publish();
    },
    reset() {
      if (disposed || !context.sessionId) return false;
      sessions.set(context.sessionId, createPreference());
      return publish();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      detachStorage();
      sessions.clear();
      listeners.clear();
    },
  };
}
