const CONTRIBUTION_ID = 'chatgpt-rail.conversation-layout';
const FAILURE_LABEL = '调整布局失败，请在当前会话重新打开菜单后重试。';

function canMove(snapshot, sessionId) {
  return snapshot.sessionId === sessionId && snapshot.available && snapshot.contentOpen
    && (snapshot.mode === 'left' || snapshot.mode === 'right');
}

/** Contribute to the native Session Header More menu for the captured Session. */
export function installConversationLayoutMenu(ctx, {model, actions}) {
  let menus;
  try {
    menus = ctx.get?.('contextMenus') ?? ctx.contextMenus;
  } catch {
    return () => {};
  }
  if (typeof menus?.register !== 'function') return () => {};

  let disposed = false;
  const unregister = menus.register({
    id: CONTRIBUTION_ID,
    target: 'sessionHeader',
    order: 400,
    observe: () => [model],
    resolve({sessionId}, signal) {
      const snapshot = model.getSnapshot();
      if (disposed || signal?.aborted || !canMove(snapshot, sessionId)) return [];
      const sourceMode = snapshot.mode;
      const destination = sourceMode === 'left' ? 'right' : 'left';
      return [{
        id: 'move-' + destination,
        label: destination === 'right' ? '移至右侧面板' : '移至左侧面板',
        separatorBefore: true,
        failureLabel: FAILURE_LABEL,
        run() {
          if (disposed) return;
          const current = model.getSnapshot();
          if (!canMove(current, sessionId) || current.mode !== sourceMode) {
            throw new Error(FAILURE_LABEL);
          }
          // Native selection disposes its preparation signal before invoking run.
          // The Host action owns execution-time Session and panel validation.
          return actions.setMode(destination, {sessionId, requireContentOpen: true});
        },
      }];
    },
  });

  return () => {
    if (disposed) return;
    disposed = true;
    unregister();
  };
}
