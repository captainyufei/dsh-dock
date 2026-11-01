/**
 * A local first-message draft. Constructing or editing it performs no host work.
 *
 * adapter.create(snapshot) -> { sessionId, ...handle }
 * adapter.configure(handle, snapshot) -> all chosen settings have been applied
 * adapter.send(handle, snapshot) -> { accepted: true, ...receipt }
 * adapter.open(handle) -> navigation only, after acceptance
 *
 * A successful create is retained after later failures. Identity changes then
 * require resetPreparedSession(); that method does not delete a host Session.
 */
export function createDraftController(initialState = {}, options = {}) {
  const listeners = new Set();
  const urlApi = options.urlApi ?? globalThis.URL;
  let nextFileId = 0;
  let disposed = false;
  let inFlight = null;
  let preparedHandle = null;
  let preparedIdentity = null;
  // A persisted identity is evidence to inspect, never an invented live handle.
  const recoverySessionId = initialState.recoverySessionId || null;
  const interrupted = recoverySessionId !== null || initialState.sendUncertain === true;
  let state = snapshot({
    text: initialState.text ?? '',
    files: [],
    workspaceId: initialState.workspaceId ?? null,
    agentPreset: initialState.agentPreset ?? null,
    modelSelection: initialState.modelSelection ?? null,
    permissionPreset: initialState.permissionPreset ?? null,
    status: interrupted ? 'error' : 'idle',
    error: interrupted ? '上次发送/准备过程被中断，请先打开会话核对。' : null,
    preparedSessionId: recoverySessionId,
    sendUncertain: interrupted,
  });

  function report(error) {
    // Observers and URL cleanup cannot turn an accepted message into a retry.
    try { options.onListenerError?.(error); } catch {}
  }

  function publish(patch) {
    state = snapshot({ ...state, ...patch });
    for (const listener of [...listeners]) {
      try { listener(); } catch (error) { report(error); }
    }
  }

  function ensureAlive() {
    if (disposed) throw failure('DRAFT_DISPOSED', '草稿已关闭。');
  }

  function ensureEditable() {
    ensureAlive();
    if (inFlight !== null) throw failure('DRAFT_BUSY', '正在发送，请等待本次发送完成。');
  }

  function revoke(files) {
    for (const item of files) {
      if (!item.previewUrl) continue;
      try { urlApi?.revokeObjectURL?.(item.previewUrl); } catch (error) { report(error); }
    }
  }

  function update(patch) {
    ensureEditable();
    const allowed = ['text', 'workspaceId', 'agentPreset', 'modelSelection', 'permissionPreset'];
    for (const key of Object.keys(patch)) {
      if (!allowed.includes(key)) throw failure('INVALID_DRAFT_PATCH', `不能直接修改草稿字段：${key}`);
    }
    if (Object.hasOwn(patch, 'text') && typeof patch.text !== 'string') throw new TypeError('草稿文字必须是字符串。');
    if (preparedIdentity !== null) {
      for (const key of ['workspaceId', 'agentPreset']) {
        if (Object.hasOwn(patch, key) && (patch[key] ?? null) !== preparedIdentity[key]) {
          throw failure('PREPARED_SESSION_MISMATCH', '此草稿已准备好一个会话。切换工作区或模式前，请先重置已准备的会话。');
        }
      }
    }
    const normalized = { ...patch };
    for (const key of ['workspaceId', 'agentPreset', 'permissionPreset', 'modelSelection']) {
      if (Object.hasOwn(normalized, key)) normalized[key] ??= null;
    }
    publish({ ...normalized, status: state.sendUncertain ? 'error' : 'idle', error: state.sendUncertain ? state.error : null });
    return state;
  }

  function addFiles(files) {
    ensureEditable();
    const additions = [];
    try {
      for (const file of files) {
        const previewUrl = urlApi?.createObjectURL ? urlApi.createObjectURL(file) : null;
        additions.push(Object.freeze({ id: `draft-file-${++nextFileId}`, file, previewUrl }));
      }
    } catch (error) {
      revoke(additions);
      throw error;
    }
    if (additions.length > 0) publish({ files: [...state.files, ...additions], error: state.sendUncertain ? state.error : null, status: state.sendUncertain ? 'error' : 'idle' });
    return additions;
  }

  function removeFile(id) {
    ensureEditable();
    const removed = state.files.filter((item) => item.id === id);
    if (removed.length === 0) return false;
    revoke(removed);
    publish({ files: state.files.filter((item) => item.id !== id), error: state.sendUncertain ? state.error : null, status: state.sendUncertain ? 'error' : 'idle' });
    return true;
  }

  function resetPreparedSession() {
    ensureEditable();
    const previous = preparedHandle;
    preparedHandle = null;
    preparedIdentity = null;
    publish({ preparedSessionId: null, error: null, status: 'idle', sendUncertain: false });
    return previous;
  }

  function submit(adapter) {
    try {
      ensureAlive();
      if (inFlight !== null) return inFlight;
      if (state.sendUncertain) throw failure('SEND_UNCERTAIN', '发送结果尚未确认，请先打开已准备的会话核对，避免重复发送。');
      if (state.text.trim() === '' && state.files.length === 0) throw failure('DRAFT_EMPTY', '请先输入消息或添加文件。');
      for (const key of ['create', 'configure', 'send', 'open']) {
        if (typeof adapter?.[key] !== 'function') throw new TypeError(`发送适配器缺少 ${key}。`);
      }
    } catch (error) {
      return Promise.reject(error);
    }

    // Each phase receives this same immutable draft, never a later UI selection.
    const captured = state;
    const run = async () => {
      ensureAlive();
      let handle = preparedHandle;
      if (handle === null) {
        handle = await adapter.create(captured);
        ensureAlive();
        if (typeof handle?.sessionId !== 'string' || handle.sessionId === '') throw failure('INVALID_SESSION_HANDLE', '宿主没有返回有效的会话。');
        preparedHandle = handle;
        preparedIdentity = { workspaceId: captured.workspaceId, agentPreset: captured.agentPreset };
        publish({ preparedSessionId: handle.sessionId });
      }
      publish({ status: 'configuring' });
      await adapter.configure(handle, captured);
      ensureAlive();
      publish({ status: 'sending' });
      const receipt = await adapter.send(handle, captured);
      if (receipt?.accepted !== true) throw failure('SEND_UNCERTAIN', '宿主没有返回接收确认，请先打开会话核对，草稿已保留。');

      // Acceptance is the irreversible boundary. Navigation failure cannot make
      // the same draft resendable, even when the plugin unloads during sending.
      preparedHandle = null;
      preparedIdentity = null;
      const result = { ...receipt, accepted: true, sessionId: handle.sessionId, handle };
      if (disposed) return result;
      revoke(state.files);
      publish({ text: '', files: [], preparedSessionId: null, status: 'opening', sendUncertain: false });
      try {
        await adapter.open(handle);
      } catch (openError) {
        result.openError = openError;
      }
      return result;
    };

    // Start on a microtask so a subscriber submitting synchronously on the first
    // status notification also receives the already registered shared promise.
    inFlight = Promise.resolve().then(run).then(
      (result) => {
        inFlight = null;
        if (!disposed) publish({ status: 'idle', error: result.openError ? `消息已发送，但打开会话失败：${messageOf(result.openError)}` : null });
        return result;
      },
      (error) => {
        inFlight = null;
        if (!disposed) publish({ status: 'error', error: messageOf(error), sendUncertain: error?.code === 'SEND_UNCERTAIN' || error?.code === 'CREATE_UNCERTAIN' });
        throw error;
      },
    );
    publish({ status: preparedHandle === null ? 'creating' : 'configuring', error: null });
    return inFlight;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    listeners.clear();
    revoke(state.files);
    state = snapshot({ ...state, files: [], status: 'disposed' });
    preparedHandle = null;
    preparedIdentity = null;
  }

  return Object.freeze({
    getSnapshot: () => state,
    subscribe(listener) {
      ensureAlive();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update,
    setText: (text) => update({ text }),
    addFiles,
    removeFile,
    submit,
    resetPreparedSession,
    dispose,
  });
}

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function freezeData(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freezeData));
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeData(item)])));
}

function snapshot(value) {
  return Object.freeze({ ...value, files: Object.freeze([...value.files]), modelSelection: freezeData(value.modelSelection) });
}
