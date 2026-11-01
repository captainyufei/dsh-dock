/**
 * Adapter for DeepSeek Harness 0.2.1-rc.5's public client services.
 * No Session is created by catalog reads or draft editing. A fresh Session is
 * allocated only by create(), which the draft controller calls on Send.
 */
export function createHostAdapter(ctx, options = {}) {
  const sessions = ctx.sessions ?? ctx.get?.('sessions');
  const workspaces = ctx.workspaces ?? ctx.get?.('workspaces');
  const conversation = ctx.conversation ?? ctx.get?.('conversation');
  const navigation = ctx.uiWorkspace ?? ctx.get?.('uiWorkspace');
  const remote = ctx.remote;
  const handles = new Map();
  const uploadWaiters = new Set();
  const uploadTimeoutMs = options.uploadTimeoutMs ?? 120000;
  let disposed = false;
  let creationUncertain = null;

  function assertLive() {
    if (disposed) throw new Error('插件已关闭，请重新打开首页。');
  }

  function unwrap(result, operation) {
    if (result?.ok === true) return result.value;
    const error = new Error(`${operation}：${result?.error?.message ?? '宿主未返回有效结果'}${result?.error?.code ? ` (${result.error.code})` : ''}`);
    error.code = result?.error?.code ?? 'HOST_RESPONSE_INVALID';
    // The Gateway folds a lost carrier response into ok:false too. Those
    // codes do not prove the Host refused admission and must not be retried.
    error.hostRefusal = result?.ok === false && !['gateway/internal', 'gateway/cancelled'].includes(error.code);
    throw error;
  }

  function stateFor(handle) {
    assertLive();
    const state = handles.get(handle?.sessionId);
    if (!state) throw new Error('这条待发送会话已释放，请重新打开首页。');
    return state;
  }

  async function modelCatalog() {
    assertLive();
    return unwrap(await remote.session.modelCatalog(), '读取模型失败');
  }

  async function permissionCatalog() {
    assertLive();
    return unwrap(await remote.permissionPresets.catalog(), '读取权限选项失败');
  }

  async function presetCatalog() {
    assertLive();
    return unwrap(await remote.agentPresets.list(), '读取模式失败');
  }

  async function loadWorkspaces() {
    assertLive();
    const snapshot = workspaces.list.getSnapshot();
    if (snapshot.phase !== undefined && snapshot.phase !== 'ready') {
      // The controller owns its live list; refresh is a read-only supported op.
      if (typeof workspaces.refresh === 'function') await workspaces.refresh();
    }
    return workspaces.list.getSnapshot().items;
  }

  async function validate(snapshot) {
    if (!snapshot.workspaceId) throw new Error('请先选择工作区。');
    const list = await loadWorkspaces();
    if (!list.some(item => item.workspaceId === snapshot.workspaceId)) {
      throw new Error('所选工作区已不可用，请重新选择。');
    }
    const checks = [];
    if (snapshot.agentPreset) checks.push(presetCatalog().then(roster => {
      if (!roster.presets.some(item => item.id === snapshot.agentPreset && item.broken === undefined)) {
        throw new Error('所选模式已不可用，请重新选择。');
      }
    }));
    if (snapshot.modelSelection) checks.push(modelCatalog().then(catalog => {
      const choice = snapshot.modelSelection;
      const group = catalog.groups.find(item => item.id === choice.provider);
      const model = group?.models.find(item => item.id === choice.model);
      if (!model) throw new Error('所选模型已不可用，请重新选择。');
      if (choice.reasoningEffort && !model.reasoning?.efforts.some(item => item.id === choice.reasoningEffort)) {
        throw new Error('所选推理等级已不可用，请重新选择。');
      }
    }));
    if (snapshot.permissionPreset) checks.push(permissionCatalog().then(catalog => {
      if (!catalog.options.some(item => item.value === snapshot.permissionPreset)) {
        throw new Error('所选权限已不可用，请重新选择。');
      }
    }));
    await Promise.all(checks);
  }

  async function create(snapshot) {
    assertLive();
    if (creationUncertain) throw creationUncertain;
    await validate(snapshot);
    assertLive();
    // Omitting sessionId requests a fresh Session instead of taking over any
    // other existing blank Session or its unsent draft.
    let sessionId;
    try {
      sessionId = await sessions.create({
        workspaceId: snapshot.workspaceId,
        ...(snapshot.agentPreset ? { agentPreset: snapshot.agentPreset } : {}),
      });
    } catch (cause) {
      const code = cause?.rpcError?.code ?? cause?.code;
      if (code && !['gateway/internal', 'gateway/cancelled'].includes(code)) throw cause;
      creationUncertain = Object.assign(new Error('连接中断，无法确认会话是否已建立。请先检查会话列表，再刷新插件，避免重复创建。', { cause }), { code: 'CREATE_UNCERTAIN' });
      throw creationUncertain;
    }
    // The host can finish creation while the plugin is being disposed. Do not
    // retain a new reference after teardown or begin a late submission.
    assertLive();
    // Return the handle before ready settles so a preparation refusal can be
    // retried against the same Session instead of allocating another one.
    const state = {
      reference: null,
      ready: null,
      retryReady: false,
      workspaceId: snapshot.workspaceId,
      agentPreset: snapshot.agentPreset ?? null,
      attachments: new Map(),
      sendPromise: null,
      accepted: false,
      uncertain: null,
    };
    // Suppress an unhandled rejection between create() and configure(); the
    // same rejected Promise is still awaited and surfaced by configure().
    try { replaceReference(state, sessionId); }
    catch (error) {
      // Once the Session id is known, opening failure belongs to preparation,
      // not creation. Keep its handle so retry can never create a second one.
      state.ready = Promise.reject(error);
      state.ready.catch(() => {});
    }
    handles.set(sessionId, state);
    return { sessionId };
  }

  function replaceReference(state, sessionId) {
    assertLive();
    // Acquire before releasing the old operation reference so a pending scope
    // teardown cannot invalidate the replacement. Harness retain() retries its
    // failed open() using the same existing Session, never Session creation.
    const reference = sessions.retain(sessionId, { source: 'controllerOperation' });
    const previous = state.reference;
    state.reference = reference;
    state.ready = reference.ready;
    state.ready.catch(() => {});
    state.retryReady = false;
    previous?.release();
  }

  async function readyBinding(state, sessionId) {
    assertLive();
    if (state.retryReady) replaceReference(state, sessionId);
    try { return await state.ready; }
    catch (error) {
      // Only a subsequent user-requested retry obtains a new reference. The
      // current attempt reports its opening failure without a retry loop.
      state.retryReady = true;
      throw error;
    }
  }

  async function configure(handle, snapshot) {
    const state = stateFor(handle);
    if (state.accepted) return;
    if (state.uncertain) throw state.uncertain;
    if (state.workspaceId !== snapshot.workspaceId || state.agentPreset !== (snapshot.agentPreset ?? null)) {
      throw new Error('这条待发送会话已确定工作区和模式；请恢复原选择后重试，或重新开始草稿。');
    }
    await validate(snapshot);
    assertLive();
    await readyBinding(state, handle.sessionId);
    assertLive();
    if (snapshot.modelSelection) {
      const model = snapshot.modelSelection;
      unwrap(await remote.session.selectModel({
        sessionId: handle.sessionId,
        provider: model.provider,
        model: model.model,
        ...(model.reasoningEffort ? { reasoningEffort: model.reasoningEffort } : {}),
      }), '设置模型失败');
      assertLive();
    }
    if (snapshot.permissionPreset) {
      const result = unwrap(await remote.commands.execute(handle.sessionId, `/permission ${snapshot.permissionPreset}`, []), '设置权限失败');
      if (result === undefined) throw new Error('宿主没有提供权限切换命令，消息尚未发送。');
      if (result.result?.kind === 'error') throw new Error(`设置权限失败：${result.result.text}`);
    }
  }

  function waitForUploads(descriptors) {
    const files = descriptors.filter(item => item.kind === 'file');
    if (files.length === 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let stopped = false;
      let unsubscribe = () => {};
      let timer;
      const finish = error => {
        if (stopped) return;
        stopped = true;
        unsubscribe();
        clearTimeout(timer);
        uploadWaiters.delete(cancel);
        error ? reject(error) : resolve();
      };
      const cancel = () => finish(new Error('插件已关闭，附件尚未发送。'));
      uploadWaiters.add(cancel);
      const inspect = () => {
        if (disposed) return finish(new Error('插件已关闭，附件尚未发送。'));
        const uploads = conversation.fileUploads.getSnapshot();
        const failed = files.map(item => uploads[item.id]).find(item => item?.status === 'error');
        if (failed) return finish(new Error(`附件上传失败：${failed.message ?? '请重试'}`));
        if (files.every(item => uploads[item.id]?.status === 'ready')) finish();
      };
      unsubscribe = conversation.fileUploads.subscribe(inspect);
      timer = setTimeout(() => finish(new Error('附件上传超时，草稿已保留，可以重试。')), uploadTimeoutMs);
      inspect();
    });
  }

  async function prepareAttachments(state, sessionId, snapshot) {
    const selected = snapshot.files ?? [];
    const selectedIds = new Set(selected.map(item => item.id));
    for (const [id, descriptor] of state.attachments) {
      if (!selectedIds.has(id)) {
        conversation.releaseDraftAttachment(descriptor.id);
        state.attachments.delete(id);
      }
    }
    for (const item of selected) {
      let descriptor = state.attachments.get(item.id);
      if (!descriptor) {
        [descriptor] = conversation.createDrafts(sessionId, [item.file]);
        state.attachments.set(item.id, descriptor);
      } else if (descriptor.kind === 'file' && conversation.fileUploads.getSnapshot()[descriptor.id]?.status === 'error') {
        conversation.retryFileUpload(sessionId, descriptor.id);
      }
    }
    const descriptors = selected.map(item => state.attachments.get(item.id));
    await waitForUploads(descriptors);
    assertLive();
    const result = await conversation.serializeDraftAttachments(descriptors.map(item => item.id));
    return result.attachments;
  }

  function send(handle, snapshot) {
    const state = stateFor(handle);
    if (state.accepted) return Promise.resolve({ accepted: true, sessionId: handle.sessionId });
    if (state.uncertain) return Promise.reject(state.uncertain);
    if (state.sendPromise) return state.sendPromise;
    state.sendPromise = (async () => {
      const binding = await readyBinding(state, handle.sessionId);
      assertLive();
      const parts = await prepareAttachments(state, handle.sessionId, snapshot);
      assertLive();
      const content = [...parts, ...(snapshot.text === '' ? [] : [{ type: 'text', text: snapshot.text }])];
      if (content.length === 0) throw new Error('请先输入内容或添加附件。');
      let result;
      try {
        if (/^\s*\//.test(snapshot.text)) {
          const command = await remote.commands.execute(handle.sessionId, snapshot.text.trimStart(), parts);
          const outcome = unwrap(command, '执行命令失败');
          if (outcome !== undefined) {
            if (outcome.result?.kind === 'error') throw Object.assign(new Error(outcome.result.text), { code: 'COMMAND_REJECTED', hostRefusal: true });
            state.accepted = true;
            cleanupAttachments(state);
            return { accepted: true, sessionId: handle.sessionId, command: true };
          }
          throw Object.assign(new Error('命令不存在或格式有误，草稿已保留，请修改后重试。'), { code: 'COMMAND_NOT_FOUND', hostRefusal: true });
        }
        // This public method resolves on Host admission, not on model output.
        // It is the same prompt(content, mode) used by the native composer.
        result = await binding.session.prompt(content, 'queue');
        const value = unwrap(result, '发送失败');
        if (value?.accepted !== true) throw new Error('宿主未确认消息已接收。');
      } catch (cause) {
        // A typed Remote refusal or command handler failure is a known result,
        // so only an unclassified thrown transport failure is ambiguous.
        if (cause?.hostRefusal === true) throw cause;
        // A disconnected round trip can have reached the Host. Never issue a
        // second prompt automatically when its admission outcome is unknown.
        const error = new Error('连接中断，无法确认消息是否已接收。请打开该会话检查，避免重复发送。', { cause });
        error.code = 'SEND_UNCERTAIN';
        state.uncertain = error;
        throw error;
      }
      state.accepted = true;
      cleanupAttachments(state);
      return { accepted: true, sessionId: handle.sessionId };
    })().finally(() => { state.sendPromise = null; });
    return state.sendPromise;
  }

  function cleanupAttachments(state) {
    for (const descriptor of state.attachments.values()) {
      try { conversation.releaseDraftAttachment(descriptor.id); }
      catch (error) { options.onCleanupError?.(error); }
    }
    state.attachments.clear();
  }

  function release(handle) {
    const state = handles.get(handle?.sessionId);
    if (!state) return;
    for (const descriptor of state.attachments.values()) conversation.releaseDraftAttachment(descriptor.id);
    state.attachments.clear();
    state.reference?.release();
    handles.delete(handle.sessionId);
  }

  function open(handle) {
    assertLive();
    if (!handle?.sessionId) throw new Error('找不到要打开的会话。');
    // UiWorkspace takes its own synchronous mainView reference before this
    // operation-owned reference is released. No private router/DOM is touched.
    navigation.openSession(handle.sessionId);
    // Inspection after a rejected/uncertain send keeps this prepared handle
    // usable when the user returns to the homepage. Accepted sends may release
    // their operation reference, and later open calls still navigate normally.
    if (handles.get(handle.sessionId)?.accepted) release(handle);
  }

  return {
    create, configure, send, open, release,
    // Call only after an explicit user action confirming they have checked
    // the Session list. A transport failure cannot prove creation failed.
    resetCreateUncertainty() {
      assertLive();
      const wasUncertain = creationUncertain !== null;
      creationUncertain = null;
      return wasUncertain;
    },
    loadModels: async () => (await modelCatalog()).groups,
    loadPermissions: async () => (await permissionCatalog()).options,
    loadPresets: async () => (await presetCatalog()).presets.filter(item => item.broken === undefined),
    loadWorkspaces,
    async loadDefaults() {
      const [models, permissions, presets] = await Promise.all([modelCatalog(), permissionCatalog(), presetCatalog()]);
      return {
        modelSelection: models.default ?? null,
        permissionPreset: permissions.defaultPreset ?? null,
        agentPreset: presets.presets.find(item => item.isDefault && item.broken === undefined)?.id ?? null,
        workspaceId: currentWorkspaceId(),
      };
    },
    dispose() {
      for (const cancel of [...uploadWaiters]) cancel();
      for (const sessionId of [...handles.keys()]) release({ sessionId });
      disposed = true;
    },
  };

  function currentWorkspaceId() {
    const snapshot = sessions.list?.getSnapshot();
    const byId = snapshot?.byId ?? {};
    // These are read-only public list projections used by Harness's workspace
    // browser itself (mainSessionId); reading them does not retain a Session.
    const current = Object.values(byId).find(item => (item.retainedBy?.mainView ?? 0) > 0);
    if (!current) return null;
    const id = current.id ?? current.sessionId;
    const items = workspaces.list.getSnapshot().items;
    return items.find(item => item.sessionIds?.includes(id))?.workspaceId
      ?? items.find(item => current.cwd && item.path === current.cwd)?.workspaceId
      ?? null;
  }
}
