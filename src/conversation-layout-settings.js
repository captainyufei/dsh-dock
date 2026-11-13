import React from 'react';

const MODEL_OPTIONS = 'conversation.input.model.options';
const PERMISSION_SLOT = 'conversation.input.permission';
const CONTRIBUTION_ID = 'chatgpt-rail.floating-permission-settings';
const EMPTY_CATALOG = Object.freeze({value: null});
const EMPTY_SOURCE = {subscribe: () => () => {}, getSnapshot: () => EMPTY_CATALOG};
const h = React.createElement;

function currentFloatingSession(snapshot, sessionId) {
  return snapshot.sessionId === sessionId && snapshot.available && snapshot.mode === 'floating'
    && !snapshot.minimized && snapshot.rect?.width > 0 && snapshot.rect.width <= 640;
}

function permissionName(selection, catalog, t) {
  const value = selection.currentValue;
  const option = catalog?.options?.find(candidate => candidate.value === value);
  if (value === 'auto') return t?.('auto.label') ?? '自动审查';
  const names = {
    'read-only': ['preset.readOnly', 'Read Only', '仅可查看'],
    'workspace-write': ['preset.workspaceWrite', 'Workspace Write', '工作区内修改'],
    'danger-full-access': ['preset.fullAccess', 'Full access', '完全权限'],
  };
  const builtin = names[value];
  const name = option?.name ?? value;
  if (builtin && (name === value || name === builtin[1])) return t?.(builtin[0]) ?? builtin[2];
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)
    ? name.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ')
    : name;
}

/**
 * Append a current-session permission entry to the Host's model/settings menu.
 * The original PermissionSelect remains mounted in its original Session seat:
 * opening that control preserves its catalog, confirmations and command writer.
 * Never nest its portal or copy a permission mutation into this contribution.
 */
export function installFloatingComposerSettings(ctx, {model, onOpenPermission}) {
  const slots = ctx.slots;
  if (typeof slots?.spec !== 'function' || typeof slots.register !== 'function'
    || typeof slots.entriesOfSlot !== 'function' || typeof slots.subscribe !== 'function'
    || typeof model?.getSnapshot !== 'function' || typeof model.subscribe !== 'function'
    || typeof onOpenPermission !== 'function') return null;

  const nativePermission = () => {
    try {
      return slots.entriesOfSlot(PERMISSION_SLOT).find(entry => entry.locale === 'permission.access'
        && entry.component && typeof entry.inject === 'function') ?? null;
    } catch {
      return null;
    }
  };
  try {
    const spec = slots.spec(MODEL_OPTIONS);
    if (spec?.kind !== 'list' || spec.scope !== 'session' || !nativePermission()) return null;
  } catch {
    return null;
  }

  let disposed = false;
  function PermissionSettingsOption({sessionId, capturedSessionId, useProjection, locked, dismiss, reportFailure}) {
    const snapshot = React.useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
    const entry = React.useSyncExternalStore(
      React.useCallback(listener => slots.subscribe(PERMISSION_SLOT, listener), []),
      nativePermission, nativePermission,
    );
    const injected = React.useMemo(() => {
      try { return entry?.inject(capturedSessionId); } catch { return null; }
    }, [entry, capturedSessionId]);
    const catalogSource = injected?.hooks?.permissionCatalog;
    const source = typeof catalogSource?.subscribe === 'function' && typeof catalogSource.getSnapshot === 'function'
      ? catalogSource : EMPTY_SOURCE;
    const catalog = React.useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
    // This hook is supplied by the real session-scoped Slot renderer.
    const selection = useProjection('permissions');
    const [pending, setPending] = React.useState(false);
    const pendingRef = React.useRef(false);
    if (disposed || !entry || sessionId !== capturedSessionId || !selection
      || !currentFloatingSession(snapshot, capturedSessionId)) return null;
    let t;
    try { t = ctx.locale?.bind(entry.locale); } catch { /* Fall back to built-in captions. */ }
    const label = permissionName(selection, catalog.value, t);
    const open = async () => {
      if (pendingRef.current || locked || disposed || !nativePermission()
        || !currentFloatingSession(model.getSnapshot(), capturedSessionId)) return;
      pendingRef.current = true;
      setPending(true);
      try {
        dismiss();
        await onOpenPermission(capturedSessionId);
      } catch (error) {
        if (!disposed && currentFloatingSession(model.getSnapshot(), capturedSessionId)) {
          reportFailure(error instanceof Error ? error.message : '访问权限暂时无法打开，请重试。');
        }
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    };
    return h('button', {
      type: 'button', role: 'menuitem', className: 'cgpt-floating-permission-option',
      'aria-label': '访问权限，当前：' + label, 'aria-haspopup': 'menu',
      disabled: locked || pending, onClick: open,
    }, h('span', {className: 'cgpt-floating-permission-label'}, '访问权限'),
    h('span', {className: 'cgpt-floating-permission-value'}, label),
    h('span', {className: 'cgpt-floating-permission-chevron', 'aria-hidden': true}, '›'));
  }

  let unregister;
  try {
    unregister = slots.register({
      name: MODEL_OPTIONS, id: CONTRIBUTION_ID, order: 400,
      inject: sessionId => ({capturedSessionId: sessionId}),
    }, PermissionSettingsOption);
  } catch {
    return null;
  }
  return {
    get available() { return !disposed && nativePermission() !== null; },
    subscribe: listener => slots.subscribe(PERMISSION_SLOT, listener),
    dispose() {
      if (disposed) return;
      disposed = true;
      unregister();
    },
  };
}
