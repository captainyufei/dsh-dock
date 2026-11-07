window.__ModuleLoader__.load({id:"@captainyufei/dsh-dock",factory(require){var module={exports:{}};var exports=module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// client-entry.js
var client_entry_exports = {};
__export(client_entry_exports, {
  default: () => client_entry_default
});
module.exports = __toCommonJS(client_entry_exports);
var import_react10 = __toESM(require("react"), 1);
var import_react_dom2 = require("react-dom");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// draft-controller.js
function createDraftController(initialState = {}, options = {}) {
  const listeners = /* @__PURE__ */ new Set();
  const urlApi = options.urlApi ?? globalThis.URL;
  let nextFileId = 0;
  let disposed = false;
  let inFlight = null;
  let preparedHandle = null;
  let preparedIdentity = null;
  const recoverySessionId = initialState.recoverySessionId || null;
  const interrupted = recoverySessionId !== null || initialState.sendUncertain === true;
  let state = snapshot({
    text: initialState.text ?? "",
    files: [],
    workspaceId: initialState.workspaceId ?? null,
    agentPreset: initialState.agentPreset ?? null,
    modelSelection: initialState.modelSelection ?? null,
    permissionPreset: initialState.permissionPreset ?? null,
    status: interrupted ? "error" : "idle",
    error: interrupted ? "\u4E0A\u6B21\u53D1\u9001/\u51C6\u5907\u8FC7\u7A0B\u88AB\u4E2D\u65AD\uFF0C\u8BF7\u5148\u6253\u5F00\u4F1A\u8BDD\u6838\u5BF9\u3002" : null,
    preparedSessionId: recoverySessionId,
    sendUncertain: interrupted
  });
  function report(error) {
    try {
      options.onListenerError?.(error);
    } catch {
    }
  }
  function publish(patch) {
    state = snapshot({ ...state, ...patch });
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        report(error);
      }
    }
  }
  function ensureAlive() {
    if (disposed) throw failure("DRAFT_DISPOSED", "\u8349\u7A3F\u5DF2\u5173\u95ED\u3002");
  }
  function ensureEditable() {
    ensureAlive();
    if (inFlight !== null) throw failure("DRAFT_BUSY", "\u6B63\u5728\u53D1\u9001\uFF0C\u8BF7\u7B49\u5F85\u672C\u6B21\u53D1\u9001\u5B8C\u6210\u3002");
  }
  function revoke(files) {
    for (const item of files) {
      if (!item.previewUrl) continue;
      try {
        urlApi?.revokeObjectURL?.(item.previewUrl);
      } catch (error) {
        report(error);
      }
    }
  }
  function update(patch) {
    ensureEditable();
    const allowed = ["text", "workspaceId", "agentPreset", "modelSelection", "permissionPreset"];
    for (const key of Object.keys(patch)) {
      if (!allowed.includes(key)) throw failure("INVALID_DRAFT_PATCH", `\u4E0D\u80FD\u76F4\u63A5\u4FEE\u6539\u8349\u7A3F\u5B57\u6BB5\uFF1A${key}`);
    }
    if (Object.hasOwn(patch, "text") && typeof patch.text !== "string") throw new TypeError("\u8349\u7A3F\u6587\u5B57\u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u3002");
    if (preparedIdentity !== null) {
      for (const key of ["workspaceId", "agentPreset"]) {
        if (Object.hasOwn(patch, key) && (patch[key] ?? null) !== preparedIdentity[key]) {
          throw failure("PREPARED_SESSION_MISMATCH", "\u6B64\u8349\u7A3F\u5DF2\u51C6\u5907\u597D\u4E00\u4E2A\u4F1A\u8BDD\u3002\u5207\u6362\u5DE5\u4F5C\u533A\u6216\u6A21\u5F0F\u524D\uFF0C\u8BF7\u5148\u91CD\u7F6E\u5DF2\u51C6\u5907\u7684\u4F1A\u8BDD\u3002");
        }
      }
    }
    const normalized = { ...patch };
    for (const key of ["workspaceId", "agentPreset", "permissionPreset", "modelSelection"]) {
      if (Object.hasOwn(normalized, key)) normalized[key] ??= null;
    }
    publish({ ...normalized, status: state.sendUncertain ? "error" : "idle", error: state.sendUncertain ? state.error : null });
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
    if (additions.length > 0) publish({ files: [...state.files, ...additions], error: state.sendUncertain ? state.error : null, status: state.sendUncertain ? "error" : "idle" });
    return additions;
  }
  function removeFile(id) {
    ensureEditable();
    const removed = state.files.filter((item) => item.id === id);
    if (removed.length === 0) return false;
    revoke(removed);
    publish({ files: state.files.filter((item) => item.id !== id), error: state.sendUncertain ? state.error : null, status: state.sendUncertain ? "error" : "idle" });
    return true;
  }
  function resetPreparedSession() {
    ensureEditable();
    const previous = preparedHandle;
    preparedHandle = null;
    preparedIdentity = null;
    publish({ preparedSessionId: null, error: null, status: "idle", sendUncertain: false });
    return previous;
  }
  function submit(adapter) {
    try {
      ensureAlive();
      if (inFlight !== null) return inFlight;
      if (state.sendUncertain) throw failure("SEND_UNCERTAIN", "\u53D1\u9001\u7ED3\u679C\u5C1A\u672A\u786E\u8BA4\uFF0C\u8BF7\u5148\u6253\u5F00\u5DF2\u51C6\u5907\u7684\u4F1A\u8BDD\u6838\u5BF9\uFF0C\u907F\u514D\u91CD\u590D\u53D1\u9001\u3002");
      if (state.text.trim() === "" && state.files.length === 0) throw failure("DRAFT_EMPTY", "\u8BF7\u5148\u8F93\u5165\u6D88\u606F\u6216\u6DFB\u52A0\u6587\u4EF6\u3002");
      for (const key of ["create", "configure", "send", "open"]) {
        if (typeof adapter?.[key] !== "function") throw new TypeError(`\u53D1\u9001\u9002\u914D\u5668\u7F3A\u5C11 ${key}\u3002`);
      }
    } catch (error) {
      return Promise.reject(error);
    }
    const captured = state;
    const run = async () => {
      ensureAlive();
      let handle = preparedHandle;
      if (handle === null) {
        handle = await adapter.create(captured);
        ensureAlive();
        if (typeof handle?.sessionId !== "string" || handle.sessionId === "") throw failure("INVALID_SESSION_HANDLE", "\u5BBF\u4E3B\u6CA1\u6709\u8FD4\u56DE\u6709\u6548\u7684\u4F1A\u8BDD\u3002");
        preparedHandle = handle;
        preparedIdentity = { workspaceId: captured.workspaceId, agentPreset: captured.agentPreset };
        publish({ preparedSessionId: handle.sessionId });
      }
      publish({ status: "configuring" });
      await adapter.configure(handle, captured);
      ensureAlive();
      publish({ status: "sending" });
      const receipt = await adapter.send(handle, captured);
      if (receipt?.accepted !== true) throw failure("SEND_UNCERTAIN", "\u5BBF\u4E3B\u6CA1\u6709\u8FD4\u56DE\u63A5\u6536\u786E\u8BA4\uFF0C\u8BF7\u5148\u6253\u5F00\u4F1A\u8BDD\u6838\u5BF9\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\u3002");
      preparedHandle = null;
      preparedIdentity = null;
      const result = { ...receipt, accepted: true, sessionId: handle.sessionId, handle };
      if (disposed) return result;
      revoke(state.files);
      publish({ text: "", files: [], preparedSessionId: null, status: "opening", sendUncertain: false });
      try {
        await adapter.open(handle);
      } catch (openError) {
        result.openError = openError;
      }
      return result;
    };
    inFlight = Promise.resolve().then(run).then(
      (result) => {
        inFlight = null;
        if (!disposed) publish({ status: "idle", error: result.openError ? `\u6D88\u606F\u5DF2\u53D1\u9001\uFF0C\u4F46\u6253\u5F00\u4F1A\u8BDD\u5931\u8D25\uFF1A${messageOf(result.openError)}` : null });
        return result;
      },
      (error) => {
        inFlight = null;
        if (!disposed) publish({ status: "error", error: messageOf(error), sendUncertain: error?.code === "SEND_UNCERTAIN" || error?.code === "CREATE_UNCERTAIN" });
        throw error;
      }
    );
    publish({ status: preparedHandle === null ? "creating" : "configuring", error: null });
    return inFlight;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    listeners.clear();
    revoke(state.files);
    state = snapshot({ ...state, files: [], status: "disposed" });
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
    setText: (text4) => update({ text: text4 }),
    addFiles,
    removeFile,
    submit,
    resetPreparedSession,
    dispose
  });
}
function failure(code, message) {
  return Object.assign(new Error(message), { code });
}
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
function freezeData(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freezeData));
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeData(item)])));
}
function snapshot(value) {
  return Object.freeze({ ...value, files: Object.freeze([...value.files]), modelSelection: freezeData(value.modelSelection) });
}

// host-adapter.js
function createHostAdapter(ctx, options = {}) {
  const sessions = ctx.sessions ?? ctx.get?.("sessions");
  const workspaces = ctx.workspaces ?? ctx.get?.("workspaces");
  const conversation = ctx.conversation ?? ctx.get?.("conversation");
  const navigation = ctx.uiWorkspace ?? ctx.get?.("uiWorkspace");
  const remote = ctx.remote;
  const handles = /* @__PURE__ */ new Map();
  const uploadWaiters = /* @__PURE__ */ new Set();
  const uploadTimeoutMs = options.uploadTimeoutMs ?? 12e4;
  let disposed = false;
  let creationUncertain = null;
  function assertLive() {
    if (disposed) throw new Error("\u63D2\u4EF6\u5DF2\u5173\u95ED\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u9996\u9875\u3002");
  }
  function unwrap(result, operation) {
    if (result?.ok === true) return result.value;
    const error = new Error(`${operation}\uFF1A${result?.error?.message ?? "\u5BBF\u4E3B\u672A\u8FD4\u56DE\u6709\u6548\u7ED3\u679C"}${result?.error?.code ? ` (${result.error.code})` : ""}`);
    error.code = result?.error?.code ?? "HOST_RESPONSE_INVALID";
    error.hostRefusal = result?.ok === false && !["gateway/internal", "gateway/cancelled"].includes(error.code);
    throw error;
  }
  function stateFor(handle) {
    assertLive();
    const state = handles.get(handle?.sessionId);
    if (!state) throw new Error("\u8FD9\u6761\u5F85\u53D1\u9001\u4F1A\u8BDD\u5DF2\u91CA\u653E\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u9996\u9875\u3002");
    return state;
  }
  async function modelCatalog() {
    assertLive();
    return unwrap(await remote.session.modelCatalog(), "\u8BFB\u53D6\u6A21\u578B\u5931\u8D25");
  }
  async function permissionCatalog() {
    assertLive();
    return unwrap(await remote.permissionPresets.catalog(), "\u8BFB\u53D6\u6743\u9650\u9009\u9879\u5931\u8D25");
  }
  async function presetCatalog() {
    assertLive();
    return unwrap(await remote.agentPresets.list(), "\u8BFB\u53D6\u6A21\u5F0F\u5931\u8D25");
  }
  async function loadWorkspaces() {
    assertLive();
    const snapshot2 = workspaces.list.getSnapshot();
    if (snapshot2.phase !== void 0 && snapshot2.phase !== "ready") {
      if (typeof workspaces.refresh === "function") await workspaces.refresh();
    }
    return workspaces.list.getSnapshot().items;
  }
  async function validate(snapshot2) {
    if (!snapshot2.workspaceId) throw new Error("\u8BF7\u5148\u9009\u62E9\u5DE5\u4F5C\u533A\u3002");
    const list = await loadWorkspaces();
    if (!list.some((item) => item.workspaceId === snapshot2.workspaceId)) {
      throw new Error("\u6240\u9009\u5DE5\u4F5C\u533A\u5DF2\u4E0D\u53EF\u7528\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002");
    }
    const checks = [];
    if (snapshot2.agentPreset) checks.push(presetCatalog().then((roster) => {
      if (!roster.presets.some((item) => item.id === snapshot2.agentPreset && item.broken === void 0)) {
        throw new Error("\u6240\u9009\u6A21\u5F0F\u5DF2\u4E0D\u53EF\u7528\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002");
      }
    }));
    if (snapshot2.modelSelection) checks.push(modelCatalog().then((catalog) => {
      const choice = snapshot2.modelSelection;
      const group = catalog.groups.find((item) => item.id === choice.provider);
      const model = group?.models.find((item) => item.id === choice.model);
      if (!model) throw new Error("\u6240\u9009\u6A21\u578B\u5DF2\u4E0D\u53EF\u7528\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002");
      if (choice.reasoningEffort && !model.reasoning?.efforts.some((item) => item.id === choice.reasoningEffort)) {
        throw new Error("\u6240\u9009\u63A8\u7406\u7B49\u7EA7\u5DF2\u4E0D\u53EF\u7528\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002");
      }
    }));
    if (snapshot2.permissionPreset) checks.push(permissionCatalog().then((catalog) => {
      if (!catalog.options.some((item) => item.value === snapshot2.permissionPreset)) {
        throw new Error("\u6240\u9009\u6743\u9650\u5DF2\u4E0D\u53EF\u7528\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u3002");
      }
    }));
    await Promise.all(checks);
  }
  async function create(snapshot2) {
    assertLive();
    if (creationUncertain) throw creationUncertain;
    await validate(snapshot2);
    assertLive();
    let sessionId;
    try {
      sessionId = await sessions.create({
        workspaceId: snapshot2.workspaceId,
        ...snapshot2.agentPreset ? { agentPreset: snapshot2.agentPreset } : {}
      });
    } catch (cause) {
      const code = cause?.rpcError?.code ?? cause?.code;
      if (code && !["gateway/internal", "gateway/cancelled"].includes(code)) throw cause;
      creationUncertain = Object.assign(new Error("\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u65E0\u6CD5\u786E\u8BA4\u4F1A\u8BDD\u662F\u5426\u5DF2\u5EFA\u7ACB\u3002\u8BF7\u5148\u68C0\u67E5\u4F1A\u8BDD\u5217\u8868\uFF0C\u518D\u5237\u65B0\u63D2\u4EF6\uFF0C\u907F\u514D\u91CD\u590D\u521B\u5EFA\u3002", { cause }), { code: "CREATE_UNCERTAIN" });
      throw creationUncertain;
    }
    assertLive();
    const state = {
      reference: null,
      ready: null,
      retryReady: false,
      workspaceId: snapshot2.workspaceId,
      agentPreset: snapshot2.agentPreset ?? null,
      attachments: /* @__PURE__ */ new Map(),
      sendPromise: null,
      accepted: false,
      uncertain: null
    };
    try {
      replaceReference(state, sessionId);
    } catch (error) {
      state.ready = Promise.reject(error);
      state.ready.catch(() => {
      });
    }
    handles.set(sessionId, state);
    return { sessionId };
  }
  function replaceReference(state, sessionId) {
    assertLive();
    const reference = sessions.retain(sessionId, { source: "controllerOperation" });
    const previous = state.reference;
    state.reference = reference;
    state.ready = reference.ready;
    state.ready.catch(() => {
    });
    state.retryReady = false;
    previous?.release();
  }
  async function readyBinding(state, sessionId) {
    assertLive();
    if (state.retryReady) replaceReference(state, sessionId);
    try {
      return await state.ready;
    } catch (error) {
      state.retryReady = true;
      throw error;
    }
  }
  async function configure(handle, snapshot2) {
    const state = stateFor(handle);
    if (state.accepted) return;
    if (state.uncertain) throw state.uncertain;
    if (state.workspaceId !== snapshot2.workspaceId || state.agentPreset !== (snapshot2.agentPreset ?? null)) {
      throw new Error("\u8FD9\u6761\u5F85\u53D1\u9001\u4F1A\u8BDD\u5DF2\u786E\u5B9A\u5DE5\u4F5C\u533A\u548C\u6A21\u5F0F\uFF1B\u8BF7\u6062\u590D\u539F\u9009\u62E9\u540E\u91CD\u8BD5\uFF0C\u6216\u91CD\u65B0\u5F00\u59CB\u8349\u7A3F\u3002");
    }
    await validate(snapshot2);
    assertLive();
    await readyBinding(state, handle.sessionId);
    assertLive();
    if (snapshot2.modelSelection) {
      const model = snapshot2.modelSelection;
      unwrap(await remote.session.selectModel({
        sessionId: handle.sessionId,
        provider: model.provider,
        model: model.model,
        ...model.reasoningEffort ? { reasoningEffort: model.reasoningEffort } : {}
      }), "\u8BBE\u7F6E\u6A21\u578B\u5931\u8D25");
      assertLive();
    }
    if (snapshot2.permissionPreset) {
      const result = unwrap(await remote.commands.execute(handle.sessionId, `/permission ${snapshot2.permissionPreset}`, []), "\u8BBE\u7F6E\u6743\u9650\u5931\u8D25");
      if (result === void 0) throw new Error("\u5BBF\u4E3B\u6CA1\u6709\u63D0\u4F9B\u6743\u9650\u5207\u6362\u547D\u4EE4\uFF0C\u6D88\u606F\u5C1A\u672A\u53D1\u9001\u3002");
      if (result.result?.kind === "error") throw new Error(`\u8BBE\u7F6E\u6743\u9650\u5931\u8D25\uFF1A${result.result.text}`);
    }
  }
  function waitForUploads(descriptors) {
    const files = descriptors.filter((item) => item.kind === "file");
    if (files.length === 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let stopped = false;
      let unsubscribe = () => {
      };
      let timer;
      const finish = (error) => {
        if (stopped) return;
        stopped = true;
        unsubscribe();
        clearTimeout(timer);
        uploadWaiters.delete(cancel);
        error ? reject(error) : resolve();
      };
      const cancel = () => finish(new Error("\u63D2\u4EF6\u5DF2\u5173\u95ED\uFF0C\u9644\u4EF6\u5C1A\u672A\u53D1\u9001\u3002"));
      uploadWaiters.add(cancel);
      const inspect = () => {
        if (disposed) return finish(new Error("\u63D2\u4EF6\u5DF2\u5173\u95ED\uFF0C\u9644\u4EF6\u5C1A\u672A\u53D1\u9001\u3002"));
        const uploads = conversation.fileUploads.getSnapshot();
        const failed = files.map((item) => uploads[item.id]).find((item) => item?.status === "error");
        if (failed) return finish(new Error(`\u9644\u4EF6\u4E0A\u4F20\u5931\u8D25\uFF1A${failed.message ?? "\u8BF7\u91CD\u8BD5"}`));
        if (files.every((item) => uploads[item.id]?.status === "ready")) finish();
      };
      unsubscribe = conversation.fileUploads.subscribe(inspect);
      timer = setTimeout(() => finish(new Error("\u9644\u4EF6\u4E0A\u4F20\u8D85\u65F6\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\uFF0C\u53EF\u4EE5\u91CD\u8BD5\u3002")), uploadTimeoutMs);
      inspect();
    });
  }
  async function prepareAttachments(state, sessionId, snapshot2) {
    const selected = snapshot2.files ?? [];
    const selectedIds = new Set(selected.map((item) => item.id));
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
      } else if (descriptor.kind === "file" && conversation.fileUploads.getSnapshot()[descriptor.id]?.status === "error") {
        conversation.retryFileUpload(sessionId, descriptor.id);
      }
    }
    const descriptors = selected.map((item) => state.attachments.get(item.id));
    await waitForUploads(descriptors);
    assertLive();
    const result = await conversation.serializeDraftAttachments(descriptors.map((item) => item.id));
    return result.attachments;
  }
  function send(handle, snapshot2) {
    const state = stateFor(handle);
    if (state.accepted) return Promise.resolve({ accepted: true, sessionId: handle.sessionId });
    if (state.uncertain) return Promise.reject(state.uncertain);
    if (state.sendPromise) return state.sendPromise;
    state.sendPromise = (async () => {
      const binding = await readyBinding(state, handle.sessionId);
      assertLive();
      const parts = await prepareAttachments(state, handle.sessionId, snapshot2);
      assertLive();
      const content = [...parts, ...snapshot2.text === "" ? [] : [{ type: "text", text: snapshot2.text }]];
      if (content.length === 0) throw new Error("\u8BF7\u5148\u8F93\u5165\u5185\u5BB9\u6216\u6DFB\u52A0\u9644\u4EF6\u3002");
      let result;
      try {
        if (/^\s*\//.test(snapshot2.text)) {
          const command = await remote.commands.execute(handle.sessionId, snapshot2.text.trimStart(), parts);
          const outcome = unwrap(command, "\u6267\u884C\u547D\u4EE4\u5931\u8D25");
          if (outcome !== void 0) {
            if (outcome.result?.kind === "error") throw Object.assign(new Error(outcome.result.text), { code: "COMMAND_REJECTED", hostRefusal: true });
            state.accepted = true;
            cleanupAttachments(state);
            return { accepted: true, sessionId: handle.sessionId, command: true };
          }
          throw Object.assign(new Error("\u547D\u4EE4\u4E0D\u5B58\u5728\u6216\u683C\u5F0F\u6709\u8BEF\uFF0C\u8349\u7A3F\u5DF2\u4FDD\u7559\uFF0C\u8BF7\u4FEE\u6539\u540E\u91CD\u8BD5\u3002"), { code: "COMMAND_NOT_FOUND", hostRefusal: true });
        }
        result = await binding.session.prompt(content, "queue");
        const value = unwrap(result, "\u53D1\u9001\u5931\u8D25");
        if (value?.accepted !== true) throw new Error("\u5BBF\u4E3B\u672A\u786E\u8BA4\u6D88\u606F\u5DF2\u63A5\u6536\u3002");
      } catch (cause) {
        if (cause?.hostRefusal === true) throw cause;
        const error = new Error("\u8FDE\u63A5\u4E2D\u65AD\uFF0C\u65E0\u6CD5\u786E\u8BA4\u6D88\u606F\u662F\u5426\u5DF2\u63A5\u6536\u3002\u8BF7\u6253\u5F00\u8BE5\u4F1A\u8BDD\u68C0\u67E5\uFF0C\u907F\u514D\u91CD\u590D\u53D1\u9001\u3002", { cause });
        error.code = "SEND_UNCERTAIN";
        state.uncertain = error;
        throw error;
      }
      state.accepted = true;
      cleanupAttachments(state);
      return { accepted: true, sessionId: handle.sessionId };
    })().finally(() => {
      state.sendPromise = null;
    });
    return state.sendPromise;
  }
  function cleanupAttachments(state) {
    for (const descriptor of state.attachments.values()) {
      try {
        conversation.releaseDraftAttachment(descriptor.id);
      } catch (error) {
        options.onCleanupError?.(error);
      }
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
    if (!handle?.sessionId) throw new Error("\u627E\u4E0D\u5230\u8981\u6253\u5F00\u7684\u4F1A\u8BDD\u3002");
    navigation.openSession(handle.sessionId);
    if (handles.get(handle.sessionId)?.accepted) release(handle);
  }
  return {
    create,
    configure,
    send,
    open,
    release,
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
    loadPresets: async () => (await presetCatalog()).presets.filter((item) => item.broken === void 0),
    loadWorkspaces,
    async loadDefaults() {
      const [models, permissions, presets] = await Promise.all([modelCatalog(), permissionCatalog(), presetCatalog()]);
      return {
        modelSelection: models.default ?? null,
        permissionPreset: permissions.defaultPreset ?? null,
        agentPreset: presets.presets.find((item) => item.isDefault && item.broken === void 0)?.id ?? null,
        workspaceId: currentWorkspaceId()
      };
    },
    dispose() {
      for (const cancel of [...uploadWaiters]) cancel();
      for (const sessionId of [...handles.keys()]) release({ sessionId });
      disposed = true;
    }
  };
  function currentWorkspaceId() {
    const snapshot2 = sessions.list?.getSnapshot();
    const byId = snapshot2?.byId ?? {};
    const current = Object.values(byId).find((item) => (item.retainedBy?.mainView ?? 0) > 0);
    if (!current) return null;
    const id = current.id ?? current.sessionId;
    const items = workspaces.list.getSnapshot().items;
    return items.find((item) => item.sessionIds?.includes(id))?.workspaceId ?? items.find((item) => current.cwd && item.path === current.cwd)?.workspaceId ?? null;
  }
}

// native-controls.js
function createNativeControls(ctx, React11, helpers = {}) {
  const h11 = React11.createElement;
  const VOICE_SLOT = "conversation.input.activity";
  const cache = /* @__PURE__ */ new WeakMap();
  let nextVoiceId = 0;
  const noop = () => {
  };
  const identity = (value) => value;
  const report = (error, callback) => {
    const message = error instanceof Error ? error.message : String(error);
    if (typeof callback === "function") callback(message);
    else if (typeof helpers.onError === "function") helpers.onError(message);
    return message;
  };
  function unavailable(message) {
    return { available: false, reason: message };
  }
  function entries() {
    try {
      return typeof ctx.slots?.entries === "function" ? ctx.slots.entries(VOICE_SLOT) : [];
    } catch (_) {
      return [];
    }
  }
  function resolveVoice(list) {
    const entry = list.find((candidate) => candidate.locale === "voice-input");
    if (!entry) return unavailable("\u8BED\u97F3\u63D2\u4EF6\u5C1A\u672A\u542F\u7528\u3002\u8BF7\u5148\u5728\u63D2\u4EF6\u9875\u542F\u7528\u8BED\u97F3\u8F93\u5165\u5E76\u5B8C\u6210\u8BED\u97F3\u8D44\u6E90\u8BBE\u7F6E\u3002");
    if (cache.has(entry)) return cache.get(entry);
    let result;
    try {
      if (!entry.component || typeof entry.inject !== "function") {
        throw new Error("\u5F53\u524D\u8BED\u97F3\u63D2\u4EF6\u63A5\u53E3\u4E0E\u9996\u9875\u4E0D\u517C\u5BB9\uFF0C\u8BF7\u66F4\u65B0\u9996\u9875\u63D2\u4EF6\u6216\u8FD4\u56DE\u4F1A\u8BDD\u4F7F\u7528\u8BED\u97F3\u8F93\u5165\u3002");
      }
      const actions = entry.inject();
      const source2 = actions?.hooks?.speechReadiness;
      if (typeof actions?.createRecording !== "function" || typeof actions?.transcribe !== "function" || typeof actions?.openSettings !== "function" || typeof source2?.getSnapshot !== "function" || typeof source2?.subscribe !== "function") {
        throw new Error("\u5F53\u524D\u8BED\u97F3\u63D2\u4EF6\u63A5\u53E3\u5DF2\u53D8\u5316\uFF0C\u9996\u9875\u8BED\u97F3\u6682\u4E0D\u53EF\u7528\u3002\u8BF7\u66F4\u65B0\u9996\u9875\u63D2\u4EF6\u3002");
      }
      const { hooks, ...actionProps } = actions;
      const hookProps = {};
      for (const [name, store] of Object.entries(hooks)) {
        if (typeof store?.getSnapshot !== "function" || typeof store?.subscribe !== "function") {
          throw new Error("\u5F53\u524D\u8BED\u97F3\u63D2\u4EF6\u7684\u72B6\u6001\u63A5\u53E3\u4E0E\u9996\u9875\u4E0D\u517C\u5BB9\uFF0C\u8BF7\u66F4\u65B0\u9996\u9875\u63D2\u4EF6\u3002");
        }
        const subscribe = (listener) => store.subscribe(listener);
        const getSnapshot = () => store.getSnapshot();
        hookProps["use" + name[0].toUpperCase() + name.slice(1)] = function useVoiceSource(select = identity) {
          return select(React11.useSyncExternalStore(subscribe, getSnapshot, getSnapshot));
        };
      }
      result = {
        available: true,
        id: ++nextVoiceId,
        component: entry.component,
        props: {
          ...actionProps,
          ...hookProps,
          t: ctx.locale.bind(entry.locale)
        }
      };
    } catch (error) {
      result = unavailable(error instanceof Error ? error.message : String(error));
    }
    cache.set(entry, result);
    return result;
  }
  function useSlotEntries(key) {
    const subscribe = React11.useCallback((listener) => {
      if (typeof ctx.slots?.subscribe !== "function") return noop;
      try {
        return ctx.slots.subscribe(key, listener);
      } catch (_) {
        return noop;
      }
    }, [key]);
    const getSnapshot = React11.useCallback(() => {
      try {
        return ctx.slots.entries(key);
      } catch (_) {
        return [];
      }
    }, [key]);
    const empty = React11.useRef([]);
    const read2 = React11.useCallback(() => {
      const value = getSnapshot();
      if (value.length === empty.current.length && value.every((entry, index) => entry === empty.current[index])) return empty.current;
      empty.current = value;
      return value;
    }, [getSnapshot]);
    return React11.useSyncExternalStore(subscribe, read2, read2);
  }
  class VoiceBoundary extends React11.Component {
    constructor(props) {
      super(props);
      this.state = { error: null };
    }
    static getDerivedStateFromError(error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
    componentDidCatch(error) {
      report(error, this.props.onError);
    }
    render() {
      if (this.state.error) {
        return h11(
          "span",
          { role: "alert", className: "cgpt-home-control-error" },
          "\u9996\u9875\u8BED\u97F3\u6682\u4E0D\u53EF\u7528\uFF1A" + this.state.error
        );
      }
      return this.props.children;
    }
  }
  function VoiceControl({
    inputActions,
    controller,
    textareaRef,
    locked = false,
    onActiveChange = noop,
    onError,
    draftKey = "home",
    className = ""
  }) {
    const list = useSlotEntries(VOICE_SLOT);
    const voice = React11.useMemo(() => resolveVoice(list), [list]);
    const [notice, setNotice] = React11.useState("");
    const owner = React11.useRef({ locked, onError });
    owner.current = { locked, onError };
    const localActions = React11.useMemo(() => {
      if (inputActions) return inputActions;
      if (typeof controller?.getSnapshot !== "function" || typeof controller?.setText !== "function") return null;
      return createTextareaInputActions({
        textareaRef,
        getText: () => controller.getSnapshot().text,
        getRevision: () => {
          const snapshot2 = controller.getSnapshot();
          return snapshot2.textRevision ?? snapshot2.draftRev ?? snapshot2;
        },
        setText: (text4) => {
          try {
            controller.setText(text4);
            return true;
          } catch (error) {
            report(error, owner.current.onError);
            return false;
          }
        },
        isLocked: () => owner.current.locked || ["creating", "configuring", "sending", "opening"].includes(controller.getSnapshot().status)
      });
    }, [inputActions, controller, textareaRef]);
    const validInput = typeof localActions?.captureInsertion === "function" && typeof localActions?.insertText === "function";
    React11.useEffect(() => {
      setNotice("");
    }, [list]);
    const reason = voice.available && validInput ? null : voice.available ? "\u9996\u9875\u8BED\u97F3\u8349\u7A3F\u63A5\u53E3\u672A\u5C31\u7EEA\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u9996\u9875\u3002" : voice.reason;
    if (reason) {
      return h11(
        "span",
        { className: "cgpt-home-voice-unavailable " + className },
        h11("button", {
          type: "button",
          title: reason,
          "aria-label": "\u8BED\u97F3\u8F93\u5165\u4E0D\u53EF\u7528",
          disabled: locked,
          onClick: () => {
            setNotice(reason);
            report(reason, onError);
          }
        }, "\u8BED\u97F3"),
        notice ? h11("span", { role: "status", className: "cgpt-home-control-error" }, notice) : null
      );
    }
    return h11(
      "span",
      { className: "cgpt-home-native-voice " + className },
      h11(
        VoiceBoundary,
        { key: draftKey + ":" + voice.id, onError },
        h11(voice.component, {
          ...voice.props,
          sessionId: void 0,
          inputActions: localActions,
          locked,
          onActiveChange
        })
      )
    );
  }
  function createTextareaInputActions({
    textareaRef,
    getText,
    setText,
    getRevision,
    isLocked = () => false
  }) {
    const owner = /* @__PURE__ */ Symbol("home-textarea");
    return {
      captureInsertion() {
        const text4 = String(getText() ?? "");
        const element = textareaRef?.current;
        return {
          start: element?.selectionStart ?? text4.length,
          end: element?.selectionEnd ?? text4.length,
          draftRev: getRevision(),
          owner
        };
      },
      insertText(text4, span) {
        if (isLocked() || !span || span.owner !== owner || span.draftRev !== getRevision()) return false;
        const before = String(getText() ?? "");
        if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.start < 0 || span.end < span.start || span.end > before.length) return false;
        const insertion = String(text4);
        const next = before.slice(0, span.start) + insertion + before.slice(span.end);
        if (setText(next) === false) return false;
        const caret = span.start + insertion.length;
        queueMicrotask(() => {
          const element = textareaRef?.current;
          if (element?.isConnected && element.value === next) {
            element.focus();
            element.setSelectionRange(caret, caret);
          }
        });
        return true;
      }
    };
  }
  function getCapabilities() {
    const voice = resolveVoice(entries());
    return { voice: { available: voice.available, reason: voice.reason ?? null } };
  }
  function BrandMark({ size = 64, className = "" }) {
    const list = useSlotEntries("sidebar.brand.mark");
    const entry = list.find((candidate) => candidate.component?.name === "OfficialBrandMark" || String(candidate.registrant ?? "").includes("ui-brand-official"));
    return h11(
      "span",
      { className: "cgpt-home-brand " + className, "aria-hidden": true },
      entry ? h11(entry.component, { size }) : h11("span", { style: { fontSize: size / 3 } }, "DeepSeek")
    );
  }
  return { VoiceControl, BrandMark, createTextareaInputActions, getCapabilities };
}

// home-ui.js
var import_react = __toESM(require("react"), 1);
var h = import_react.default.createElement;
var BUSY = /* @__PURE__ */ new Set(["creating", "configuring", "sending", "opening"]);
var EMPTY = { workspaces: [], models: [], permissions: [], presets: [] };
var msg = (e) => e instanceof Error ? e.message : String(e);
var asArray = (x, key) => Array.isArray(x) ? x : x?.[key] || [];
var permissionNames = { "read-only": "\u4EC5\u53EF\u67E5\u770B", "workspace-write": "\u5DE5\u4F5C\u533A\u5185\u4FEE\u6539", "danger-full-access": "\u5B8C\u5168\u6743\u9650", auto: "\u81EA\u52A8\u5BA1\u67E5" };
var presetNames = { default: "\u6807\u51C6\u6A21\u5F0F", standard: "\u6807\u51C6\u6A21\u5F0F", std: "\u6807\u51C6\u6A21\u5F0F", cordis: "\u521B\u9020\u6A21\u5F0F", ptc: "PTC \u6A21\u5F0F", minimal: "\u6781\u7B80\u6A21\u5F0F" };
var COMMANDS = [["/goal ", "\u76EE\u6807", "\u8BBE\u7F6E\u8981\u6301\u7EED\u63A8\u8FDB\u7684\u76EE\u6807"], ["/plan ", "\u8BA1\u5212", "\u5148\u8BA8\u8BBA\u548C\u89C4\u5212\u4EFB\u52A1"], ["/model", "\u6A21\u578B", "\u6253\u5F00\u9996\u9875\u6A21\u578B\u9009\u62E9"], ["/permission", "\u6743\u9650", "\u6253\u5F00\u9996\u9875\u6743\u9650\u9009\u62E9"]];
function Glyph({ name, size = 18 }) {
  const paths = { folder: "M2 5h6l2 2h8v10H2z", chevron: "m6 8 4 4 4-4", plus: "M10 3v14M3 10h14", send: "M10 16V4m-5 5 5-5 5 5", shield: "m10 2 7 3v5c0 4-7 8-7 8S3 14 3 10V5z", close: "m5 5 10 10M15 5 5 15", at: "M14 10v3c0 3 4 2 4-3a8 8 0 1 0-3 6M14 10a4 4 0 1 0-8 0 4 4 0 0 0 8 0", file: "M5 2h7l4 4v12H5zM12 2v5h4", check: "m4 10 4 4 8-9", home: "m3 9 7-6 7 6M5 8v9h10V8M8 17v-4h4v4", mic: "M7 4a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM4 9v1a6 6 0 0 0 12 0V9M10 16v3" };
  return h("svg", { width: size, height: size, viewBox: "0 0 20 20", fill: "none", "aria-hidden": true, style: { flex: "none" } }, h("path", { d: paths[name] || paths.file, stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" }));
}
function Menu({ id, label, icon, children, open, setOpen, disabled = false, align = "left", above = false, wide = false }) {
  const root = import_react.default.useRef(null), trigger = import_react.default.useRef(null);
  const accessibleLabel = label || { plus: "\u6DFB\u52A0\u6587\u4EF6\u6216\u8C03\u7528\u6307\u4EE4", reference: "\u5F15\u7528\u6587\u4EF6\u6216\u5BF9\u8BDD" }[id] || id;
  import_react.default.useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (!root.current?.contains(e.target)) setOpen(null);
    };
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(null);
        trigger.current?.focus();
      }
    };
    globalThis.document?.addEventListener("pointerdown", close);
    globalThis.document?.addEventListener("keydown", key);
    return () => {
      globalThis.document?.removeEventListener("pointerdown", close);
      globalThis.document?.removeEventListener("keydown", key);
    };
  }, [open, setOpen]);
  return h(
    "span",
    { className: "cgpt-menu-anchor", ref: root },
    h("button", { ref: trigger, type: "button", className: "cgpt-control", "aria-label": accessibleLabel, "aria-haspopup": "menu", "aria-expanded": !!open, disabled, onClick: () => setOpen(open ? null : id) }, icon && h(Glyph, { name: icon }), h("span", { className: "cgpt-control-label" }, label), h(Glyph, { name: "chevron", size: 13 })),
    open ? h("div", { className: "cgpt-menu" + (wide ? " cgpt-menu-wide" : ""), "data-align": align, "data-above": above || void 0, role: "menu", "aria-label": typeof label === "string" ? label : id, onKeyDown: (e) => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const items = Array.from(e.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled),[role="menuitemradio"]:not(:disabled)'));
      if (!items.length) return;
      e.preventDefault();
      const n = items.indexOf(globalThis.document.activeElement);
      items[e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowDown" ? (n + 1) % items.length : (n + items.length - 1) % items.length]?.focus();
    } }, children) : null
  );
}
function Item({ selected, onClick, children, detail, disabled = false }) {
  return h("button", { type: "button", role: selected === void 0 ? "menuitem" : "menuitemradio", "aria-checked": selected, disabled, className: "cgpt-menu-item", onClick }, h("span", { className: "cgpt-menu-item-body" }, children, detail && h("small", null, detail)), selected && h(Glyph, { name: "check", size: 15 }));
}
function HomePage({ controller, adapter, VoiceControl, BrandMark }) {
  const state = import_react.default.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [resetConfirm, setResetConfirm] = import_react.default.useState(false);
  const [catalogs, setCatalogs] = import_react.default.useState(EMPTY), [errors, setErrors] = import_react.default.useState({}), [loading, setLoading] = import_react.default.useState(true), [menu, setMenu] = import_react.default.useState(null), [query, setQuery] = import_react.default.useState(""), [notice, setNotice] = import_react.default.useState(""), [voiceActive, setVoiceActive] = import_react.default.useState(false), [permissionConfirm, setPermissionConfirm] = import_react.default.useState(null), [ack, setAck] = import_react.default.useState(false), [referenceOpen, setReferenceOpen] = import_react.default.useState(false), [referencePath, setReferencePath] = import_react.default.useState("");
  const textareaRef = import_react.default.useRef(null), fileRef = import_react.default.useRef(null), fileReference = import_react.default.useRef(false), mounted = import_react.default.useRef(false), composing = import_react.default.useRef(false);
  const stateRef = import_react.default.useRef(state);
  stateRef.current = state;
  const busy = BUSY.has(state.status);
  const report = import_react.default.useCallback((e) => setNotice(msg(e)), []);
  const update = (patch) => {
    try {
      controller.update(patch);
      setNotice("");
      return true;
    } catch (e) {
      report(e);
      return false;
    }
  };
  const refresh = import_react.default.useCallback(async () => {
    setLoading(true);
    const keys = ["workspaces", "models", "permissions", "presets"];
    const methods = ["loadWorkspaces", "loadModels", "loadPermissions", "loadPresets"];
    const results = await Promise.allSettled(methods.map((method) => Promise.resolve().then(() => adapter[method]())));
    if (!mounted.current) return;
    const next = {}, failures = {};
    results.forEach((r, i) => {
      if (r.status === "fulfilled") next[keys[i]] = asArray(r.value, { models: "groups", permissions: "options", presets: "presets", workspaces: "items" }[keys[i]]);
      else failures[keys[i]] = msg(r.reason);
    });
    setCatalogs((previous) => ({ ...previous, ...next }));
    setErrors(failures);
    setLoading(false);
    try {
      const defaults = await adapter.loadDefaults?.() || {};
      if (!mounted.current) return;
      const current = controller.getSnapshot(), patch = {};
      for (const key of ["agentPreset", "modelSelection", "permissionPreset"]) if (current[key] == null && defaults[key] != null) patch[key] = defaults[key];
      if (current.workspaceId == null) patch.workspaceId = defaults.workspaceId || next.workspaces?.[0]?.workspaceId;
      if (Object.keys(patch).length && !BUSY.has(current.status)) controller.update(patch);
    } catch (e) {
      if (mounted.current) setNotice(msg(e));
    }
  }, [adapter, controller]);
  import_react.default.useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);
  import_react.default.useLayoutEffect(() => {
    const node = textareaRef.current;
    if (node) {
      node.style.height = "auto";
      node.style.height = Math.min(220, Math.max(66, node.scrollHeight)) + "px";
    }
  }, [state.text]);
  import_react.default.useEffect(() => {
    if (!busy && !voiceActive) textareaRef.current?.focus();
  }, []);
  const submit = async () => {
    if (busy || voiceActive || stateRef.current.sendUncertain) return;
    setMenu(null);
    setNotice("");
    try {
      const result = await controller.submit(adapter);
      if (result?.openError && mounted.current) setNotice("\u6D88\u606F\u5DF2\u63A5\u53D7\uFF0C\u4F46\u6253\u5F00\u4F1A\u8BDD\u5931\u8D25\uFF1A" + msg(result.openError));
    } catch (e) {
      if (mounted.current) report(e);
    }
  };
  const insert = (text4) => {
    const node = textareaRef.current, snapshot2 = controller.getSnapshot();
    let start = node?.selectionStart ?? snapshot2.text.length;
    const end = node?.selectionEnd ?? start;
    const trigger = snapshot2.text.slice(0, start).match(/(?:^|\s)(@[^\s@]*)$/u);
    if (trigger) start -= trigger[1].length;
    try {
      controller.setText(snapshot2.text.slice(0, start) + text4 + snapshot2.text.slice(end));
      setMenu(null);
      setTimeout(() => {
        node?.focus();
        node?.setSelectionRange(start + text4.length, start + text4.length);
      }, 0);
    } catch (e) {
      report(e);
    }
  };
  const workspaces = catalogs.workspaces, presets = catalogs.presets, permissions = catalogs.permissions;
  const workspace = workspaces.find((w) => w.workspaceId === state.workspaceId);
  const preset = presets.find((p) => p.id === state.agentPreset);
  const modelGroup = catalogs.models.find((g) => g.id === state.modelSelection?.provider);
  const model = modelGroup?.models.find((m) => m.id === state.modelSelection?.model);
  const effort = model?.reasoning?.efforts?.find((e) => e.id === (state.modelSelection?.reasoningEffort ?? model.reasoning.defaultEffort));
  const modelLabel = model?.name || "\u6A21\u578B \xB7 \u6CBF\u7528\u9ED8\u8BA4";
  const workspaceLabel = workspace?.title || workspace?.name || workspace?.path?.split("/").filter(Boolean).pop() || "\u9009\u62E9\u5DE5\u4F5C\u533A";
  const presetLabel = preset?.displayName || preset?.name || presetNames[state.agentPreset] || state.agentPreset || "\u6A21\u5F0F \xB7 \u6CBF\u7528\u9ED8\u8BA4";
  const permissionLabel = permissionNames[state.permissionPreset] || permissions.find((p) => p.value === state.permissionPreset)?.name || "\u6743\u9650 \xB7 \u6CBF\u7528\u9ED8\u8BA4";
  const choosePermission = (value) => {
    if (value === "danger-full-access" || value === "auto") {
      setPermissionConfirm(value);
      setAck(false);
      setMenu(null);
    } else {
      update({ permissionPreset: value });
      setMenu(null);
    }
  };
  const commandRows = () => COMMANDS.map(([command, label, detail]) => h(Item, { key: command, detail, onClick: () => {
    if (command === "/model" || command === "/permission") {
      if (controller.getSnapshot().text === "/") update({ text: "" });
      setMenu(command === "/model" ? "model" : "permission");
      return;
    }
    const current = controller.getSnapshot().text;
    update({ text: command + current.replace(/^\s*\/(?:\S*\s*)?/u, "") });
    setMenu(null);
    textareaRef.current?.focus();
  } }, label));
  const addFiles = (files) => {
    try {
      controller.addFiles(Array.from(files || []));
      setNotice("");
    } catch (e) {
      report(e);
    }
  };
  const statusText = { creating: "\u6B63\u5728\u521B\u5EFA\u4F1A\u8BDD\u2026", configuring: "\u6B63\u5728\u5E94\u7528\u8BBE\u7F6E\u548C\u51C6\u5907\u9644\u4EF6\u2026", sending: "\u6B63\u5728\u53D1\u9001\u2026", opening: "\u6B63\u5728\u6253\u5F00\u4F1A\u8BDD\u2026" }[state.status];
  const error = state.error || notice || (Object.keys(errors).length ? "\u90E8\u5206\u9009\u9879\u8BFB\u53D6\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u8BFB\u53D6\u3002" : "");
  return h(
    "section",
    { className: "cgpt-home", "data-cgpt-home": "", "aria-label": "\u9996\u9875\u8349\u7A3F" },
    h(
      "div",
      { className: "cgpt-home-stack" },
      h("div", { className: "cgpt-home-headline" }, BrandMark ? h(BrandMark, { size: 34 }) : null, h("span", null, "\u63A2\u7D22\u672A\u81F3\u4E4B\u5883"), h("span", { className: "cgpt-preview" }, "\u9884\u89C8\u7248")),
      h(
        "div",
        { className: "cgpt-home-selectors" },
        h(
          Menu,
          { id: "workspace", label: workspaceLabel, icon: "folder", open: menu === "workspace", setOpen: setMenu, disabled: busy },
          errors.workspaces ? h("div", { className: "cgpt-menu-error" }, errors.workspaces) : null,
          workspaces.map((w) => h(Item, { key: w.workspaceId, selected: w.workspaceId === state.workspaceId, detail: w.path, onClick: () => {
            update({ workspaceId: w.workspaceId });
            setMenu(null);
          } }, w.title || w.name || w.path)),
          !workspaces.length ? h("div", { className: "cgpt-menu-empty" }, loading ? "\u6B63\u5728\u8BFB\u53D6\u5DE5\u4F5C\u533A\u2026" : "\u8BF7\u5148\u5728\u5DE6\u4FA7\u6DFB\u52A0\u5DE5\u4F5C\u533A") : null
        ),
        h(
          Menu,
          { id: "preset", label: presetLabel, open: menu === "preset", setOpen: setMenu, disabled: busy },
          errors.presets ? h("div", { className: "cgpt-menu-error" }, errors.presets) : null,
          presets.map((p) => h(Item, { key: p.id, selected: p.id === state.agentPreset, detail: p.description, onClick: () => {
            update({ agentPreset: p.id });
            setMenu(null);
          } }, p.displayName || p.name || presetNames[p.id] || p.id))
        )
      ),
      h(
        "div",
        { className: "cgpt-home-card", "data-cgpt-home-card": "", onDragOver: (e) => {
          if (!busy && e.dataTransfer?.types?.includes("Files")) e.preventDefault();
        }, onDrop: (e) => {
          if (!busy && e.dataTransfer?.files?.length) {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }
        } },
        state.files.length ? h("div", { className: "cgpt-file-list" }, state.files.map((entry) => h("div", { className: "cgpt-file", key: entry.id }, entry.previewUrl && entry.file?.type?.startsWith("image/") ? h("img", { src: entry.previewUrl, alt: "" }) : h(Glyph, { name: "file", size: 22 }), h("span", null, entry.file?.name || "\u6587\u4EF6", h("small", null, Math.ceil((entry.file?.size || 0) / 1024) + " KB")), h("button", { type: "button", "aria-label": "\u79FB\u9664 " + (entry.file?.name || "\u6587\u4EF6"), disabled: busy, onClick: () => controller.removeFile(entry.id) }, h(Glyph, { name: "close", size: 13 }))))) : null,
        h("textarea", { ref: textareaRef, className: "cgpt-home-input", "aria-label": "\u9996\u9875\u6D88\u606F", placeholder: "\u63CF\u8FF0\u4F60\u60F3\u8981\u6784\u5EFA\u7684\u5185\u5BB9\uFF0C/ \u8C03\u7528\u6307\u4EE4\uFF0C@ \u5F15\u7528\u6587\u4EF6\u6216\u5BF9\u8BDD", value: state.text, disabled: busy, rows: 2, onCompositionStart: () => {
          composing.current = true;
        }, onCompositionEnd: () => {
          composing.current = false;
        }, onChange: (e) => {
          try {
            controller.setText(e.target.value);
          } catch (error2) {
            report(error2);
          }
        }, onPaste: (e) => {
          const files = Array.from(e.clipboardData?.files || []);
          if (files.length) {
            e.preventDefault();
            addFiles(files);
          }
        }, onKeyDown: (e) => {
          if (e.key === "Enter" && !e.shiftKey && !composing.current && !e.nativeEvent?.isComposing && e.keyCode !== 229) {
            e.preventDefault();
            submit();
          } else if (e.key === "/" && !state.text) setMenu("plus");
          else if (e.key === "@") setMenu("reference");
          else if (e.key === "Escape") setMenu(null);
        } }),
        h(
          "div",
          { className: "cgpt-home-toolbar" },
          h(
            "div",
            { className: "cgpt-toolbar-left" },
            h(
              Menu,
              { id: "plus", label: "", icon: "plus", open: menu === "plus", setOpen: setMenu, disabled: busy, above: true },
              h(Item, { onClick: () => {
                fileReference.current = false;
                fileRef.current?.click();
                setMenu(null);
              } }, "\u6DFB\u52A0\u6587\u4EF6"),
              h("div", { className: "cgpt-menu-divider" }),
              commandRows()
            ),
            h(
              Menu,
              { id: "permission", label: permissionLabel, icon: "shield", open: menu === "permission", setOpen: setMenu, disabled: busy, above: true },
              errors.permissions ? h("div", { className: "cgpt-menu-error" }, errors.permissions) : null,
              permissions.map((p) => h(Item, { key: p.value, selected: p.value === state.permissionPreset, detail: p.description, onClick: () => choosePermission(p.value) }, permissionNames[p.value] || p.name || p.value))
            ),
            h(
              Menu,
              { id: "reference", label: "", icon: "at", open: menu === "reference", setOpen: setMenu, disabled: busy, above: true },
              h(Item, { onClick: () => {
                fileReference.current = true;
                fileRef.current?.click();
                setMenu(null);
              } }, "\u5F15\u7528\u672C\u5730\u6587\u4EF6\u2026"),
              h(Item, { onClick: () => {
                setReferenceOpen(true);
                setReferencePath("");
                setMenu(null);
              } }, "\u8F93\u5165\u6587\u4EF6\u6216\u76EE\u5F55\u8DEF\u5F84\u2026"),
              adapter.listSessionReferences?.().length ? h("div", { className: "cgpt-menu-section" }, "\u4F1A\u8BDD") : null,
              (adapter.listSessionReferences?.() || []).slice(0, 15).map((s) => h(Item, { key: s.sessionId, onClick: () => insert(s.mention + " ") }, s.label))
            )
          ),
          h(
            "div",
            { className: "cgpt-toolbar-right" },
            h(
              Menu,
              { id: "model", label: modelLabel + (effort ? " \xB7 " + effort.name : ""), open: menu === "model", setOpen: setMenu, disabled: busy, above: true, align: "right", wide: true },
              h("input", { className: "cgpt-model-search", "aria-label": "\u641C\u7D22\u6A21\u578B", placeholder: "\u641C\u7D22\u6A21\u578B\u2026", value: query, onChange: (e) => setQuery(e.target.value) }),
              errors.models ? h("div", { className: "cgpt-menu-error" }, errors.models) : null,
              catalogs.models.map((g) => h(import_react.default.Fragment, { key: g.id }, h("div", { className: "cgpt-menu-section" }, g.name || g.id), (g.models || []).filter((m) => m.name.toLowerCase().includes(query.toLowerCase())).map((m) => h(Item, { key: m.id, selected: state.modelSelection?.provider === g.id && state.modelSelection?.model === m.id, onClick: () => {
                update({ modelSelection: { provider: g.id, model: m.id, ...m.reasoning?.defaultEffort ? { reasoningEffort: m.reasoning.defaultEffort } : {} } });
                setMenu(null);
              } }, m.name)))),
              model?.reasoning?.efforts?.length ? h(import_react.default.Fragment, null, h("div", { className: "cgpt-menu-divider" }), h("div", { className: "cgpt-menu-section" }, "\u63A8\u7406\u7B49\u7EA7"), model.reasoning.efforts.map((e) => h(Item, { key: e.id, selected: (state.modelSelection?.reasoningEffort ?? model.reasoning.defaultEffort) === e.id, onClick: () => {
                update({ modelSelection: { ...state.modelSelection, reasoningEffort: e.id } });
                setMenu(null);
              } }, e.name))) : null
            ),
            VoiceControl ? h(VoiceControl, { controller, textareaRef, locked: busy, onActiveChange: setVoiceActive, onError: report }) : null,
            h("button", { type: "button", className: "cgpt-send", "aria-label": state.status === "error" ? "\u91CD\u8BD5\u53D1\u9001" : "\u53D1\u9001\u6D88\u606F", title: statusText || "\u53D1\u9001\u6D88\u606F", disabled: busy || voiceActive || state.sendUncertain || !state.text.trim() && !state.files.length || !state.workspaceId, onClick: submit }, h(Glyph, { name: "send", size: 21 }))
          )
        ),
        h("input", { ref: fileRef, type: "file", multiple: true, hidden: true, "aria-label": "\u9009\u62E9\u9644\u4EF6", onChange: (e) => {
          addFiles(e.target.files);
          if (fileReference.current && e.target.files?.length) insert("");
          fileReference.current = false;
          e.target.value = "";
        } })
      ),
      error || statusText ? h(
        "div",
        { className: "cgpt-home-notice", "data-error": !!error, role: error ? "alert" : "status" },
        error || statusText,
        Object.keys(errors).length ? h("button", { type: "button", onClick: refresh }, "\u91CD\u65B0\u8BFB\u53D6\u9009\u9879") : null,
        state.preparedSessionId ? h("button", { type: "button", onClick: () => Promise.resolve().then(() => adapter.open({ sessionId: state.preparedSessionId })).catch(report) }, state.sendUncertain ? "\u6253\u5F00\u4F1A\u8BDD\u6838\u5BF9" : "\u6253\u5F00\u5DF2\u51C6\u5907\u7684\u4F1A\u8BDD") : null,
        state.preparedSessionId || state.sendUncertain ? h("button", { type: "button", disabled: busy, onClick: () => setResetConfirm(true) }, "\u6838\u5BF9\u540E\u91CD\u65B0\u5F00\u59CB") : null
      ) : null
    ),
    resetConfirm ? h("div", { className: "cgpt-modal-backdrop" }, h("div", { className: "cgpt-modal", role: "dialog", "aria-modal": true, "aria-label": "\u91CD\u65B0\u5F00\u59CB\u8349\u7A3F" }, h("h3", null, "\u5DF2\u6838\u5BF9\u4F1A\u8BDD\u4E86\u5417\uFF1F"), h("p", null, "\u8BF7\u5148\u68C0\u67E5\u4F1A\u8BDD\u5217\u8868\uFF0C\u786E\u8BA4\u4E0A\u4E00\u6B21\u6D88\u606F\u6CA1\u6709\u53D1\u51FA\u3002\u7EE7\u7EED\u540E\u53EF\u91CD\u65B0\u9009\u62E9\u5DE5\u4F5C\u533A\u548C\u6A21\u5F0F\uFF1B\u5DF2\u7ECF\u521B\u5EFA\u7684\u4F1A\u8BDD\u4F1A\u4FDD\u7559\u3002"), h("div", { className: "cgpt-modal-actions" }, h("button", { type: "button", onClick: () => setResetConfirm(false) }, "\u8FD4\u56DE\u6838\u5BF9"), h("button", { type: "button", onClick: () => {
      const old = controller.resetPreparedSession();
      if (old) adapter.release?.(old);
      adapter.resetCreateUncertainty?.();
      setNotice("");
      setResetConfirm(false);
    } }, "\u5DF2\u6838\u5BF9\uFF0C\u91CD\u65B0\u5F00\u59CB")))) : null,
    permissionConfirm ? h("div", { className: "cgpt-modal-backdrop" }, h("div", { className: "cgpt-modal", role: "dialog", "aria-modal": true, "aria-label": "\u786E\u8BA4\u6743\u9650\u9009\u62E9" }, h("h3", null, permissionConfirm === "auto" ? "\u542F\u7528\u81EA\u52A8\u5BA1\u67E5\uFF1F" : "\u4F7F\u7528\u5B8C\u5168\u6743\u9650\uFF1F"), h("p", null, permissionConfirm === "auto" ? "\u81EA\u52A8\u5BA1\u67E5\u662F\u5B9E\u9A8C\u529F\u80FD\uFF0C\u7531\u6A21\u578B\u5224\u65AD\u5DE5\u5177\u8C03\u7528\u662F\u5426\u6388\u6743\u3002" : "\u5B8C\u5168\u6743\u9650\u5141\u8BB8\u4F1A\u8BDD\u8BBF\u95EE\u5DE5\u4F5C\u533A\u4EE5\u5916\u7684\u6587\u4EF6\u5E76\u6267\u884C\u547D\u4EE4\u3002\u6B64\u9009\u62E9\u53EA\u7528\u4E8E\u4F60\u5C06\u53D1\u9001\u7684\u65B0\u4F1A\u8BDD\u3002"), h("label", { className: "cgpt-ack" }, h("input", { type: "checkbox", checked: ack, onChange: (e) => setAck(e.target.checked) }), "\u6211\u7406\u89E3\u5E76\u63A5\u53D7\u6B64\u6743\u9650\u8303\u56F4"), h("div", { className: "cgpt-modal-actions" }, h("button", { type: "button", onClick: () => setPermissionConfirm(null) }, "\u53D6\u6D88"), h("button", { type: "button", disabled: !ack, onClick: () => {
      update({ permissionPreset: permissionConfirm });
      setPermissionConfirm(null);
    } }, "\u786E\u8BA4\u9009\u62E9")))) : null,
    referenceOpen ? h("div", { className: "cgpt-modal-backdrop" }, h("form", { className: "cgpt-modal", role: "dialog", "aria-modal": true, "aria-label": "\u5F15\u7528\u6587\u4EF6\u6216\u76EE\u5F55", onSubmit: (e) => {
      e.preventDefault();
      const path = referencePath.trim();
      if (!path || /["\r\n]/u.test(path)) {
        setNotice("\u8BF7\u8F93\u5165\u4E0D\u542B\u53CC\u5F15\u53F7\u6216\u6362\u884C\u7684\u6587\u4EF6\u8DEF\u5F84");
        return;
      }
      insert('@"' + path + '" ');
      setReferenceOpen(false);
    } }, h("h3", null, "\u5F15\u7528\u6587\u4EF6\u6216\u76EE\u5F55"), h("input", { autoFocus: true, "aria-label": "\u6587\u4EF6\u6216\u76EE\u5F55\u8DEF\u5F84", placeholder: "/\u8DEF\u5F84/\u6587\u4EF6 \u6216 \u5DE5\u4F5C\u533A\u5185\u76F8\u5BF9\u8DEF\u5F84", value: referencePath, onChange: (e) => setReferencePath(e.target.value) }), h("div", { className: "cgpt-modal-actions" }, h("button", { type: "button", onClick: () => setReferenceOpen(false) }, "\u53D6\u6D88"), h("button", { type: "submit", disabled: !referencePath.trim() }, "\u63D2\u5165\u5F15\u7528")))) : null
  );
}

// references.js
function sessionMention(sessionId, label) {
  const bytes = new TextEncoder().encode(JSON.stringify(sessionId));
  const encoded = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join("")).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
  return "@[" + String(label).replace(/[\\\]]/gu, (value) => "\\" + value) + "](dsh-session:" + encoded + ")";
}

// rail-layout.js
function wireRailGeometry(anchor, { preferredWidth = 392, setWidth, onWidth } = {}) {
  const root = anchor?.closest?.("nav")?.parentElement;
  const column = root?.closest?.('[data-slot="sidebar"]')?.parentElement;
  const frame = column?.parentElement;
  if (!frame?.style) return () => {
  };
  const owned = [];
  for (const [node, name] of [[column, "data-cgpt-rail-column"], [frame, "data-cgpt-rail-frame"]]) {
    const before = node.getAttribute(name);
    node.setAttribute(name, "");
    owned.push(() => {
      if (node.getAttribute(name) !== "") return;
      if (before === null) node.removeAttribute(name);
      else node.setAttribute(name, before);
    });
  }
  const properties = new Map(["--cgpt-rail-columns", "--cgpt-rail-content-width"].map((name) => [name, {
    before: frame.style.getPropertyValue(name),
    priority: frame.style.getPropertyPriority(name),
    installed: null
  }]));
  const write = (name, value) => {
    properties.get(name).installed = value;
    if (frame.style.getPropertyValue(name) !== value) frame.style.setProperty(name, value);
  };
  owned.push(() => {
    for (const [name, { before, priority, installed }] of properties) {
      if (installed === null || frame.style.getPropertyValue(name) !== installed) continue;
      if (before) frame.style.setProperty(name, before, priority);
      else frame.style.removeProperty(name);
    }
  });
  const validWidth = (value) => Number.isFinite(value) && value >= 264 && value <= 420;
  let preferred = validWidth(preferredWidth) ? Math.round(preferredWidth) : 392;
  let disposed = false, lastNative, lastCollapsed, lastDrawer, lastDragging = false, frameWidth, restoreTarget;
  const sync = (resized = false, records = []) => {
    if (disposed) return;
    const native = frame.style.gridTemplateColumns;
    const collapsed = frame.hasAttribute("data-sidebar-collapsed");
    const drawer = frame.hasAttribute("data-sidebar-drawer"), dragging = frame.hasAttribute("data-dragging");
    if (!resized && native === lastNative && collapsed === lastCollapsed && drawer === lastDrawer && dragging === lastDragging) return;
    const tracks = native.match(/^(\d+(?:\.\d+)?)px\s+minmax\((\d+(?:\.\d+)?)px,\s*1fr\)\s+minmax\(0px,\s*(\d+(?:\.\d+)?)px\)$/);
    if (!tracks) return;
    const nativeLeading = Number(tracks[1]), nativeMinimum = Number(tracks[2]), nativeRight = Number(tracks[3]);
    const wasDragging = lastDragging || records.some((record) => record.attributeName === "data-dragging" && record.oldValue !== null);
    const changedWidth = native !== lastNative;
    const changedToggle = lastCollapsed !== void 0 && collapsed !== lastCollapsed;
    let notifyWidth;
    if (!drawer && !collapsed && !changedToggle && (dragging || wasDragging) && changedWidth && validWidth(nativeLeading) && preferred !== Math.round(nativeLeading)) {
      preferred = Math.round(nativeLeading);
      notifyWidth = preferred;
    }
    lastNative = native;
    lastCollapsed = collapsed;
    lastDrawer = drawer;
    lastDragging = dragging;
    if (drawer) {
      restoreTarget = void 0;
      const drawerWidth = Number.parseFloat(column.style.width);
      write("--cgpt-rail-content-width", (Number.isFinite(drawerWidth) ? drawerWidth : preferred) + "px");
      write("--cgpt-rail-columns", native);
      return;
    }
    const constrained = nativeLeading > 420;
    const leading = collapsed ? 52 : constrained ? nativeLeading : preferred;
    const minimum = Math.max(0, nativeMinimum - Math.max(0, leading - nativeLeading));
    const columns = (width) => {
      const right = Number.isFinite(width) && width >= 0 ? Math.max(0, Math.min(nativeRight, width - nativeLeading - nativeMinimum)) : nativeRight;
      return leading + "px minmax(" + minimum + "px, 1fr) minmax(0px, " + right + "px)";
    };
    write("--cgpt-rail-content-width", (constrained && !collapsed ? nativeLeading : preferred) + "px");
    write("--cgpt-rail-columns", columns(frameWidth));
    const restore = !collapsed && !constrained && Math.abs(nativeLeading - preferred) > 1;
    if (!restore) restoreTarget = void 0;
    else if (typeof setWidth === "function" && restoreTarget !== nativeLeading + ":" + preferred) {
      restoreTarget = nativeLeading + ":" + preferred;
      setWidth(preferred);
    }
    if (typeof frame.getBoundingClientRect === "function") {
      frameWidth = frame.getBoundingClientRect()?.width;
      write("--cgpt-rail-columns", columns(frameWidth));
    }
    if (notifyWidth !== void 0) onWidth?.(notifyWidth);
  };
  let mutationObserver, resizeObserver;
  if (typeof MutationObserver === "function") {
    mutationObserver = new MutationObserver((records) => sync(false, records));
    mutationObserver.observe(frame, { attributes: true, attributeOldValue: true, attributeFilter: ["style", "data-sidebar-collapsed", "data-sidebar-drawer", "data-dragging"] });
  }
  if (typeof frame.getBoundingClientRect === "function" && typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(() => sync(true));
    resizeObserver.observe(frame);
  }
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    mutationObserver?.disconnect();
    resizeObserver?.disconnect();
    for (const undo of owned.reverse()) undo();
  };
  try {
    sync();
  } catch (error) {
    dispose();
    throw error;
  }
  return dispose;
}
function wireRailLayout(anchor, { labels = {}, navigation } = {}) {
  const nav = anchor?.closest?.("nav");
  const root = nav?.parentElement;
  if (!nav || !root) return () => {
  };
  const owned = [];
  function mark(node, name, value = "") {
    if (!node) return;
    const before = node.getAttribute(name);
    node.setAttribute(name, value);
    owned.push(() => {
      if (before === null) node.removeAttribute(name);
      else node.setAttribute(name, before);
    });
  }
  mark(root, "data-cgpt-rail");
  mark(nav, "data-cgpt-rail-nav");
  const brand = root.querySelector('[data-slot="sidebar.brand.name"]');
  const brandRow = brand?.closest("[data-window-drag]");
  mark(brandRow, "data-cgpt-brand-row");
  for (const row of Array.from(root.children)) if (row.hasAttribute("data-window-drag") && row !== brandRow) mark(row, "data-cgpt-top-strip");
  const newButton = Array.from(root.querySelectorAll("button[aria-label]")).find((button) => button.getAttribute("aria-label") === labels.newSession && !brandRow?.contains(button));
  mark(newButton, "data-cgpt-new-chat");
  const toggle = Array.from(root.querySelectorAll("button[aria-label]")).find((button) => [labels.toggleOpen, labels.toggleCollapse].includes(button.getAttribute("aria-label")));
  mark(toggle, "data-cgpt-rail-toggle");
  const iconParent = newButton?.querySelector("svg")?.parentElement;
  const newLabel = iconParent?.lastElementChild;
  if (newLabel && newLabel.tagName === "SPAN") {
    mark(newLabel, "data-cgpt-new-label", labels.newChat || "\u65B0\u804A\u5929");
  }
  const region = root.querySelector('[data-slot="sidebar.workspaces"]');
  mark(region?.parentElement, "data-cgpt-workspace-region");
  const launcher = root.querySelector('[data-slot="settings.launcher"]');
  mark(launcher, "data-cgpt-account-seat");
  mark(launcher?.parentElement, "data-cgpt-settings-row");
  const footer = root.querySelector('[data-slot="sidebar.footer.action"]');
  mark(footer, "data-cgpt-footer-seat");
  const settings = root.querySelector('[data-slot="sidebar.settings"]');
  mark(settings?.parentElement?.parentElement, "data-cgpt-foot-area");
  for (const button of nav.querySelectorAll("button[aria-label]")) {
    if (button.closest("[data-cgpt-app-dock]")) continue;
    const name = button.getAttribute("aria-label");
    const id = Object.keys(labels.panels || {}).find((id2) => labels.panels[id2] === name) || (name === labels.more ? "more" : null);
    if (!id) continue;
    mark(button, "data-cgpt-nav-button", id);
    mark(button, "title", name);
    if (id !== "home" && id !== "more") mark(button, "draggable", "false");
    let item = button;
    while (item.parentElement && item.parentElement !== nav) item = item.parentElement;
    if (item.parentElement === nav) {
      mark(item, "data-cgpt-nav-item", id);
      if (navigation) {
        const index = navigation.visible.findIndex((entry) => entry.kind === "panel" && entry.id === id);
        if (id === "more" && !navigation.showMore || id !== "more" && index < 0) mark(item, "data-cgpt-nav-hidden");
        mark(item, "data-cgpt-nav-order", String(id === "more" ? navigation.visible.length : Math.max(0, index)));
      }
    }
  }
  const search = root.querySelector('[data-slot="sidebar.workspaces"] button[aria-label="' + (labels.search || "\u641C\u7D22\u4F1A\u8BDD").replaceAll('"', '\\"') + '"]');
  mark(search, "data-cgpt-search-button");
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const undo of owned.reverse()) undo();
  };
}

// pinned-sessions-model.js
function createPinnedSessionsModel({ sessions, workspaces, layout, uiWorkspace }) {
  const sources = [sessions.list, workspaces.list, layout.panelInfo];
  const listeners = /* @__PURE__ */ new Set();
  const pendingUnpins = /* @__PURE__ */ new Map();
  let subscriptions = [];
  let snapshot2;
  let publishedSnapshot;
  const text4 = (value) => typeof value === "string" ? value.trim() : "";
  function refresh() {
    const list = sessions.list.getSnapshot();
    const workspaceState = workspaces.list.getSnapshot();
    const panel = layout.panelInfo.getSnapshot();
    const byId = list.byId || {};
    const archived = new Set(workspaceState.archivedSessionIds || []);
    const workspaceTitles = /* @__PURE__ */ new Map();
    for (const workspace of workspaceState.items || []) {
      for (const id of workspace.sessionIds || []) {
        if (!workspaceTitles.has(id)) workspaceTitles.set(id, text4(workspace.title));
      }
    }
    const seen = /* @__PURE__ */ new Set();
    const rows = [];
    for (const id of workspaceState.pinnedSessionIds || []) {
      if (seen.has(id)) continue;
      seen.add(id);
      const summary = byId[id];
      if (!summary || summary.blank || archived.has(id)) continue;
      rows.push({ id, title: text4(summary.title) || text4(summary.projectionValues?.title) || "\u672A\u547D\u540D", workspaceTitle: workspaceTitles.get(id) || "", running: summary.running === true });
    }
    const activeId = panel.activePanelId === null ? Object.values(byId).find((summary) => (summary?.retainedBy?.mainView || 0) > 0)?.id : null;
    const nextActiveId = activeId ?? null;
    if (snapshot2 && snapshot2.activeId === nextActiveId && snapshot2.rows.length === rows.length && rows.every((row, index) => {
      const previous = snapshot2.rows[index];
      return row.id === previous.id && row.title === previous.title && row.workspaceTitle === previous.workspaceTitle && row.running === previous.running;
    })) return false;
    snapshot2 = Object.freeze({ rows: Object.freeze(rows.map((row) => Object.freeze(row))), activeId: nextActiveId });
    return true;
  }
  function changed() {
    refresh();
    if (snapshot2 === publishedSnapshot) return;
    publishedSnapshot = snapshot2;
    for (const listener of [...listeners]) listener();
  }
  refresh();
  publishedSnapshot = snapshot2;
  return {
    getSnapshot() {
      refresh();
      return snapshot2;
    },
    subscribe(listener) {
      const registered = () => listener();
      listeners.add(registered);
      if (listeners.size === 1) {
        try {
          for (const source2 of sources) subscriptions.push(source2.subscribe(changed));
        } catch (error) {
          for (const stop5 of subscriptions.splice(0)) stop5();
          listeners.delete(registered);
          throw error;
        }
        changed();
      }
      return () => {
        listeners.delete(registered);
        if (listeners.size === 0) for (const stop5 of subscriptions.splice(0)) stop5();
      };
    },
    open(id) {
      const summary = sessions.list.getSnapshot().byId?.[id];
      const archived = workspaces.list.getSnapshot().archivedSessionIds || [];
      if (!summary || summary.blank || archived.includes(id)) return false;
      uiWorkspace.openSession(id);
      return true;
    },
    unpin(id) {
      if (pendingUnpins.has(id)) return pendingUnpins.get(id);
      const request = Promise.resolve().then(() => uiWorkspace.unpinSession(id)).finally(() => {
        if (pendingUnpins.get(id) === request) pendingUnpins.delete(id);
      });
      pendingUnpins.set(id, request);
      return request;
    }
  };
}

// pinned-sessions.js
var import_react2 = __toESM(require("react"), 1);

// pinned-session-actions.js
var NATIVE_SESSION_ROW_ACTIONS = "sidebar.workspaces.session.row.action";
var PINNED_SESSION_ROW_ACTIONS = "chatgptRail.pinnedSession.row.action";
function mirrorNativePinnedActions(slots) {
  let stops = [];
  const clear = () => {
    for (const stop5 of stops.splice(0).reverse()) stop5();
  };
  function sync() {
    clear();
    try {
      for (const entry of slots.entriesOfSlot(NATIVE_SESSION_ROW_ACTIONS)) {
        if (entry.options.id !== "archive") continue;
        stops.push(slots.register({
          name: PINNED_SESSION_ROW_ACTIONS,
          id: entry.options.id,
          order: entry.options.order,
          priority: entry.options.priority,
          inject: entry.inject,
          locale: entry.locale,
          ...entry.store === void 0 ? {} : { store: entry.store }
        }, entry.component));
      }
    } catch (error) {
      clear();
      throw error;
    }
  }
  sync();
  const unsubscribe = slots.subscribe(NATIVE_SESSION_ROW_ACTIONS, sync);
  return () => {
    unsubscribe();
    clear();
  };
}

// pinned-sessions.js
var h2 = import_react2.default.createElement;
var NoTooltip = ({ children }) => children;
var cssString = (value) => '"' + value.replace(/[^a-zA-Z0-9_-]/gu, (char) => "\\" + char.codePointAt(0).toString(16) + " ") + '"';
function pinnedWorkspaceRules(rows) {
  const selectors = rows.map((row) => '[data-slot="sidebar.workspaces"] [role="tree"] [data-row-key=' + cssString("session:" + row.id) + "]");
  return selectors.length ? selectors.join(",") + "{display:none!important}" : "";
}
function mountPinnedSessionsSeat(anchor) {
  const root = anchor?.closest?.("nav")?.parentElement;
  const browser = root?.querySelector('[data-slot="sidebar.workspaces"]');
  if (!browser?.parentElement) return null;
  const node = browser.ownerDocument.createElement("div");
  node.className = "cgpt-pinned-seat";
  node.setAttribute("data-cgpt-pinned-seat", "");
  browser.parentElement.insertBefore(node, browser);
  return { node, dispose: () => node.remove() };
}
function PinnedSessions({ model, labels = {}, StateDot, Tooltip = NoTooltip, renderSlot }) {
  const snapshot2 = import_react2.default.useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  const [busy, setBusy] = import_react2.default.useState(/* @__PURE__ */ new Set());
  const [error, setError] = import_react2.default.useState("");
  const mounted = import_react2.default.useRef(true);
  import_react2.default.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const title = labels.pinned || "\u7F6E\u9876";
  const unpinLabel = labels.unpin || "\u53D6\u6D88\u7F6E\u9876\u804A\u5929";
  const runningLabel = labels.running || "\u8FDB\u884C\u4E2D";
  function open(id) {
    setError("");
    try {
      if (model.open(id) === false) setError(labels.openFailed || "\u8FD9\u6761\u4F1A\u8BDD\u5F53\u524D\u65E0\u6CD5\u6253\u5F00\u3002");
    } catch (reason) {
      setError(reason?.message || labels.openFailed || "\u6253\u5F00\u4F1A\u8BDD\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002");
    }
  }
  async function unpin(id) {
    setError("");
    setBusy((previous) => /* @__PURE__ */ new Set([...previous, id]));
    try {
      await model.unpin(id);
    } catch (reason) {
      if (mounted.current) setError(reason?.message || labels.unpinFailed || "\u53D6\u6D88\u7F6E\u9876\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002");
    } finally {
      if (mounted.current) setBusy((previous) => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
    }
  }
  if (snapshot2.rows.length === 0 && !error) return null;
  const stop5 = (event) => event.stopPropagation();
  return h2(
    "section",
    {
      className: "cgpt-pinned-section",
      "aria-label": title,
      onClick: stop5,
      onPointerDown: stop5,
      onContextMenu: stop5
    },
    h2("style", { "data-cgpt-pinned-workspace-filter": "" }, pinnedWorkspaceRules(snapshot2.rows)),
    h2("h2", { className: "cgpt-pinned-heading" }, title),
    h2("ul", { className: "cgpt-pinned-list" }, snapshot2.rows.map((row) => h2(
      "li",
      { key: row.id, className: "cgpt-pinned-row", "data-cgpt-pinned-session": row.id, "data-active": snapshot2.activeId === row.id || void 0 },
      h2(
        "button",
        {
          type: "button",
          className: "cgpt-pinned-open",
          title: row.workspaceTitle ? row.title + "\n" + row.workspaceTitle : row.title,
          "aria-current": snapshot2.activeId === row.id ? "page" : void 0,
          onClick: () => open(row.id)
        },
        row.running && h2(
          "span",
          { className: "cgpt-pinned-status", role: "img", "aria-label": runningLabel, title: runningLabel },
          StateDot ? h2(StateDot, { state: "ongoing" }) : h2("span", { className: "cgpt-pinned-spinner", "aria-hidden": true })
        ),
        h2("span", { className: "cgpt-pinned-title" }, row.title)
      ),
      h2(
        "div",
        { className: "cgpt-pinned-actions" },
        renderSlot?.(PINNED_SESSION_ROW_ACTIONS, { sessionId: row.id, displayTitle: row.title }),
        h2(Tooltip, { label: unpinLabel, side: "left", delayMs: 400 }, h2("button", {
          type: "button",
          className: "cgpt-pinned-unpin",
          "aria-label": unpinLabel + "\uFF1A" + row.title,
          disabled: busy.has(row.id),
          onClick: () => unpin(row.id)
        }, h2(
          "svg",
          { width: 16, height: 16, viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true },
          h2("path", { transform: "rotate(40 12 12)", d: "M8 2h8a1 1 0 0 1 0 2h-1v5.2l2.8 3.1a1 1 0 0 1-.8 1.7H13v6.5L12 22l-1-1.5V14H7a1 1 0 0 1-.8-1.7L9 9.2V4H8a1 1 0 0 1 0-2Z" })
        )))
      )
    ))),
    error && h2("div", { className: "cgpt-pinned-error", role: "alert" }, error)
  );
}

// session-context-events.js
var NATIVE_ROW = '[data-row-key^="session:"]';
var PINNED_ROW = "[data-cgpt-pinned-session]";
var ROWS = NATIVE_ROW + "," + PINNED_ROW;
var MORE = "data-cgpt-session-more";
var EDITABLE = 'input,textarea,select,[contenteditable]:not([contenteditable="false"])';
function wireSessionContextEvents(region, { onRequest, isMoreButton, moreLabelPattern } = {}) {
  if (!region || typeof onRequest !== "function") throw new TypeError("A sidebar region and onRequest callback are required.");
  const owned = /* @__PURE__ */ new Map();
  let disposed = false;
  function mark(node, name, value) {
    let attributes2 = owned.get(node);
    if (!attributes2) {
      attributes2 = /* @__PURE__ */ new Map();
      owned.set(node, attributes2);
    }
    if (!attributes2.has(name)) attributes2.set(name, { before: node.getAttribute(name), written: value });
    node.setAttribute(name, value);
  }
  function restore(node, name) {
    const attributes2 = owned.get(node), record = attributes2?.get(name);
    if (!record) return;
    if (node.getAttribute(name) === record.written) {
      if (record.before === null) node.removeAttribute(name);
      else node.setAttribute(name, record.before);
    }
    attributes2.delete(name);
    if (attributes2.size === 0) owned.delete(node);
  }
  function matchesMore(label) {
    if (typeof label !== "string") return false;
    if (typeof isMoreButton === "function") return !!isMoreButton(label);
    const { prefix = "", suffix = "" } = moreLabelPattern || {};
    return prefix.length + suffix.length > 0 && label.length >= prefix.length + suffix.length && label.startsWith(prefix) && label.endsWith(suffix);
  }
  function scan() {
    if (disposed) return;
    const rows = new Set(region.querySelectorAll(NATIVE_ROW));
    const buttons = /* @__PURE__ */ new Set();
    for (const row of rows) {
      if (!row.hasAttribute("tabindex")) mark(row, "tabindex", "0");
      for (const button of row.querySelectorAll("button[aria-label]")) {
        if (button.closest(NATIVE_ROW) === row && matchesMore(button.getAttribute("aria-label"))) {
          buttons.add(button);
          mark(button, MORE, "");
        }
      }
    }
    for (const [node, attributes2] of [...owned]) {
      if (!region.contains(node)) {
        for (const name of [...attributes2.keys()]) restore(node, name);
      } else {
        if (attributes2.has(MORE) && !buttons.has(node)) restore(node, MORE);
        if (attributes2.has("tabindex") && !rows.has(node)) restore(node, "tabindex");
      }
    }
  }
  function targetOf(event) {
    const target = event.target?.closest ? event.target : event.target?.parentElement;
    if (!target || !region.contains(target) || target.isContentEditable || target.closest(EDITABLE)) return null;
    const row = target.closest(ROWS);
    if (!row || !region.contains(row)) return null;
    const pinned = row.getAttribute("data-cgpt-pinned-session");
    const key = row.getAttribute("data-row-key");
    const sessionId = pinned || ((key || "").startsWith("session:") ? key.slice("session:".length) : "");
    if (!sessionId) return null;
    const button = target.closest("button");
    return { sessionId, trigger: button && row.contains(button) ? button : row };
  }
  function keyboardPoint(trigger) {
    const rect = trigger.getBoundingClientRect();
    return { x: rect.left + Math.min(12, Math.max(0, rect.width || 0)), y: rect.bottom };
  }
  function request(event, keyboard) {
    const match = targetOf(event);
    if (!match) return;
    const point = keyboard || event.clientX === 0 && event.clientY === 0 ? keyboardPoint(match.trigger) : { x: event.clientX, y: event.clientY };
    event.preventDefault();
    event.stopPropagation();
    onRequest({ ...match, ...point });
  }
  const onContextMenu = (event) => request(event, false);
  const onKeyDown = (event) => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ContextMenu" || event.key === "F10" && event.shiftKey) request(event, true);
  };
  region.addEventListener("contextmenu", onContextMenu, true);
  region.addEventListener("keydown", onKeyDown, true);
  let observer;
  try {
    scan();
    if (typeof MutationObserver === "function") {
      observer = new MutationObserver(scan);
      observer.observe(region, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-label"] });
    }
  } catch (error) {
    cleanup();
    throw error;
  }
  function cleanup() {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    region.removeEventListener("contextmenu", onContextMenu, true);
    region.removeEventListener("keydown", onKeyDown, true);
    for (const [node, attributes2] of [...owned]) for (const name of [...attributes2.keys()]) restore(node, name);
  }
  return cleanup;
}

// session-context-menu.js
var import_react3 = __toESM(require("react"), 1);
var NATIVE_SESSION_MENU = "sidebar.workspaces.session.menu.item";
var SESSION_CONTEXT_MENU = "chatgptRail.session.contextMenu";
var ACTIONS = /* @__PURE__ */ new Set(["pin", "rename", "fork", "archive", "session-id"]);
var h3 = import_react3.default.createElement;
function mirrorNativeSessionMenu(slots) {
  let stops = [];
  const clear = () => {
    for (const stop5 of stops.splice(0).reverse()) stop5();
  };
  function sync() {
    clear();
    try {
      for (const entry of slots.entriesOfSlot(NATIVE_SESSION_MENU)) {
        if (!ACTIONS.has(entry.options.id)) continue;
        const options = {
          name: SESSION_CONTEXT_MENU,
          id: entry.options.id,
          order: entry.options.order,
          priority: entry.options.priority,
          inject: entry.inject,
          locale: entry.locale,
          ...entry.store === void 0 ? {} : { store: entry.store }
        };
        stops.push(slots.register(options, entry.component));
      }
    } catch (error) {
      clear();
      throw error;
    }
  }
  sync();
  const unsubscribe = slots.subscribe(NATIVE_SESSION_MENU, sync);
  return () => {
    unsubscribe();
    clear();
  };
}
function createSessionContextController(ctx) {
  const { sessions } = ctx;
  let snapshot2 = null;
  let nativeMenu = null;
  const listeners = /* @__PURE__ */ new Set();
  const publish = (value) => {
    snapshot2 = value;
    for (const listener of [...listeners]) listener();
  };
  const closeNative = () => {
    const owned = nativeMenu;
    nativeMenu = null;
    if (owned && owned.service.active.getSnapshot() === owned.target) owned.service.close();
  };
  return {
    getSnapshot: () => snapshot2,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    open({ sessionId, x, y, trigger }) {
      const summary = sessions.list.getSnapshot().byId?.[sessionId];
      if (!summary || summary.blank) return false;
      const target = { kind: "session", value: { sessionId, displayTitle: summary.title || summary.projectionValues?.title || "" } };
      const point = { x: Number.isFinite(x) ? Math.max(0, x) : 0, y: Number.isFinite(y) ? Math.max(0, y) : 0 };
      trigger?.focus?.({ preventScroll: true });
      const service = ctx.get?.("contextMenus");
      if (typeof service?.open === "function" && typeof service.close === "function" && typeof service.active?.getSnapshot === "function") {
        if (snapshot2 !== null) publish(null);
        service.open(target, point);
        nativeMenu = service.active.getSnapshot() === target ? { service, target } : null;
      } else {
        closeNative();
        publish({ ...target.value, ...point, trigger });
      }
      return true;
    },
    close() {
      closeNative();
      if (snapshot2 !== null) publish(null);
    },
    dispose() {
      closeNative();
      listeners.clear();
      snapshot2 = null;
    }
  };
}
function mountSessionContextSeat(document2) {
  const node = document2.createElement("div");
  node.setAttribute("data-cgpt-context-seat", "");
  document2.body.appendChild(node);
  return { node, dispose: () => node.remove() };
}
function SessionContextMenu({ controller, renderSlot, Menu: Menu2 }) {
  const request = import_react3.default.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const setOpen = import_react3.default.useCallback((value) => {
    if (!value) controller.close();
  }, [controller]);
  const hookContext = import_react3.default.useMemo(() => [request !== null, setOpen], [request, setOpen]);
  import_react3.default.useEffect(() => {
    if (!request) return;
    return () => queueMicrotask(() => {
      if (controller.getSnapshot() !== null) return;
      const trigger = request.trigger, document2 = trigger?.ownerDocument;
      if (!document2 || !trigger.isConnected) return;
      const active = document2.activeElement;
      if (!active || active === document2.body || active.closest?.(".cgpt-session-context-popup,.cgpt-context-anchor")) trigger.focus?.({ preventScroll: true });
    });
  }, [request, controller]);
  if (request === null) return null;
  const stop5 = (event) => event.stopPropagation();
  return h3(
    "div",
    { className: "cgpt-context-layer", onClick: stop5, onPointerDown: stop5, onContextMenu: stop5 },
    h3(Menu2, {
      key: request.sessionId + "@" + request.x + "," + request.y,
      open: true,
      portal: true,
      autoFocus: true,
      onClose: controller.close,
      className: "cgpt-session-context-popup",
      listClassName: "cgpt-session-context-popup",
      getAnchorRect: () => ({ left: request.x, right: request.x, top: request.y, bottom: request.y, width: 0, height: 0 }),
      anchor: h3("button", { type: "button", tabIndex: -1, "aria-hidden": true, className: "cgpt-context-anchor", style: { left: request.x, top: request.y } })
    }, renderSlot(SESSION_CONTEXT_MENU, { sessionId: request.sessionId, displayTitle: request.displayTitle }, { hookContext }))
  );
}

// rail-navigation-model.js
var PANELS = "sidebar.panellist";
var MORE2 = "sidebar.panellist.actions";
var SETTINGS = "sidebar.settings";
var PRIORITY = ["home", "schedules", "plugins"];
function createRailNavigationModel({ slots, layout, locale }, { capacity = 6, getLabels, preferences, nativePins } = {}) {
  const limit = Number.isFinite(capacity) && capacity >= 0 ? Math.floor(capacity) : 6;
  const faces = /* @__PURE__ */ new WeakMap();
  const listeners = /* @__PURE__ */ new Set();
  let subscriptions = [];
  let snapshot2, publishedSnapshot, memoryPreference = null;
  const text4 = (value) => typeof value === "string" ? value.trim() : "";
  function normalizeIds(value) {
    if (!Array.isArray(value)) return null;
    return ["home", ...new Set(value.filter((id) => typeof id === "string" && id.trim() && id !== "home"))];
  }
  const readPreference = () => normalizeIds(preferences ? preferences.getSnapshot() : memoryPreference);
  const sameIds = (before, after) => before === null || after === null ? before === after : before.length === after.length && before.every((id, index) => id === after[index]);
  function panelEntries() {
    const seen = /* @__PURE__ */ new Set();
    return slots.entriesOfSlot(PANELS).filter((entry) => {
      const id = entry.options?.id;
      if (typeof id !== "string" || !id || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).slice().sort((a, b) => {
      const aPriority = PRIORITY.indexOf(a.options.id), bPriority = PRIORITY.indexOf(b.options.id);
      const rankA = aPriority < 0 ? PRIORITY.length : aPriority, rankB = bPriority < 0 ? PRIORITY.length : bPriority;
      const order = (value) => Number.isFinite(value) ? value : 0;
      return rankA - rankB || order(a.options.order) - order(b.options.order) || a.options.id.localeCompare(b.options.id);
    });
  }
  function customization() {
    const entry = slots.entries(MORE2).find((candidate) => candidate.options?.id === "entry-customization" && candidate.locale === "entryCustomization" && typeof candidate.inject === "function");
    if (!entry) return null;
    if (!faces.has(entry)) {
      try {
        faces.set(entry, { face: entry.inject() });
      } catch (error) {
        faces.set(entry, { error });
      }
    }
    const result = faces.get(entry);
    if (result.error) return { entry, error: result.error };
    const face = result.face;
    return typeof face?.browsePlugins === "function" && typeof face?.createPlugin === "function" ? { entry, face } : null;
  }
  function settingsEntry() {
    const entry = slots.entriesOfSlot(SETTINGS)[0];
    return entry?.locale === "settings" && typeof entry.store?.create === "function" ? entry : null;
  }
  function translated(namespace, key, fallback) {
    const value = locale?.bind?.(namespace)?.(key);
    return text4(value) && value !== key ? value : fallback;
  }
  function refresh() {
    const labels = getLabels?.() || {};
    const activeId = layout.panelInfo.getSnapshot().activePanelId;
    const rows = panelEntries().map((entry) => {
      const id = entry.options.id;
      const label = typeof entry.options.label === "function" ? entry.options.label() : entry.options.label;
      return { id, label: text4(label) || id, kind: "panel", icon: id, active: activeId === id };
    });
    const provider = customization();
    if (provider?.face) {
      rows.push({ id: "action:browse-plugins", label: text4(labels.browsePlugins) || translated("entryCustomization", "install", "\u6D4F\u89C8\u66F4\u591A\u63D2\u4EF6"), kind: "action", icon: "browse", active: false });
      rows.push({ id: "action:create-plugin", label: text4(labels.createPlugin) || translated("entryCustomization", "create", "\u521B\u5EFA\u4F60\u7684\u63D2\u4EF6"), kind: "action", icon: "create", active: false });
    }
    if (settingsEntry()) rows.push({ id: "action:settings", label: text4(labels.settings) || translated("settings", "trigger", "\u8BBE\u7F6E"), kind: "action", icon: "settings", active: false });
    const preference = readPreference(), customized = preference !== null;
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ids = preference || rows.filter((row) => row.kind === "panel").map((row) => row.id);
    const dockIds = ids.filter((id) => byId.has(id));
    const selected = dockIds.map((id) => byId.get(id)), selectedSet = new Set(dockIds);
    const nativeUnpinned = nativePins?.getSnapshot?.();
    const unpinned = new Set(Array.isArray(nativeUnpinned) ? nativeUnpinned : []);
    const renderable = (row) => row.kind !== "panel" || row.id === "plugins" || !unpinned.has(row.id);
    const rendered = selected.filter(renderable);
    const visible = rendered.slice(0, limit);
    const visibleSet = new Set(visible.map((row) => row.id));
    const overflow = [...selected.filter((row) => !visibleSet.has(row.id)), ...rows.filter((row) => row.kind === "panel" && !selectedSet.has(row.id))];
    const showMore = overflow.length > 0 || slots.entriesOfSlot(MORE2).some((entry) => entry.options?.id !== "entry-customization");
    const equal = (before, after) => before.length === after.length && after.every((row, index) => {
      const previous = before[index];
      return row.id === previous.id && row.label === previous.label && row.kind === previous.kind && row.icon === previous.icon && row.active === previous.active;
    });
    if (snapshot2 && snapshot2.customized === customized && snapshot2.showMore === showMore && sameIds(snapshot2.dockIds, dockIds) && equal(snapshot2.all, rows) && equal(snapshot2.visible, visible) && equal(snapshot2.overflow, overflow)) return;
    const freeze = (items) => Object.freeze(items.map((item) => Object.freeze(item)));
    snapshot2 = Object.freeze({ all: freeze(rows), dockIds: Object.freeze(dockIds), visible: freeze(visible), overflow: freeze(overflow), showMore, capacity: limit, customized });
  }
  function changed() {
    refresh();
    if (snapshot2 === publishedSnapshot) return;
    publishedSnapshot = snapshot2;
    for (const listener of [...listeners]) listener();
  }
  function writePreference(value) {
    const next = normalizeIds(value), before = readPreference();
    if (sameIds(before, next)) return;
    if (preferences) preferences.set(next);
    else memoryPreference = next;
    changed();
  }
  function editableIds() {
    refresh();
    return readPreference() || [...snapshot2.dockIds];
  }
  refresh();
  publishedSnapshot = snapshot2;
  return {
    getSnapshot() {
      refresh();
      return snapshot2;
    },
    subscribe(listener) {
      const registered = () => listener();
      listeners.add(registered);
      if (listeners.size === 1) {
        try {
          for (const name of [PANELS, MORE2, SETTINGS]) subscriptions.push(slots.subscribe(name, changed));
          subscriptions.push(layout.panelInfo.subscribe(changed));
          if (typeof locale?.subscribe === "function") subscriptions.push(locale.subscribe(changed));
          if (typeof preferences?.subscribe === "function") subscriptions.push(preferences.subscribe(changed));
          if (typeof nativePins?.subscribe === "function") subscriptions.push(nativePins.subscribe(changed));
          changed();
        } catch (error) {
          for (const stop5 of subscriptions.splice(0)) stop5();
          listeners.delete(registered);
          throw error;
        }
      }
      return () => {
        listeners.delete(registered);
        if (listeners.size === 0) for (const stop5 of subscriptions.splice(0)) stop5();
      };
    },
    setDockIds(ids) {
      if (!Array.isArray(ids)) throw new TypeError("Dock \u56FE\u6807\u987A\u5E8F\u5FC5\u987B\u662F\u6570\u7EC4\u3002");
      refresh();
      const available = new Set(snapshot2.all.map((entry) => entry.id));
      const missing = (readPreference() || []).filter((id) => !available.has(id));
      writePreference([...ids, ...missing]);
    },
    toggleDock(id, enabled) {
      refresh();
      if (!snapshot2.all.some((entry) => entry.id === id)) throw new Error("\u8BE5\u5BFC\u822A\u5165\u53E3\u5DF2\u4E0D\u53EF\u7528\u3002");
      if (id === "home" && !enabled) throw new Error("\u9996\u9875\u59CB\u7EC8\u4FDD\u7559\u5728 Dock \u4E2D\u3002");
      const ids = editableIds(), has = ids.includes(id);
      if (Boolean(enabled) === has) return;
      writePreference(enabled ? [...ids, id] : ids.filter((item) => item !== id));
    },
    move(id, delta) {
      refresh();
      const current = snapshot2.dockIds, index = current.indexOf(id);
      if (index < 0) throw new Error("\u8BE5\u56FE\u6807\u5C1A\u672A\u653E\u5165 Dock\u3002");
      if (id === "home" || !Number.isFinite(delta) || delta === 0) return;
      const target = Math.max(current[0] === "home" ? 1 : 0, Math.min(current.length - 1, index + Math.trunc(delta)));
      if (target === index) return;
      const ids = editableIds();
      const from = ids.indexOf(id), to = ids.indexOf(current[target]);
      ids.splice(from, 1);
      ids.splice(to, 0, id);
      writePreference(ids);
    },
    resetDock() {
      writePreference(null);
    },
    run(id) {
      if (id === "action:settings") {
        const entry = settingsEntry();
        if (!entry) throw new Error("\u539F\u751F\u8BBE\u7F6E\u5165\u53E3\u5DF2\u4E0D\u53EF\u7528\u3002");
        const instance = entry.store.create();
        if (typeof instance?.actions?.open !== "function") throw new Error("\u539F\u751F\u8BBE\u7F6E\u5165\u53E3\u4E0D\u652F\u6301\u6253\u5F00\u3002");
        return instance.actions.open();
      }
      if (id === "action:browse-plugins" || id === "action:create-plugin") {
        const provider = customization();
        if (provider?.error) throw provider.error;
        if (!provider?.face) throw new Error("\u539F\u751F\u63D2\u4EF6\u5165\u53E3\u5DF2\u4E0D\u53EF\u7528\u3002");
        return id === "action:browse-plugins" ? provider.face.browsePlugins() : provider.face.createPlugin();
      }
      if (!panelEntries().some((entry) => entry.options.id === id)) throw new Error("\u8BE5\u5BFC\u822A\u5165\u53E3\u5DF2\u4E0D\u53EF\u7528\u3002");
      return layout.selectPanel(id);
    }
  };
}

// rail-navigation.js
var import_react4 = __toESM(require("react"), 1);
var h4 = import_react4.default.createElement;
function mountRailActionsSeat(anchor) {
  const nav = anchor?.closest?.("nav");
  if (!nav) return null;
  const node = nav.ownerDocument.createElement("span");
  node.className = "cgpt-rail-actions-seat";
  nav.appendChild(node);
  return { node, dispose: () => node.remove() };
}
function ActionIcon({ name }) {
  const props = { width: 20, height: 20, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (name === "browse") return h4("svg", props, h4("circle", { cx: 10, cy: 10, r: 7.5 }), h4("path", { d: "m13.2 6.8-2 4.4-4.4 2 2-4.4 4.4-2Z" }));
  if (name === "create") return h4("svg", props, h4("rect", { x: 3, y: 3, width: 14, height: 14, rx: 3 }), h4("path", { d: "M10 6.5v7M6.5 10h7" }));
  return h4("svg", props, h4("path", { d: "m8 2-.5 2-1.7 1-2-.6L2 7.6l1.5 1.5v1.8L2 12.4l1.8 3.2 2-.6 1.7 1L8 18h4l.5-2 1.7-1 2 .6 1.8-3.2-1.5-1.5V9.1L18 7.6l-1.8-3.2-2 .6-1.7-1L12 2H8Z" }), h4("circle", { cx: 10, cy: 10, r: 2.6 }));
}
function RailActionButtons({ navigationModel }) {
  const snapshot2 = import_react4.default.useSyncExternalStore(navigationModel.subscribe, navigationModel.getSnapshot, navigationModel.getSnapshot);
  const [error, setError] = import_react4.default.useState("");
  const alive = import_react4.default.useRef(true);
  import_react4.default.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function run(id) {
    setError("");
    try {
      await navigationModel.run(id);
    } catch (reason) {
      if (alive.current) setError(reason?.message || "\u5165\u53E3\u6682\u65F6\u65E0\u6CD5\u6253\u5F00\uFF0C\u8BF7\u91CD\u8BD5\u3002");
    }
  }
  const stop5 = (event) => event.stopPropagation();
  return h4(
    "span",
    { className: "cgpt-rail-action-buttons", onClick: stop5, onPointerDown: stop5, onContextMenu: stop5 },
    snapshot2.visible.map((entry, index) => entry.kind !== "action" ? null : h4("button", {
      key: entry.id,
      type: "button",
      "aria-label": entry.label,
      title: entry.label,
      "data-cgpt-rail-action": entry.id,
      draggable: false,
      style: { order: index },
      onClick: () => run(entry.id)
    }, h4(ActionIcon, { name: entry.icon }))),
    error && h4("span", { className: "cgpt-rail-action-error", role: "alert" }, error)
  );
}
function RailOverflowContent({ navigationModel, MenuItem, onOpen, onDismiss }) {
  const snapshot2 = import_react4.default.useSyncExternalStore(navigationModel.subscribe, navigationModel.getSnapshot, navigationModel.getSnapshot);
  const [error, setError] = import_react4.default.useState("");
  const alive = import_react4.default.useRef(true);
  import_react4.default.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  import_react4.default.useEffect(() => {
    if (!snapshot2.showMore) onDismiss();
  }, [snapshot2.showMore, onDismiss]);
  async function run(entry) {
    setError("");
    try {
      if (entry.kind === "panel" && typeof onOpen === "function") onOpen(entry.id);
      else await navigationModel.run(entry.id);
      onDismiss();
    } catch (reason) {
      if (alive.current) setError(reason?.message || "\u5165\u53E3\u6682\u65F6\u65E0\u6CD5\u6253\u5F00\uFF0C\u8BF7\u91CD\u8BD5\u3002");
    }
  }
  return h4(
    import_react4.default.Fragment,
    null,
    snapshot2.overflow.map((entry) => h4(MenuItem, {
      key: entry.id,
      current: entry.active,
      onSelect: () => run(entry),
      ...entry.kind === "action" ? { icon: h4(ActionIcon, { name: entry.icon }) } : {}
    }, entry.label)),
    error && h4("div", { className: "cgpt-rail-overflow-error", role: "alert" }, error)
  );
}

// rail-dock-preferences.js
var DEFAULT_KEY = "cgpt-rail.dock.v1";
var MAX_ENTRIES = 128;
function normalize(value) {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length > MAX_ENTRIES || value.some((id) => typeof id !== "string" || !id.trim())) throw new TypeError("Dock \u5165\u53E3\u5FC5\u987B\u662F\u4E0D\u8D85\u8FC7 128 \u9879\u7684\u975E\u7A7A\u5B57\u7B26\u4E32\u5217\u8868\u3002");
  return Object.freeze([...new Set(value)]);
}
function createDockPreferences(options = {}) {
  let storage = options.storage, eventTarget = options.eventTarget;
  const key = options.key ?? DEFAULT_KEY;
  if (!Object.hasOwn(options, "storage")) {
    try {
      storage = globalThis.localStorage;
    } catch {
    }
  }
  if (!Object.hasOwn(options, "eventTarget")) {
    try {
      eventTarget = globalThis.window;
    } catch {
    }
  }
  const listeners = /* @__PURE__ */ new Set();
  let snapshot2 = null, disposed = false, listening = false;
  const equal = (a, b) => a === b || a !== null && b !== null && a.length === b.length && a.every((id, index) => id === b[index]);
  function read2() {
    const raw = storage?.getItem?.(key) ?? null;
    if (raw === null) return null;
    try {
      return normalize(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  function publish(next) {
    if (equal(snapshot2, next)) return;
    snapshot2 = next;
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
      }
    }
  }
  function sync() {
    try {
      publish(read2());
    } catch {
    }
  }
  function onStorage(event) {
    if (disposed || event.key !== key && event.key !== null) return;
    if (event.storageArea != null && event.storageArea !== storage) return;
    sync();
  }
  function detach() {
    if (!listening) return;
    eventTarget.removeEventListener("storage", onStorage);
    listening = false;
  }
  sync();
  return {
    getSnapshot: () => snapshot2,
    subscribe(listener) {
      if (disposed) return () => {
      };
      if (typeof listener !== "function") throw new TypeError("Dock preference listener must be a function.");
      const registered = () => listener();
      listeners.add(registered);
      if (listeners.size === 1) {
        if (typeof eventTarget?.addEventListener === "function" && typeof eventTarget?.removeEventListener === "function") {
          eventTarget.addEventListener("storage", onStorage);
          listening = true;
        }
        sync();
      }
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        listeners.delete(registered);
        if (listeners.size === 0) detach();
      };
    },
    set(ids) {
      if (disposed) throw new Error("Dock \u504F\u597D\u5DF2\u5173\u95ED\u3002");
      const next = normalize(ids);
      if (typeof storage?.setItem !== "function" || typeof storage?.removeItem !== "function") throw new Error("\u65E0\u6CD5\u4FDD\u5B58 Dock \u504F\u597D\uFF1A\u672C\u5730\u5B58\u50A8\u4E0D\u53EF\u7528\u3002");
      if (next === null) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(next));
      publish(next);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      detach();
      listeners.clear();
    }
  };
}

// rail-native-pins.js
var SIDEBAR = "sidebar";
var EMPTY2 = Object.freeze([]);
function createNativePanelPinsSource(slots) {
  const faces = /* @__PURE__ */ new WeakMap(), listeners = /* @__PURE__ */ new Set();
  let snapshot2 = EMPTY2, publishedSnapshot = EMPTY2;
  let stopSlot = null, stopInner = null, liveInner = null;
  function innerSource() {
    const entry = slots.entriesOfSlot(SIDEBAR).find((candidate) => candidate.locale === "sidebar" && typeof candidate.inject === "function");
    if (!entry) return null;
    if (!faces.has(entry)) {
      let source2 = null;
      try {
        const candidate = entry.inject()?.hooks?.entryPins;
        if (typeof candidate?.getSnapshot === "function" && typeof candidate?.subscribe === "function") source2 = candidate;
      } catch {
      }
      faces.set(entry, source2);
    }
    return faces.get(entry);
  }
  function refresh() {
    let ids;
    try {
      ids = innerSource()?.getSnapshot();
    } catch {
      ids = EMPTY2;
    }
    const next = Array.isArray(ids) ? [...new Set(ids.filter((id) => typeof id === "string" && id))] : EMPTY2;
    if (next.length === snapshot2.length && next.every((id, index) => id === snapshot2[index])) return;
    snapshot2 = next.length ? Object.freeze(next) : EMPTY2;
  }
  function rebind() {
    const next = innerSource();
    if (next === liveInner) return;
    const previousStop = stopInner;
    stopInner = null;
    liveInner = next;
    previousStop?.();
    if (next && listeners.size) {
      const release = next.subscribe(changed);
      if (liveInner === next && listeners.size) stopInner = release;
      else release();
    }
  }
  function changed() {
    rebind();
    refresh();
    if (snapshot2 === publishedSnapshot) return;
    publishedSnapshot = snapshot2;
    for (const listener of [...listeners]) listener();
  }
  function disconnect() {
    const releaseSlot = stopSlot, releaseInner = stopInner;
    stopSlot = null;
    stopInner = null;
    liveInner = null;
    releaseSlot?.();
    releaseInner?.();
  }
  refresh();
  publishedSnapshot = snapshot2;
  return {
    getSnapshot() {
      refresh();
      return snapshot2;
    },
    subscribe(listener) {
      const registered = () => listener();
      listeners.add(registered);
      if (listeners.size === 1) {
        try {
          const release = slots.subscribe(SIDEBAR, changed);
          if (listeners.size) stopSlot = release;
          else release();
          changed();
        } catch (error) {
          listeners.delete(registered);
          disconnect();
          throw error;
        }
      }
      return () => {
        listeners.delete(registered);
        if (!listeners.size) disconnect();
      };
    }
  };
}

// window-chrome-ui.js
var import_react5 = __toESM(require("react"), 1);
var import_react_dom = require("react-dom");

// window-drag-strip.js
function mountWindowDragStrip(frame) {
  const document2 = frame?.ownerDocument;
  if (document2?.documentElement?.dataset?.platform !== "darwin") return null;
  const node = document2.createElement("div");
  node.className = "cgpt-window-drag-strip";
  node.setAttribute("data-window-drag", "");
  node.setAttribute("aria-hidden", "true");
  frame.prepend(node);
  return { node, dispose: () => node.remove() };
}

// window-motion.js
var ATTRIBUTE = "data-cgpt-right-motion";
var PANEL = "[data-sidebar-right-session][data-sidebar-right-panel]";
var DOCK = '[data-dockkit-host="dock"]';
var LEASE_LIMIT_MS = 1e4;
function mountWindowMotion(frame) {
  if (typeof frame?.setAttribute !== "function") return { prepare: () => () => {
  }, dispose() {
  } };
  const view = frame.ownerDocument?.defaultView || globalThis;
  const setTimer = (callback, delay) => (view.setTimeout || globalThis.setTimeout).call(view, callback, delay);
  const clearTimer = (id) => (view.clearTimeout || globalThis.clearTimeout).call(view, id);
  let generation = 0, active = null, disposed = false;
  function cancelScheduled(operation) {
    if (operation.raf !== null) {
      if (operation.rafKind === "animation") {
        (view.cancelAnimationFrame || globalThis.cancelAnimationFrame)?.call(view, operation.raf);
      } else clearTimer(operation.raf);
      operation.raf = null;
    }
    if (operation.timer !== null) {
      clearTimer(operation.timer);
      operation.timer = null;
    }
  }
  function release(operation) {
    if (active !== operation) return;
    cancelScheduled(operation);
    active = null;
    if (frame.getAttribute(ATTRIBUTE) !== operation.token) return;
    if (operation.before === null) frame.removeAttribute(ATTRIBUTE);
    else frame.setAttribute(ATTRIBUTE, operation.before);
  }
  function flushPreparedStyle() {
    try {
      if (typeof view.getComputedStyle === "function") {
        void view.getComputedStyle(frame).gridTemplateColumns;
        return;
      }
    } catch {
    }
    try {
      if (typeof frame.getBoundingClientRect === "function") frame.getBoundingClientRect();
      else void frame.offsetWidth;
    } catch {
    }
  }
  function transitions(node, property) {
    let animations;
    try {
      animations = node.getAnimations?.() || [];
    } catch {
      return [];
    }
    return animations.filter((animation) => animation?.transitionProperty === property && animation.playState !== "finished" && animation.playState !== "idle");
  }
  function pendingTransitions() {
    const animations = transitions(frame, "grid-template-columns");
    for (const panel of frame.querySelectorAll?.(PANEL) || []) {
      if (panel.closest?.("[hidden]")) continue;
      for (const dock of panel.querySelectorAll?.(DOCK) || []) {
        if (!dock.closest?.("[hidden]")) animations.push(...transitions(dock, "transform"));
      }
    }
    return [...new Set(animations)];
  }
  function reducedMotion() {
    try {
      return Boolean(view.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    } catch {
      return false;
    }
  }
  function finish(operation) {
    if (disposed || active !== operation || operation.finishCalled) return;
    operation.finishCalled = true;
    const inspect = () => {
      operation.raf = null;
      if (disposed || active !== operation) return;
      if (reducedMotion()) {
        release(operation);
        return;
      }
      const animations = pendingTransitions();
      if (animations.length === 0) {
        release(operation);
        return;
      }
      const completions = animations.map((animation) => {
        try {
          return Promise.resolve(animation.finished);
        } catch (reason) {
          return Promise.reject(reason);
        }
      });
      Promise.allSettled(completions).then(() => {
        if (!disposed && active === operation) release(operation);
      });
    };
    const request = view.requestAnimationFrame || globalThis.requestAnimationFrame;
    operation.rafKind = typeof request === "function" ? "animation" : "timer";
    operation.raf = operation.rafKind === "animation" ? request.call(view, inspect) : setTimer(inspect, 0);
  }
  return {
    prepare() {
      if (disposed) return () => {
      };
      const current = frame.getAttribute(ATTRIBUTE);
      const before = active && current === active.token ? active.before : current;
      if (active) cancelScheduled(active);
      const operation = { token: String(++generation), before, raf: null, rafKind: null, timer: null, finishCalled: false };
      active = operation;
      frame.setAttribute(ATTRIBUTE, operation.token);
      flushPreparedStyle();
      operation.timer = setTimer(() => release(operation), LEASE_LIMIT_MS);
      return () => finish(operation);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (active) release(active);
    }
  };
}

// window-chrome-host.js
var PANEL2 = "[data-sidebar-right-session][data-sidebar-right-panel]";
var OBSERVED_ATTRIBUTES = Object.freeze([
  "data-sidebar-right-session",
  "data-sidebar-right-panel",
  "data-sidebar-right-open",
  "data-rightbar-fullscreen",
  "data-rightbar-collapsed",
  "hidden",
  "data-sidebar-drawer",
  "data-sidebar-collapsed"
]);
function mountWindowChrome(anchor) {
  const frame = anchor?.closest?.("[data-shell-overlay]")?.parentElement;
  const document2 = frame?.ownerDocument;
  if (!frame || !document2) return null;
  const undos = [];
  let disposed = false, observer = null, snapshot2, publishedSnapshot;
  const listeners = /* @__PURE__ */ new Set();
  function mark(node, name) {
    if (!node) return;
    const before = node.getAttribute(name), installed = "";
    node.setAttribute(name, installed);
    undos.push(() => {
      if (node.getAttribute(name) !== installed) return;
      if (before === null) node.removeAttribute(name);
      else node.setAttribute(name, before);
    });
  }
  const center = frame.querySelector("[data-rightbar-col]")?.previousElementSibling || frame.querySelector('[data-slot="sidebar"]')?.parentElement?.nextElementSibling;
  function ownLeadingWidth() {
    const column = frame.querySelector('[data-slot="sidebar"]')?.parentElement, style = frame.style;
    if (typeof column?.getBoundingClientRect !== "function" || typeof style?.getPropertyValue !== "function" || typeof style?.setProperty !== "function") return;
    const property = "--cgpt-window-leading", before = style.getPropertyValue(property), priority = style.getPropertyPriority?.(property) || "";
    let installed = null, resizeObserver = null;
    const sync = () => {
      if (disposed) return;
      const width = column.getBoundingClientRect().width;
      if (!Number.isFinite(width) || width < 0) return;
      installed = width + "px";
      if (style.getPropertyValue(property) !== installed) style.setProperty(property, installed);
    };
    undos.push(() => {
      resizeObserver?.disconnect();
      if (installed === null || style.getPropertyValue(property) !== installed) return;
      if (before) style.setProperty(property, before, priority);
      else style.removeProperty(property);
    });
    sync();
    const Observer = document2.defaultView?.ResizeObserver || globalThis.ResizeObserver;
    if (typeof Observer === "function") {
      resizeObserver = new Observer(sync);
      resizeObserver.observe(column);
    }
  }
  const seat = document2.createElement("div");
  seat.className = "cgpt-window-chrome-seat";
  const navigationSeat = document2.documentElement?.dataset?.platform === "darwin" ? document2.createElement("div") : null;
  if (navigationSeat) navigationSeat.className = "cgpt-window-navigation-seat";
  let dragStrip, motion;
  try {
    mark(frame, "data-cgpt-window-frame");
    mark(center, "data-cgpt-window-center");
    ownLeadingWidth();
    dragStrip = mountWindowDragStrip(frame);
    frame.appendChild(seat);
    if (navigationSeat) frame.appendChild(navigationSeat);
    motion = mountWindowMotion(frame);
    undos.push(() => motion.dispose());
  } catch (error) {
    seat.remove();
    navigationSeat?.remove();
    dragStrip?.dispose();
    for (const undo of undos.reverse()) undo();
    throw error;
  }
  function refresh() {
    if (navigationSeat) {
      if (frame.hasAttribute("data-sidebar-drawer") && !frame.hasAttribute("data-sidebar-collapsed")) navigationSeat.setAttribute("inert", "");
      else navigationSeat.removeAttribute("inert");
    }
    const panel = Array.from(frame.querySelectorAll(PANEL2)).find((node) => node.getAttribute("data-sidebar-right-session")?.trim() && !node.closest("[hidden]"));
    const sessionId = panel?.getAttribute("data-sidebar-right-session") || null;
    const expanded = Boolean(panel?.hasAttribute("data-sidebar-right-open"));
    const fullscreen = expanded && panel.getAttribute("data-sidebar-right-panel") === "fullscreen";
    if (snapshot2 && snapshot2.sessionId === sessionId && snapshot2.expanded === expanded && snapshot2.fullscreen === fullscreen) return;
    snapshot2 = Object.freeze({ sessionId, expanded, fullscreen });
  }
  function changed() {
    if (disposed) return;
    refresh();
    if (snapshot2 === publishedSnapshot) return;
    publishedSnapshot = snapshot2;
    for (const listener of [...listeners]) {
      if (disposed) break;
      listener();
    }
  }
  function disconnect() {
    observer?.disconnect();
    observer = null;
  }
  refresh();
  publishedSnapshot = snapshot2;
  const presentation = {
    getSnapshot() {
      if (!disposed) refresh();
      return snapshot2;
    },
    subscribe(listener) {
      if (disposed) return () => {
      };
      const registered = () => listener();
      listeners.add(registered);
      if (listeners.size === 1) {
        try {
          const Observer = document2.defaultView?.MutationObserver || globalThis.MutationObserver;
          if (typeof Observer === "function") {
            observer = new Observer(changed);
            observer.observe(frame, { childList: true, subtree: true, attributes: true, attributeFilter: [...OBSERVED_ATTRIBUTES] });
          }
          changed();
        } catch (error) {
          listeners.delete(registered);
          disconnect();
          throw error;
        }
      }
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        listeners.delete(registered);
        if (!listeners.size) disconnect();
      };
    }
  };
  return {
    frame,
    seat,
    navigationSeat,
    presentation,
    motion,
    dispose() {
      if (disposed) return;
      disposed = true;
      disconnect();
      listeners.clear();
      seat.remove();
      navigationSeat?.remove();
      dragStrip?.dispose();
      for (const undo of undos.reverse()) undo();
    }
  };
}

// window-chrome-model.js
var text = (value) => typeof value === "string" ? value.trim() : "";
var isSource = (value) => typeof value?.getSnapshot === "function" && typeof value?.subscribe === "function";
var failure2 = (code, message, cause) => Object.assign(new Error(message, cause === void 0 ? void 0 : { cause }), { name: "WindowChromeActionError", code });
function createWindowChromeModel(ctx, { presentation, motion, timeoutMs = 6e3 } = {}) {
  const { sessions, workspaces, layout, uiWorkspace, sidebarRight: sidebar, sidebarRightTabs: types } = ctx;
  const registrySource = typeof types?.subscribe === "function" ? { subscribe: (listener) => types.subscribe(listener) } : null;
  const sources = [...new Set([sessions?.list, workspaces?.list, layout?.panelInfo, sidebar?.mounted, sidebar?.openTabs, presentation, registrySource].filter((source2) => typeof source2?.subscribe === "function"))];
  const listeners = /* @__PURE__ */ new Set();
  const duration = Number.isFinite(timeoutMs) && timeoutMs >= 0 ? timeoutMs : 6e3;
  let subscriptions = [], snapshot2, publishedSnapshot, pending = null, disposed = false;
  const read2 = (source2, fallback) => {
    try {
      return source2?.getSnapshot?.() ?? fallback;
    } catch {
      return fallback;
    }
  };
  const panel = () => read2(layout?.panelInfo, { activePanelId: void 0 }).activePanelId;
  function catalog() {
    const list = read2(sessions?.list, { ids: [], byId: {} }), workspace = read2(workspaces?.list, { items: [], archivedSessionIds: [] });
    return { list, workspace, archived: new Set(workspace.archivedSessionIds || []) };
  }
  function contextOf({ list, archived }) {
    const candidates = Object.values(list.byId || {}).filter((summary) => summary && typeof summary.id === "string" && (summary.retainedBy?.mainView || 0) > 0 && !archived.has(summary.id) && (!summary.blank || panel() === null));
    const mounted = read2(sidebar?.mounted, null);
    return candidates.find((summary) => summary.id === mounted) || candidates[0] || null;
  }
  function capable() {
    if (disposed || typeof sidebar?.openTab !== "function" || typeof sidebar?.commandTarget !== "function" || typeof sidebar?.toggleFullscreen !== "function" || !isSource(sidebar?.mounted) || !isSource(presentation) || typeof layout?.selectPanel !== "function") return false;
    try {
      return Boolean(typeof types?.get === "function" ? types.get("guide") : types?.entries?.().find((entry) => entry.kind === "guide"));
    } catch {
      return false;
    }
  }
  function visibleExpanded() {
    const mounted = read2(sidebar?.mounted, null), shown = read2(presentation, null);
    return !disposed && panel() === null && typeof mounted === "string" && mounted.length > 0 && shown?.sessionId === mounted && shown.expanded === true;
  }
  function currentTabSession(data = catalog()) {
    const mounted = read2(sidebar?.mounted, null);
    return panel() === null && typeof mounted === "string" && mounted ? mounted : contextOf(data)?.id ?? null;
  }
  function hasTabsFor(id) {
    const tabs = read2(sidebar?.openTabs, null);
    return typeof id === "string" && Array.isArray(tabs) && tabs.some((tab) => tab?.sessionId === id);
  }
  function visibleExistingSession(id, data = catalog()) {
    const summary = data.list.byId?.[id];
    return panel() === null && typeof id === "string" && read2(sidebar?.mounted, null) === id && summary?.id === id && !summary.blank && !data.archived.has(id);
  }
  function expandable() {
    return isSource(sidebar?.mounted) && isSource(sidebar?.openTabs) && isSource(presentation) && typeof sidebar?.commandTarget === "function" && typeof sidebar?.toggleExpanded === "function" && typeof sidebar?.isExpanded === "function";
  }
  function refresh() {
    const data = catalog(), contextSummary = contextOf(data), workspaceTitles = /* @__PURE__ */ new Map();
    for (const workspace of data.workspace.items || []) for (const id of workspace.sessionIds || []) if (!workspaceTitles.has(id)) workspaceTitles.set(id, text(workspace.title) || text(workspace.name));
    const seen = /* @__PURE__ */ new Set(), rows = [];
    for (const id of [...data.list.ids || [], ...Object.keys(data.list.byId || {})]) {
      if (seen.has(id)) continue;
      seen.add(id);
      const summary = data.list.byId?.[id];
      if (!summary || summary.id !== id || summary.blank || data.archived.has(id)) continue;
      rows.push({ id, title: text(summary.title) || text(summary.projectionValues?.title) || "\u672A\u547D\u540D\u4F1A\u8BDD", workspaceTitle: workspaceTitles.get(id) || "" });
    }
    const context = contextSummary ? { id: contextSummary.id, title: text(contextSummary.title) || text(contextSummary.projectionValues?.title) || "\u672A\u547D\u540D\u4F1A\u8BDD" } : null;
    const currentId = currentTabSession(data), available = capable(), busy = Boolean(pending && !disposed), expanded = visibleExpanded(), hasTabs = !disposed && hasTabsFor(currentId), canExpand = !disposed && (hasTabs || visibleExistingSession(currentId, data));
    const sameContext = snapshot2 && (snapshot2.context === null || context === null ? snapshot2.context === context : snapshot2.context.id === context.id && snapshot2.context.title === context.title);
    const sameRows = snapshot2 && snapshot2.sessions.length === rows.length && rows.every((row, index) => {
      const previous = snapshot2.sessions[index];
      return row.id === previous.id && row.title === previous.title && row.workspaceTitle === previous.workspaceTitle;
    });
    if (snapshot2 && snapshot2.available === available && snapshot2.busy === busy && snapshot2.expanded === expanded && snapshot2.hasTabs === hasTabs && snapshot2.canExpand === canExpand && sameContext && sameRows) return;
    snapshot2 = Object.freeze({ context: context && Object.freeze(context), sessions: Object.freeze(rows.map((row) => Object.freeze(row))), available, busy, expanded, hasTabs, canExpand });
  }
  function changed() {
    refresh();
    if (snapshot2 === publishedSnapshot) return;
    publishedSnapshot = snapshot2;
    for (const listener of [...listeners]) try {
      listener();
    } catch {
    }
  }
  function mutate(action) {
    let finish;
    try {
      if (typeof motion?.prepare === "function") finish = motion.prepare();
    } catch (reason) {
      throw failure2("motion-failed", "\u7A97\u53E3\u8FC7\u6E21\u51C6\u5907\u5931\u8D25\uFF0C\u672A\u6267\u884C\u53F3\u4FA7\u680F\u64CD\u4F5C\u3002", reason);
    }
    try {
      return action();
    } finally {
      try {
        if (typeof finish === "function") finish();
      } catch {
      }
    }
  }
  function abortReason(operation) {
    return operation.controller.signal.reason || failure2("cancelled", "\u5DF2\u53D6\u6D88\u7A97\u53E3\u64CD\u4F5C\u3002");
  }
  function collapseGuard(operation) {
    if (disposed || operation.controller.signal.aborted) throw abortReason(operation);
    if (!isSource(sidebar?.mounted) || !isSource(presentation) || typeof sidebar?.commandTarget !== "function" || typeof sidebar?.toggleExpanded !== "function" || typeof sidebar?.isExpanded !== "function") throw failure2("unavailable", "\u539F\u751F\u53F3\u4FA7\u680F\u6682\u65F6\u65E0\u6CD5\u6536\u8D77\u3002");
    if (panel() !== null) throw failure2("cancelled", "\u9875\u9762\u5DF2\u5207\u6362\uFF0C\u5DF2\u505C\u6B62\u6536\u8D77\u53F3\u4FA7\u680F\u3002");
    const mounted = read2(sidebar.mounted, null), shown = read2(presentation, null);
    if (mounted !== operation.id && !(operation.issued && mounted == null && (!shown?.expanded || shown.sessionId === operation.id))) throw failure2("cancelled", "\u4F1A\u8BDD\u9762\u677F\u5DF2\u5207\u6362\uFF0C\u5DF2\u505C\u6B62\u6536\u8D77\u53F3\u4FA7\u680F\u3002");
    if (shown?.expanded && shown.sessionId !== operation.id) throw failure2("cancelled", "\u53F3\u4FA7\u680F\u5DF2\u5207\u6362\uFF0C\u5DF2\u505C\u6B62\u6536\u8D77\u64CD\u4F5C\u3002");
  }
  function expandGuard(operation) {
    if (disposed || operation.controller.signal.aborted) throw abortReason(operation);
    if (!expandable()) throw failure2("unavailable", "\u539F\u751F\u53F3\u4FA7\u680F\u6682\u65F6\u65E0\u6CD5\u5C55\u5F00\u3002");
    const data = catalog(), retained = contextOf(data)?.id ?? null, mounted = read2(sidebar.mounted, null);
    if (operation.catalogBound) {
      const summary = data.list.byId?.[operation.id];
      if (!summary || data.archived.has(operation.id) || summary.blank && !operation.allowBlank) throw failure2("session-unavailable", "\u539F\u4F1A\u8BDD\u5DF2\u4E0D\u53EF\u7528\uFF0C\u672A\u5C55\u5F00\u53F3\u4FA7\u680F\u3002");
      if (retained !== operation.id) throw failure2("cancelled", "\u4F1A\u8BDD\u5DF2\u5207\u6362\uFF0C\u5DF2\u505C\u6B62\u5C55\u5F00\u53F3\u4FA7\u680F\u3002");
    }
    if (operation.hadTabs && !hasTabsFor(operation.id)) throw failure2("cancelled", "\u539F\u6807\u7B7E\u9875\u5DF2\u5173\u95ED\uFF0C\u672A\u5C55\u5F00\u53F3\u4FA7\u680F\u3002");
    if (!operation.hadTabs && !visibleExistingSession(operation.id, data)) throw failure2("cancelled", "\u539F\u4F1A\u8BDD\u5DF2\u5207\u6362\u6216\u4E0D\u53EF\u7528\uFF0C\u672A\u5C55\u5F00\u53F3\u4FA7\u680F\u3002");
    if (!operation.navigationIssued) {
      if (panel() !== operation.initialPanel || mounted !== operation.initialMounted) throw failure2("cancelled", "\u9875\u9762\u6216\u4F1A\u8BDD\u5DF2\u5207\u6362\uFF0C\u5DF2\u505C\u6B62\u5C55\u5F00\u53F3\u4FA7\u680F\u3002");
      return;
    }
    if (panel() !== null) throw failure2("cancelled", "\u9875\u9762\u5DF2\u5207\u6362\uFF0C\u5DF2\u505C\u6B62\u5C55\u5F00\u53F3\u4FA7\u680F\u3002");
    if (mounted === operation.id) operation.surfaceReady = true;
    else if (operation.surfaceReady || mounted != null) throw failure2("cancelled", "\u4F1A\u8BDD\u9762\u677F\u5DF2\u5207\u6362\uFF0C\u5DF2\u505C\u6B62\u5C55\u5F00\u53F3\u4FA7\u680F\u3002");
  }
  function guard(operation) {
    if (operation.kind === "collapse") {
      collapseGuard(operation);
      return;
    }
    if (operation.kind === "expand") {
      expandGuard(operation);
      return;
    }
    if (disposed || operation.controller.signal.aborted) throw abortReason(operation);
    if (!capable()) throw failure2("unavailable", "\u539F\u751F\u6807\u7B7E\u9875\u529F\u80FD\u6682\u65F6\u4E0D\u53EF\u7528\uFF0C\u8BF7\u68C0\u67E5\u53F3\u4FA7\u680F\u63D2\u4EF6\u3002");
    if (operation.id === void 0) return;
    const data = catalog(), summary = data.list.byId?.[operation.id];
    if (!summary || summary.id !== operation.id || data.archived.has(operation.id) || summary.blank && !operation.allowBlank) throw failure2("session-unavailable", "\u6240\u9009\u4F1A\u8BDD\u5DF2\u4E0D\u53EF\u7528\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u5DF2\u6709\u4F1A\u8BDD\u3002");
    if (!operation.navigationIssued) return;
    if (panel() !== null) throw failure2("cancelled", "\u9875\u9762\u5DF2\u5207\u6362\uFF0C\u5DF2\u53D6\u6D88\u65B0\u5EFA\u6807\u7B7E\u9875\u3002");
    const retained = contextOf(data)?.id ?? null;
    if (retained === operation.id) operation.retainedReady = true;
    else if (operation.retainedReady || retained !== null && retained !== operation.initialContext) throw failure2("cancelled", "\u4F1A\u8BDD\u5DF2\u5207\u6362\uFF0C\u5DF2\u53D6\u6D88\u65B0\u5EFA\u6807\u7B7E\u9875\u3002");
    const mounted = read2(sidebar.mounted, null);
    if (mounted === operation.id) operation.surfaceReady = true;
    else if (operation.surfaceReady || mounted != null && mounted !== operation.initialMounted && mounted !== operation.initialContext) throw failure2("cancelled", "\u4F1A\u8BDD\u9762\u677F\u5DF2\u5207\u6362\uFF0C\u5DF2\u53D6\u6D88\u65B0\u5EFA\u6807\u7B7E\u9875\u3002");
  }
  function waitFor(operation, condition, message) {
    return new Promise((resolve, reject) => {
      let settled = false, timer = null;
      const stops = [];
      const cleanup = () => {
        if (timer !== null) clearTimeout(timer);
        operation.controller.signal.removeEventListener("abort", abort);
        for (const stop5 of stops.splice(0)) stop5();
      };
      const finish = (ok, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        (ok ? resolve : reject)(value);
      };
      const abort = () => finish(false, abortReason(operation));
      const check = () => {
        if (settled) return;
        try {
          guard(operation);
          const result = condition();
          if (result) finish(true, result);
        } catch (reason) {
          finish(false, reason);
        }
      };
      operation.controller.signal.addEventListener("abort", abort, { once: true });
      const remaining = Math.max(0, operation.deadline - Date.now());
      timer = setTimeout(() => finish(false, failure2("timeout", message)), remaining);
      try {
        for (const source2 of sources) {
          if (settled) break;
          const stop5 = source2.subscribe(check);
          if (settled) stop5();
          else stops.push(stop5);
        }
        check();
      } catch (reason) {
        finish(false, reason);
      }
    });
  }
  function awaitAction(operation, value, message) {
    if (typeof value?.then !== "function") return Promise.resolve();
    let reason, rejected = false;
    const result = Promise.resolve(value).then(() => {
    }, (error) => {
      rejected = true;
      reason = error;
    });
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (ok, value2) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        operation.controller.signal.removeEventListener("abort", abort);
        (ok ? resolve : reject)(value2);
      };
      const abort = () => finish(false, abortReason(operation));
      const timer = setTimeout(() => finish(false, failure2("timeout", message)), Math.max(0, operation.deadline - Date.now()));
      operation.controller.signal.addEventListener("abort", abort, { once: true });
      if (operation.controller.signal.aborted) abort();
      result.then(() => {
        if (rejected) finish(false, reason ?? failure2("action-failed", "\u539F\u751F\u6807\u7B7E\u9875\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002"));
        else finish(true);
      });
    });
  }
  async function run(operation, { fullscreen = false, sessionId } = {}) {
    guard(operation);
    const initial = getSnapshot(), explicit = sessionId !== void 0;
    const id = explicit ? sessionId : initial.context?.id;
    if (typeof id !== "string" || !id) throw failure2("choose-session", "\u8BF7\u5148\u9009\u62E9\u4E00\u4E2A\u5DF2\u6709\u4F1A\u8BDD\uFF0C\u518D\u65B0\u5EFA\u6807\u7B7E\u9875\u3002");
    const data = catalog(), summary = data.list.byId?.[id];
    const allowBlank = Boolean(summary?.blank && initial.context?.id === id && panel() === null);
    if (!summary || summary.id !== id || data.archived.has(id) || summary.blank && !allowBlank) throw failure2("session-unavailable", "\u8BF7\u9009\u62E9\u4E00\u4E2A\u53EF\u7528\u7684\u5DF2\u6709\u4F1A\u8BDD\u3002");
    Object.assign(operation, { id, allowBlank, initialContext: initial.context?.id ?? null, initialMounted: read2(sidebar.mounted, null), retainedReady: initial.context?.id === id, surfaceReady: false, navigationIssued: false });
    if (id !== initial.context?.id) {
      if (typeof uiWorkspace?.openSession !== "function") throw failure2("unavailable", "\u5F53\u524D\u65E0\u6CD5\u6253\u5F00\u6240\u9009\u4F1A\u8BDD\u3002");
      await awaitAction(operation, uiWorkspace.openSession(id), "\u6253\u5F00\u6240\u9009\u4F1A\u8BDD\u8D85\u65F6\uFF0C\u8BF7\u91CD\u8BD5\u3002");
    } else if (panel() !== null) layout.selectPanel(null);
    operation.navigationIssued = true;
    await waitFor(operation, () => {
      const target = sidebar.commandTarget(null);
      return operation.retainedReady && read2(sidebar.mounted, null) === id && target?.sessionId === id;
    }, "\u4F1A\u8BDD\u9762\u677F\u51C6\u5907\u8D85\u65F6\uFF0C\u5C1A\u672A\u65B0\u5EFA\u6807\u7B7E\u9875\uFF0C\u8BF7\u91CD\u8BD5\u3002");
    guard(operation);
    await awaitAction(operation, mutate(() => sidebar.openTab("guide", { revealIfOpened: false })), "\u65B0\u5EFA\u6807\u7B7E\u9875\u7ED3\u679C\u5C1A\u672A\u786E\u8BA4\uFF0C\u8BF7\u68C0\u67E5\u53F3\u4FA7\u680F\u3002");
    operation.opened = true;
    await waitFor(operation, () => {
      const shown = read2(presentation, null);
      return shown?.sessionId === id && shown.expanded;
    }, "\u6807\u7B7E\u9875\u5165\u53E3\u5C1A\u672A\u663E\u793A\uFF0C\u8BF7\u68C0\u67E5\u53F3\u4FA7\u680F\u3002");
    guard(operation);
    if (fullscreen) {
      if (!read2(presentation, null)?.fullscreen) {
        const target = sidebar.commandTarget(null);
        if (target?.sessionId !== id) throw failure2("cancelled", "\u4F1A\u8BDD\u9762\u677F\u5DF2\u5207\u6362\uFF0C\u5B8C\u6574\u89C6\u56FE\u672A\u5207\u6362\u3002");
        await awaitAction(operation, sidebar.toggleFullscreen(target), "\u5B8C\u6574\u89C6\u56FE\u5207\u6362\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u53F3\u4FA7\u680F\u3002");
      }
      await waitFor(operation, () => {
        const shown = read2(presentation, null);
        return shown?.sessionId === id && shown.expanded && shown.fullscreen;
      }, "\u5B8C\u6574\u89C6\u56FE\u5207\u6362\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u53F3\u4FA7\u680F\u3002");
      guard(operation);
    }
    return Object.freeze({ sessionId: id, fullscreen: Boolean(fullscreen) });
  }
  async function collapse(operation) {
    collapseGuard(operation);
    if (!visibleExpanded() || !sidebar.isExpanded()) return Object.freeze({ collapsed: false });
    const target = sidebar.commandTarget(null);
    if (target?.sessionId !== operation.id) throw failure2("cancelled", "\u53F3\u4FA7\u680F\u76EE\u6807\u5DF2\u53D8\u5316\uFF0C\u672A\u6267\u884C\u6536\u8D77\u64CD\u4F5C\u3002");
    collapseGuard(operation);
    if (!visibleExpanded() || !sidebar.isExpanded()) return Object.freeze({ collapsed: false });
    collapseGuard(operation);
    const result = mutate(() => sidebar.toggleExpanded());
    operation.issued = true;
    await awaitAction(operation, result, "\u5DF2\u8BF7\u6C42\u6536\u8D77\uFF0C\u4F46\u53F3\u4FA7\u680F\u72B6\u6001\u5C1A\u672A\u786E\u8BA4\uFF0C\u8BF7\u68C0\u67E5\u3002");
    await waitFor(operation, () => {
      const shown = read2(presentation, null);
      return read2(sidebar.mounted, null) == null || !shown?.expanded || shown.sessionId !== operation.id;
    }, "\u5DF2\u8BF7\u6C42\u6536\u8D77\uFF0C\u4F46\u53F3\u4FA7\u680F\u72B6\u6001\u5C1A\u672A\u786E\u8BA4\uFF0C\u8BF7\u68C0\u67E5\u3002");
    collapseGuard(operation);
    return Object.freeze({ sessionId: operation.id, collapsed: true });
  }
  async function expand(operation) {
    expandGuard(operation);
    if (operation.initialPanel !== null) {
      if (typeof layout?.selectPanel !== "function") throw failure2("unavailable", "\u5F53\u524D\u65E0\u6CD5\u8FD4\u56DE\u539F\u4F1A\u8BDD\u4EE5\u5C55\u5F00\u53F3\u4FA7\u680F\u3002");
      layout.selectPanel(null);
    }
    operation.navigationIssued = true;
    await waitFor(operation, () => {
      const target2 = sidebar.commandTarget(null);
      return read2(sidebar.mounted, null) === operation.id && target2?.sessionId === operation.id;
    }, "\u539F\u4F1A\u8BDD\u9762\u677F\u51C6\u5907\u8D85\u65F6\uFF0C\u5C1A\u672A\u5C55\u5F00\u53F3\u4FA7\u680F\uFF0C\u8BF7\u91CD\u8BD5\u3002");
    expandGuard(operation);
    const target = sidebar.commandTarget(null);
    if (target?.sessionId !== operation.id) throw failure2("cancelled", "\u53F3\u4FA7\u680F\u76EE\u6807\u5DF2\u53D8\u5316\uFF0C\u672A\u6267\u884C\u5C55\u5F00\u64CD\u4F5C\u3002");
    expandGuard(operation);
    const expanded = sidebar.isExpanded();
    expandGuard(operation);
    if (!expanded) {
      const result = mutate(() => sidebar.toggleExpanded());
      operation.issued = true;
      await awaitAction(operation, result, "\u5DF2\u8BF7\u6C42\u5C55\u5F00\uFF0C\u4F46\u53F3\u4FA7\u680F\u72B6\u6001\u5C1A\u672A\u786E\u8BA4\uFF0C\u8BF7\u68C0\u67E5\u3002");
    }
    await waitFor(operation, () => {
      const shown = read2(presentation, null);
      return shown?.sessionId === operation.id && shown.expanded === true && sidebar.isExpanded() === true;
    }, "\u5DF2\u8BF7\u6C42\u5C55\u5F00\uFF0C\u4F46\u53F3\u4FA7\u680F\u72B6\u6001\u5C1A\u672A\u786E\u8BA4\uFF0C\u8BF7\u68C0\u67E5\u3002");
    expandGuard(operation);
    return Object.freeze({ sessionId: operation.id, expanded: true });
  }
  function getSnapshot() {
    refresh();
    return snapshot2;
  }
  refresh();
  publishedSnapshot = snapshot2;
  return {
    getSnapshot,
    subscribe(listener) {
      if (disposed) return () => {
      };
      const registered = () => listener();
      listeners.add(registered);
      if (listeners.size === 1) {
        try {
          for (const source2 of sources) {
            if (disposed || !listeners.size) break;
            const stop5 = source2.subscribe(changed);
            if (disposed || !listeners.size) stop5();
            else subscriptions.push(stop5);
          }
          if (!disposed && listeners.size) changed();
        } catch (reason) {
          for (const stop5 of subscriptions.splice(0)) stop5();
          listeners.delete(registered);
          throw reason;
        }
      }
      return () => {
        listeners.delete(registered);
        if (!listeners.size) for (const stop5 of subscriptions.splice(0)) stop5();
      };
    },
    openTab(options = {}) {
      if (disposed) return Promise.reject(failure2("closed", "\u7A97\u53E3\u5DE5\u5177\u5DF2\u5173\u95ED\u3002"));
      if (pending) return pending.kind === "open" ? pending.promise : Promise.reject(failure2("busy", "\u7A97\u53E3\u64CD\u4F5C\u6B63\u5728\u8FDB\u884C\uFF0C\u8BF7\u7A0D\u540E\u518D\u65B0\u5EFA\u6807\u7B7E\u9875\u3002"));
      const request = { fullscreen: Boolean(options.fullscreen), ...options.sessionId === void 0 ? {} : { sessionId: options.sessionId } };
      const operation = { kind: "open", controller: new AbortController(), deadline: Date.now() + duration, id: void 0, navigationIssued: false, opened: false };
      operation.promise = Promise.resolve().then(() => run(operation, request)).catch((reason) => {
        if (operation.opened) {
          const prefix = request.fullscreen ? "\u6807\u7B7E\u9875\u5DF2\u6253\u5F00\uFF0C\u4F46\u5B8C\u6574\u89C6\u56FE\u672A\u5207\u6362\u3002" : "\u6807\u7B7E\u9875\u5DF2\u6253\u5F00\uFF0C\u4F46\u5165\u53E3\u663E\u793A\u5C1A\u672A\u786E\u8BA4\u3002";
          throw failure2(request.fullscreen ? "partial-fullscreen" : "partial-open", prefix + (reason?.message || "\u8BF7\u68C0\u67E5\u53F3\u4FA7\u680F\u3002"), reason);
        }
        throw reason;
      }).finally(() => {
        if (pending === operation) pending = null;
        changed();
      });
      pending = operation;
      changed();
      return operation.promise;
    },
    collapsePanel() {
      if (disposed) return Promise.reject(failure2("closed", "\u7A97\u53E3\u5DE5\u5177\u5DF2\u5173\u95ED\u3002"));
      if (pending) return pending.kind === "collapse" ? pending.promise : Promise.reject(failure2("busy", "\u7A97\u53E3\u64CD\u4F5C\u6B63\u5728\u8FDB\u884C\uFF0C\u8BF7\u7A0D\u540E\u518D\u6536\u8D77\u53F3\u4FA7\u680F\u3002"));
      if (!visibleExpanded()) return Promise.resolve(Object.freeze({ collapsed: false }));
      const operation = { kind: "collapse", id: read2(sidebar.mounted, null), controller: new AbortController(), deadline: Date.now() + duration, issued: false };
      operation.promise = Promise.resolve().then(() => collapse(operation)).finally(() => {
        if (pending === operation) pending = null;
        changed();
      });
      pending = operation;
      changed();
      return operation.promise;
    },
    expandPanel() {
      if (disposed) return Promise.reject(failure2("closed", "\u7A97\u53E3\u5DE5\u5177\u5DF2\u5173\u95ED\u3002"));
      if (pending) return pending.kind === "expand" ? pending.promise : Promise.reject(failure2("busy", "\u7A97\u53E3\u64CD\u4F5C\u6B63\u5728\u8FDB\u884C\uFF0C\u8BF7\u7A0D\u540E\u518D\u5C55\u5F00\u53F3\u4FA7\u680F\u3002"));
      const data = catalog(), id = currentTabSession(data), hadTabs = hasTabsFor(id);
      if (!hadTabs && !visibleExistingSession(id, data)) return Promise.resolve(Object.freeze({ expanded: false }));
      const context = contextOf(data), summary = data.list.byId?.[id];
      const operation = { kind: "expand", id, hadTabs, initialPanel: panel(), initialMounted: read2(sidebar?.mounted, null), catalogBound: context?.id === id, allowBlank: Boolean(summary?.blank && panel() === null), controller: new AbortController(), deadline: Date.now() + duration, navigationIssued: false, surfaceReady: false, issued: false };
      operation.promise = Promise.resolve().then(() => expand(operation)).finally(() => {
        if (pending === operation) pending = null;
        changed();
      });
      pending = operation;
      changed();
      return operation.promise;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pending?.controller.abort(failure2("closed", "\u7A97\u53E3\u5DE5\u5177\u5DF2\u5173\u95ED\uFF0C\u5DF2\u53D6\u6D88\u7B49\u5F85\u3002"));
      for (const stop5 of subscriptions.splice(0)) stop5();
      listeners.clear();
      refresh();
      publishedSnapshot = snapshot2;
    }
  };
}

// window-navigation-model.js
var source = (value) => typeof value?.getSnapshot === "function" && typeof value?.subscribe === "function";
var same = (a, b) => a?.kind === b?.kind && a?.id === b?.id;
function createWindowNavigationModel(ctx, { limit = 80 } = {}) {
  const { layout, uiWorkspace, sessions, workspaces, slots } = ctx;
  const capacity = Number.isFinite(limit) ? Math.max(2, Math.min(80, Math.floor(limit))) : 80;
  const selection = source(uiWorkspace?.selection) ? uiWorkspace.selection : null;
  const sources = [...new Set([layout?.panelInfo, selection, sessions?.list, workspaces?.list].filter(source))];
  const listeners = /* @__PURE__ */ new Set();
  let entries = [], cursor = -1, snapshot2, subscriptions = [], queued = false, epoch = 0, disposed = false;
  const read2 = (observable, fallback) => observable?.getSnapshot?.() ?? fallback;
  function panelExists(id) {
    const list = typeof slots?.entries === "function" ? slots.entries("main") : slots?.entriesOfSlot?.("main");
    return Array.isArray(list) && list.some((entry) => entry.options?.key === id);
  }
  function available(entry) {
    if (!entry) return false;
    if (entry.kind === "panel") return typeof layout?.selectPanel === "function" && panelExists(entry.id);
    const catalog = read2(sessions?.list, { byId: {} });
    return typeof uiWorkspace?.openSession === "function" && Boolean(catalog.byId?.[entry.id]) && !read2(workspaces?.list, {}).archivedSessionIds?.includes(entry.id);
  }
  function current() {
    const panel = read2(layout?.panelInfo, {}).activePanelId;
    if (typeof panel === "string") {
      const entry2 = { kind: "panel", id: panel };
      return available(entry2) ? entry2 : null;
    }
    if (panel !== null) return null;
    const selected = selection ? read2(selection, {}) : null;
    const id = selection ? selected.sessionId : Object.values(read2(sessions?.list, { byId: {} }).byId || {}).find((row) => (row?.retainedBy?.mainView || 0) > 0)?.id;
    if (typeof id !== "string" || !id) return null;
    const entry = { kind: "session", id, ...selected?.subagentAddress ? { target: { ...selected.subagentAddress } } : {} };
    return available(entry) ? entry : null;
  }
  function seek(direction) {
    for (let index = cursor + direction; index >= 0 && index < entries.length; index += direction) {
      if (available(entries[index]) && !same(entries[index], entries[cursor])) return index;
    }
    return -1;
  }
  function publish() {
    const selected = entries[cursor];
    const next = {
      canBack: !disposed && seek(-1) !== -1,
      canForward: !disposed && seek(1) !== -1,
      current: selected ? Object.freeze({ kind: selected.kind, id: selected.id }) : null
    };
    if (snapshot2 && snapshot2.canBack === next.canBack && snapshot2.canForward === next.canForward && same(snapshot2.current, next.current)) return;
    snapshot2 = Object.freeze(next);
    for (const listener of [...listeners]) listener();
  }
  function settle() {
    if (disposed) return;
    queued = false;
    const selected = current();
    if (selected && !same(selected, entries[cursor])) {
      entries = entries.slice(0, cursor + 1);
      entries.push(selected);
      if (entries.length > capacity) entries.splice(0, entries.length - capacity);
      cursor = entries.length - 1;
    } else if (selected) {
      entries[cursor] = selected;
    }
    publish();
  }
  function changed() {
    if (disposed || queued) return;
    queued = true;
    const scheduled = epoch;
    queueMicrotask(() => {
      if (!disposed && queued && epoch === scheduled) settle();
    });
  }
  function disconnect() {
    epoch++;
    queued = false;
    for (const stop5 of subscriptions.splice(0).reverse()) stop5();
  }
  function move(direction) {
    if (disposed) return false;
    settle();
    const index = seek(direction);
    if (index === -1) return false;
    const entry = entries[index];
    if (entry.kind === "panel") layout.selectPanel(entry.id);
    else uiWorkspace.openSession(entry.target ?? entry.id);
    if (!same(current(), entry)) return false;
    cursor = index;
    publish();
    return true;
  }
  settle();
  return {
    getSnapshot: () => snapshot2,
    subscribe(listener) {
      if (disposed) return () => {
      };
      const registered = () => listener();
      listeners.add(registered);
      if (listeners.size === 1) {
        try {
          for (const observable of sources) subscriptions.push(observable.subscribe(changed));
          if (typeof slots?.subscribe === "function") subscriptions.push(slots.subscribe("main", changed));
          settle();
        } catch (error) {
          listeners.delete(registered);
          disconnect();
          throw error;
        }
      }
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        listeners.delete(registered);
        if (!listeners.size) disconnect();
      };
    },
    back: () => move(-1),
    forward: () => move(1),
    dispose() {
      if (disposed) return;
      disposed = true;
      disconnect();
      listeners.clear();
      entries = [];
      cursor = -1;
      publish();
    }
  };
}

// window-chrome-ui.js
var h5 = import_react5.default.createElement;
var stop = (event) => event.stopPropagation();
function PlusIcon() {
  return h5("svg", { width: 18, height: 18, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.35, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }, h5("rect", { x: 3, y: 3, width: 14, height: 14, rx: 2.5 }), h5("path", { d: "M10 6.5v7M6.5 10h7" }));
}
function CollapseIcon() {
  return h5("svg", { width: 18, height: 18, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.35, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }, h5("rect", { x: 3, y: 3, width: 14, height: 14, rx: 2.5 }), h5("path", { d: "M12 3v14" }));
}
function ExpandIcon() {
  return h5("svg", { width: 16, height: 16, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }, h5("path", { d: "M3.5 8V3.5H8M12 3.5h4.5V8M16.5 12v4.5H12M8 16.5H3.5V12" }));
}
function NavigationArrow({ forward = false }) {
  return h5(
    "svg",
    { width: 16, height: 16, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    h5("path", { d: forward ? "M4 10h12M10.5 4.5 16 10l-5.5 5.5" : "M16 10H4M9.5 4.5 4 10l5.5 5.5" })
  );
}
function WindowNavigationToolbar({ model }) {
  const snapshot2 = import_react5.default.useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  const [error, setError] = import_react5.default.useState(null);
  const alive = import_react5.default.useRef(true);
  import_react5.default.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  import_react5.default.useEffect(() => setError(null), [snapshot2.current]);
  async function navigate(direction) {
    setError(null);
    try {
      await model[direction]();
    } catch (reason) {
      if (alive.current) setError(reason?.message || "\u6682\u65F6\u65E0\u6CD5\u5207\u6362\u9875\u9762\uFF0C\u8BF7\u91CD\u8BD5\u3002");
    }
  }
  return h5(
    "div",
    { className: "cgpt-window-navigation", role: "group", "aria-label": "\u9875\u9762\u5BFC\u822A", onClick: stop, onPointerDown: stop, onContextMenu: stop },
    h5("button", { type: "button", className: "cgpt-window-navigation-button", "aria-label": "\u8FD4\u56DE", title: "\u8FD4\u56DE", disabled: !snapshot2.canBack, onClick: () => navigate("back") }, h5(NavigationArrow)),
    h5("button", { type: "button", className: "cgpt-window-navigation-button", "aria-label": "\u524D\u8FDB", title: "\u524D\u8FDB", disabled: !snapshot2.canForward, onClick: () => navigate("forward") }, h5(NavigationArrow, { forward: true })),
    error && h5("div", { className: "cgpt-window-notice", "data-error": true, role: "alert" }, h5("span", null, error), h5("button", { type: "button", "aria-label": "\u5173\u95ED\u63D0\u793A", onClick: () => setError(null) }, "\xD7"))
  );
}
function WindowChromeToolbar({ model, Menu: Menu2, MenuItem, Modal }) {
  const snapshot2 = import_react5.default.useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  const [open, setOpen] = import_react5.default.useState(false), [picker, setPicker] = import_react5.default.useState(null), [query, setQuery] = import_react5.default.useState(""), [notice, setNotice] = import_react5.default.useState(null);
  const [direction, setDirection] = import_react5.default.useState(null);
  const alive = import_react5.default.useRef(true);
  const action = import_react5.default.useRef(null), scope = import_react5.default.useRef({ model, id: snapshot2.context?.id ?? null });
  const contextId = snapshot2.context?.id ?? null;
  if (scope.current.model !== model || scope.current.id !== contextId) {
    const pending = action.current;
    if (pending && !pending.invalid && pending.model === model && pending.target === contextId && !pending.switched && pending.from !== contextId) pending.switched = true;
    else if (pending) pending.invalid = true;
    scope.current = { model, id: contextId };
  }
  import_react5.default.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  import_react5.default.useEffect(() => {
    if (!notice || notice.error) return;
    const timer = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  import_react5.default.useEffect(() => {
    setOpen(false);
    setPicker(null);
  }, [snapshot2.expanded, snapshot2.hasTabs, snapshot2.canExpand, contextId, model]);
  const closeMenu = import_react5.default.useCallback(() => setOpen(false), []);
  const closePicker = import_react5.default.useCallback(() => setPicker(null), []);
  function begin(target = contextId) {
    const ticket = { model, target, from: contextId, switched: false, invalid: false };
    action.current = ticket;
    return ticket;
  }
  const current = (ticket) => alive.current && action.current === ticket && !ticket.invalid;
  async function run(fullscreen, sessionId) {
    const ticket = begin(sessionId ?? contextId);
    setOpen(false);
    setPicker(null);
    setNotice(null);
    try {
      await model.openTab({ fullscreen, ...sessionId ? { sessionId } : {} });
      if (current(ticket)) setNotice({ error: false, text: fullscreen ? "\u5DF2\u5728\u5B8C\u6574\u89C6\u56FE\u6253\u5F00\u6807\u7B7E\u9875\u5165\u53E3\u3002" : "\u5DF2\u6253\u5F00\u6807\u7B7E\u9875\u5165\u53E3\uFF0C\u53EF\u9009\u62E9\u6587\u4EF6\u3001\u7EC8\u7AEF\u6216\u6D4F\u89C8\u5668\u3002" });
    } catch (reason) {
      if (current(ticket) && reason?.code !== "cancelled") setNotice({ error: true, text: reason?.message || "\u6682\u65F6\u65E0\u6CD5\u6253\u5F00\u6807\u7B7E\u9875\uFF0C\u8BF7\u91CD\u8BD5\u3002" });
    }
  }
  async function changePanel(next) {
    if (snapshot2.busy || direction) return;
    const ticket = begin();
    setOpen(false);
    setPicker(null);
    setNotice(null);
    setDirection(next);
    try {
      await (next === "expand" ? model.expandPanel() : model.collapsePanel());
    } catch (reason) {
      if (current(ticket) && reason?.code !== "cancelled") setNotice({ error: true, text: reason?.message || "\u6682\u65F6\u65E0\u6CD5\u5207\u6362\u53F3\u4FA7\u9762\u677F\uFF0C\u8BF7\u91CD\u8BD5\u3002" });
    } finally {
      if (alive.current && action.current === ticket) setDirection(null);
    }
  }
  function choose(fullscreen) {
    if (snapshot2.busy || direction || !snapshot2.available) return;
    if (snapshot2.context) return run(fullscreen);
    setOpen(false);
    setQuery("");
    setPicker({ fullscreen });
  }
  const filtered = snapshot2.sessions.filter((entry) => [entry.title, entry.workspaceTitle].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const busy = snapshot2.busy || Boolean(direction);
  const busyText = direction === "collapse" ? "\u6B63\u5728\u6536\u8D77\u53F3\u4FA7\u9762\u677F\u2026" : direction === "expand" ? "\u6B63\u5728\u5C55\u5F00\u53F3\u4FA7\u9762\u677F\u2026" : "\u6B63\u5728\u6253\u5F00\u6807\u7B7E\u9875\u2026";
  const panelAction = snapshot2.expanded ? "\u6536\u8D77\u53F3\u4FA7\u9762\u677F" : "\u5C55\u5F00\u53F3\u4FA7\u9762\u677F";
  return h5(
    "div",
    { className: "cgpt-window-toolbar", onClick: stop, onPointerDown: stop, onContextMenu: stop },
    snapshot2.expanded || snapshot2.hasTabs || snapshot2.canExpand ? h5("button", { type: "button", className: "cgpt-window-plus", "aria-label": panelAction, title: busy ? busyText : panelAction, "aria-expanded": snapshot2.expanded, "aria-busy": busy, disabled: busy, onClick: () => changePanel(snapshot2.expanded ? "collapse" : "expand") }, h5(CollapseIcon)) : h5(
      Menu2,
      {
        open,
        portal: true,
        autoFocus: true,
        align: "end",
        onClose: closeMenu,
        className: "cgpt-window-plus-menu",
        listClassName: "cgpt-window-plus-menu",
        anchor: h5("button", { type: "button", className: "cgpt-window-plus", "aria-label": "\u65B0\u5EFA\u6807\u7B7E\u9875\u83DC\u5355", title: busy ? busyText : "\u65B0\u5EFA\u6807\u7B7E\u9875", "aria-haspopup": "menu", "aria-expanded": open, "aria-busy": busy, disabled: busy, onClick: () => setOpen((value) => !value) }, h5(PlusIcon))
      },
      h5(MenuItem, { icon: h5("span", { "aria-hidden": true, className: "cgpt-window-menu-plus" }, "+"), disabled: !snapshot2.available || snapshot2.busy, onSelect: () => choose(false) }, "\u65B0\u5EFA\u6807\u7B7E\u9875"),
      h5(MenuItem, { icon: h5(ExpandIcon), disabled: !snapshot2.available || snapshot2.busy, onSelect: () => choose(true) }, "\u5728\u5B8C\u6574\u89C6\u56FE\u4E2D\u6253\u5F00\u65B0\u6807\u7B7E\u9875"),
      h5("p", { className: "cgpt-window-menu-context" }, snapshot2.available ? snapshot2.context ? "\u57FA\u4E8E\u4F1A\u8BDD\uFF1A" + snapshot2.context.title : "\u9009\u62E9\u5DF2\u6709\u4F1A\u8BDD\u540E\u6253\u5F00\u5DE5\u5177\u6807\u7B7E\u9875" : "\u539F\u751F\u6807\u7B7E\u9875\u529F\u80FD\u6682\u4E0D\u53EF\u7528")
    ),
    !snapshot2.expanded && !snapshot2.hasTabs && !snapshot2.canExpand && picker && h5(
      Modal,
      {
        open: true,
        title: "\u9009\u62E9\u4F1A\u8BDD",
        description: "DeepSeek \u7684\u5DE5\u5177\u6807\u7B7E\u9875\u9700\u8981\u4E00\u4E2A\u4F1A\u8BDD\u3002\u9009\u62E9\u5DF2\u6709\u4F1A\u8BDD\u540E\u6253\u5F00\u3002",
        closeLabel: "\u5173\u95ED",
        onClose: closePicker,
        className: "cgpt-window-session-modal",
        footer: h5("button", { type: "button", className: "cgpt-window-secondary", onClick: closePicker }, "\u53D6\u6D88")
      },
      snapshot2.sessions.length > 0 && h5("input", { type: "search", className: "cgpt-window-session-search", "aria-label": "\u641C\u7D22\u5DF2\u6709\u4F1A\u8BDD", placeholder: "\u641C\u7D22\u5DF2\u6709\u4F1A\u8BDD", value: query, "data-modal-autofocus": true, onChange: (event) => setQuery(event.target.value) }),
      h5("ul", { className: "cgpt-window-session-list" }, filtered.map((entry) => h5("li", { key: entry.id }, h5("button", { type: "button", onClick: () => run(picker.fullscreen, entry.id), "aria-label": "\u5728\u300C" + entry.title + "\u300D\u4E2D\u6253\u5F00\u6807\u7B7E\u9875" }, h5("span", null, entry.title), entry.workspaceTitle && h5("small", null, entry.workspaceTitle))))),
      filtered.length === 0 && h5("p", { className: "cgpt-window-empty" }, snapshot2.sessions.length ? "\u6CA1\u6709\u5339\u914D\u7684\u4F1A\u8BDD\u3002" : "\u6682\u65E0\u5DF2\u6709\u4F1A\u8BDD\u3002\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A\u4F1A\u8BDD\uFF0C\u518D\u4F7F\u7528\u5DE5\u5177\u6807\u7B7E\u9875\u3002")
    ),
    busy && !direction && h5("div", { className: "cgpt-window-notice", role: "status" }, busyText),
    !busy && notice && h5("div", { className: "cgpt-window-notice", "data-error": notice.error || void 0, role: notice.error ? "alert" : "status" }, h5("span", null, notice.text), h5("button", { type: "button", "aria-label": "\u5173\u95ED\u63D0\u793A", onClick: () => setNotice(null) }, "\xD7"))
  );
}
function GlobalWindowChrome({ ctx, Menu: Menu2, MenuItem, Modal }) {
  const ref = import_react5.default.useRef(null), [host, setHost] = import_react5.default.useState(null);
  const [, refreshServices] = import_react5.default.useState(0);
  import_react5.default.useLayoutEffect(() => {
    const mounted = mountWindowChrome(ref.current);
    setHost(mounted);
    return () => mounted?.dispose();
  }, []);
  import_react5.default.useEffect(() => ctx.slots.subscribe("rightbar", () => refreshServices((value) => value + 1)), [ctx.slots]);
  const optional = (name) => {
    try {
      return ctx.get?.(name);
    } catch {
      return void 0;
    }
  };
  const sidebarRight = optional("sidebarRight"), sidebarRightTabs = optional("sidebarRightTabs");
  const model = import_react5.default.useMemo(() => host ? createWindowChromeModel({ sessions: ctx.sessions, workspaces: ctx.workspaces, layout: ctx.layout, uiWorkspace: ctx.uiWorkspace, sidebarRight, sidebarRightTabs }, { presentation: host.presentation, motion: host.motion }) : null, [host, ctx.sessions, ctx.workspaces, ctx.layout, ctx.uiWorkspace, sidebarRight, sidebarRightTabs]);
  const navigation = import_react5.default.useMemo(() => host?.navigationSeat ? createWindowNavigationModel(ctx) : null, [host, ctx]);
  import_react5.default.useEffect(() => () => model?.dispose(), [model]);
  import_react5.default.useEffect(() => () => navigation?.dispose(), [navigation]);
  return h5(import_react5.default.Fragment, null, h5("span", { ref, className: "cgpt-window-chrome-anchor", "aria-hidden": true }), host && model && (0, import_react_dom.createPortal)(h5(WindowChromeToolbar, { model, Menu: Menu2, MenuItem, Modal }), host.seat), host?.navigationSeat && navigation && (0, import_react_dom.createPortal)(h5(WindowNavigationToolbar, { model: navigation }), host.navigationSeat));
}

// app-dock-model.js
var RECENT_LIMIT = 5;
function createAppDockModel({ navigationModel, slots, layout }) {
  const listeners = /* @__PURE__ */ new Set();
  let recent = [], dismissed = /* @__PURE__ */ new Set(), lastActive, icons = /* @__PURE__ */ new Map(), snapshot2, published, stops = [], disposed = false, operation = 0;
  let state = { libraryOpen: false, query: "", filter: "all", error: "", loadingId: null };
  function refresh() {
    const nav = navigationModel.getSnapshot(), main = new Set((slots.entries("main") || []).map((entry) => entry.options?.key));
    const activeId = layout.panelInfo.getSnapshot().activePanelId;
    const valid = nav.all.filter((row) => row.kind === "panel" && main.has(row.id)), ids = new Set(valid.map((row) => row.id));
    recent = recent.filter((id) => ids.has(id));
    if (activeId !== lastActive) {
      lastActive = activeId;
      if (ids.has(activeId)) {
        recent = [activeId, ...recent.filter((id) => id !== activeId)].slice(0, RECENT_LIMIT);
        dismissed.delete(activeId);
      }
    }
    const pins = new Set(nav.dockIds), recentIds = new Set(recent);
    const apps = valid.map((row) => ({ id: row.id, label: row.label, iconUrl: icons.get(row.id) || "", active: row.id === activeId || row.id === "home" && activeId === null, pinned: pins.has(row.id), recent: recentIds.has(row.id) }));
    const byId = new Map(apps.map((row) => [row.id, row]));
    const pinned = nav.dockIds.map((id) => byId.get(id)).filter(Boolean);
    const temporary = recent.filter((id) => !pins.has(id) && !dismissed.has(id)).map((id) => byId.get(id)).filter(Boolean);
    const canShowNativeMore = nav.overflow.some((row) => row.kind === "action") || slots.entriesOfSlot("sidebar.panellist.actions").some((entry) => entry.options?.id !== "entry-customization");
    const next = { ...state, apps, dock: [...pinned, ...temporary], canShowNativeMore, reservedEntryCount: nav.visible.filter((row) => row.kind === "action").length + (canShowNativeMore ? 1 : 0) };
    if (snapshot2 && JSON.stringify(snapshot2) === JSON.stringify(next)) return;
    snapshot2 = Object.freeze({ ...next, apps: Object.freeze(apps.map(Object.freeze)), dock: Object.freeze([...pinned, ...temporary]) });
  }
  function changed() {
    if (disposed) return;
    refresh();
    if (snapshot2 === published) return;
    published = snapshot2;
    for (const listener of [...listeners]) listener();
  }
  function available(id) {
    refresh();
    return snapshot2.apps.find((row) => row.id === id);
  }
  function change(action) {
    state.error = "";
    try {
      action();
      changed();
      return true;
    } catch (error) {
      state.error = error?.message || "\u65E0\u6CD5\u4FDD\u5B58\u5E94\u7528\u680F\u8BBE\u7F6E";
      changed();
      return false;
    }
  }
  function disconnect() {
    for (const stop5 of stops.splice(0)) stop5();
  }
  refresh();
  published = snapshot2;
  const model = {
    getSnapshot() {
      refresh();
      return snapshot2;
    },
    subscribe(listener) {
      if (disposed) return () => {
      };
      const registered = () => listener();
      listeners.add(registered);
      if (listeners.size === 1) try {
        stops.push(navigationModel.subscribe(changed));
        stops.push(layout.panelInfo.subscribe(changed));
        stops.push(slots.subscribe("main", changed));
        changed();
      } catch (error) {
        listeners.delete(registered);
        disconnect();
        throw error;
      }
      return () => {
        listeners.delete(registered);
        if (!listeners.size) disconnect();
      };
    },
    setIcons(next) {
      if (disposed) return;
      const entries = [...next].filter(([id, url]) => typeof id === "string" && typeof url === "string");
      if (entries.length === icons.size && entries.every(([id, url]) => icons.get(id) === url)) return;
      icons = new Map(entries);
      changed();
    },
    openLibrary() {
      if (disposed) return;
      state = { ...state, libraryOpen: true, query: "", filter: "all", error: "" };
      changed();
    },
    closeLibrary() {
      if (disposed) return;
      operation++;
      state = { ...state, libraryOpen: false, error: "", loadingId: null };
      changed();
    },
    setQuery(value) {
      if (disposed) return;
      state.query = String(value).slice(0, 200);
      changed();
    },
    setFilter(value) {
      if (disposed || !["all", "pinned", "recent"].includes(value)) return;
      state.filter = value;
      changed();
    },
    async open(id) {
      if (disposed || state.loadingId) return false;
      if (!available(id)) {
        state.error = "\u8FD9\u4E2A\u5E94\u7528\u5165\u53E3\u5DF2\u4E0D\u53EF\u7528\uFF0C\u8BF7\u5237\u65B0\u5E94\u7528\u5217\u8868\u3002";
        changed();
        return false;
      }
      const epoch = ++operation;
      state.loadingId = id;
      state.error = "";
      changed();
      try {
        await navigationModel.run(id);
        if (disposed || epoch !== operation) return true;
        recent = [id, ...recent.filter((value) => value !== id)].slice(0, RECENT_LIMIT);
        dismissed.delete(id);
        state = { ...state, libraryOpen: false, loadingId: null, error: "" };
        changed();
        return true;
      } catch (error) {
        if (!disposed && epoch === operation) {
          state.error = error?.message || "\u5E94\u7528\u6682\u65F6\u65E0\u6CD5\u6253\u5F00";
          state.loadingId = null;
          changed();
        }
        return false;
      }
    },
    pin(id, enabled) {
      if (disposed) return false;
      return change(() => {
        if (!available(id)) throw new Error("\u8FD9\u4E2A\u5E94\u7528\u5165\u53E3\u5DF2\u4E0D\u53EF\u7528");
        navigationModel.toggleDock(id, enabled);
        if (!enabled) dismissed.add(id);
        else dismissed.delete(id);
      });
    },
    move(id, delta) {
      if (disposed) return false;
      return change(() => navigationModel.move(id, delta));
    },
    place(id, targetId, after) {
      if (disposed) return false;
      return change(() => {
        const a = available(id), b = available(targetId);
        if (!a?.pinned || !b?.pinned || id === "home" || id === targetId) return;
        const ids = [...navigationModel.getSnapshot().dockIds].filter((value) => value !== id);
        ids.splice(Math.max(1, ids.indexOf(targetId) + (after ? 1 : 0)), 0, id);
        navigationModel.setDockIds(ids);
      });
    },
    dismissRecent(id) {
      if (disposed) return;
      dismissed.add(id);
      changed();
    },
    openPluginManager() {
      return model.open("plugins");
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      operation++;
      disconnect();
      listeners.clear();
    }
  };
  return model;
}

// app-icons.js
var SVG_NS = "http://www.w3.org/2000/svg";
var SHAPES = /* @__PURE__ */ new Set(["path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "g"]);
var GEOMETRY = { path: ["d", "pathLength"], circle: ["cx", "cy", "r", "pathLength"], ellipse: ["cx", "cy", "rx", "ry", "pathLength"], rect: ["x", "y", "width", "height", "rx", "ry", "pathLength"], line: ["x1", "y1", "x2", "y2", "pathLength"], polyline: ["points", "pathLength"], polygon: ["points", "pathLength"], g: [] };
var PRESENTATION = ["fill", "stroke", "fill-rule", "clip-rule", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "opacity", "fill-opacity", "stroke-opacity", "transform"];
var NUMBERS = /^[\s,+.\-\deE]+$/;
var escape = (value) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
var nameOf = (node) => String(node?.localName || node?.tagName || "").toLowerCase();
function allowedValue(name, value) {
  if (!value || value.length > 16e3 || /[<>&"'\\]/.test(value) || /url\s*\(/i.test(value)) return false;
  if (name === "d") return /^[\s,0-9.+\-eEmMzZlLhHvVcCsSqQtTaA]+$/.test(value);
  if (name === "fill" || name === "stroke") return /^(?:none|currentColor|transparent|#[0-9a-f]{3,8}|[a-z]+|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+\-/]+\))$/i.test(value);
  if (name === "fill-rule" || name === "clip-rule") return /^(?:nonzero|evenodd)$/.test(value);
  if (name === "stroke-linecap") return /^(?:butt|round|square)$/.test(value);
  if (name === "stroke-linejoin") return /^(?:miter|round|bevel)$/.test(value);
  if (name === "transform") return /^(?:\s*(?:matrix|translate|scale|rotate|skewX|skewY)\([\s,+.\-\deE]+\)\s*)+$/.test(value);
  if (name === "stroke-dasharray" && value === "none") return true;
  return NUMBERS.test(value);
}
function attributes(node, names) {
  return names.flatMap((name) => {
    const value = node.getAttribute?.(name)?.trim();
    return typeof value === "string" && allowedValue(name, value) ? [" " + name + '="' + escape(value) + '"'] : [];
  }).join("");
}
function svgImage(root) {
  if (nameOf(root) !== "svg" || root.namespaceURI && root.namespaceURI !== SVG_NS) return null;
  let count = 0, geometry = 0;
  const masks = /* @__PURE__ */ new Map(), copiedMasks = /* @__PURE__ */ new Map(), maskIds = /* @__PURE__ */ new Map(), visitingMasks = /* @__PURE__ */ new Set();
  for (const defs of root.children || []) {
    if (nameOf(defs) !== "defs" || defs.namespaceURI && defs.namespaceURI !== SVG_NS) continue;
    for (const mask of defs.children || []) {
      if (nameOf(mask) !== "mask" || mask.namespaceURI && mask.namespaceURI !== SVG_NS) continue;
      const id = mask.getAttribute?.("id");
      if (typeof id === "string" && /^[a-z_][\w.:-]{0,127}$/i.test(id)) masks.set(id, masks.has(id) ? null : mask);
    }
  }
  function maskAttribute(node, depth) {
    const value = node.getAttribute?.("mask")?.trim();
    if (value == null || value === "none") return "";
    const match = /^url\(#([a-z_][\w.:-]{0,127})\)$/i.exec(value);
    const mask = match && masks.get(match[1]);
    if (!mask || visitingMasks.has(match[1])) throw new Error("Unsupported icon mask");
    const sourceId = match[1];
    if (!maskIds.has(sourceId)) maskIds.set(sourceId, "app-icon-mask-" + (maskIds.size + 1));
    if (!copiedMasks.has(sourceId)) {
      if (depth > 12 || ++count > 256) throw new Error("Oversized icon");
      visitingMasks.add(sourceId);
      let units = "";
      for (const name of ["maskUnits", "maskContentUnits"]) {
        const unit = mask.getAttribute?.(name);
        if (unit != null) {
          if (unit !== "userSpaceOnUse" && unit !== "objectBoundingBox") throw new Error("Unsupported mask units");
          units += " " + name + '="' + unit + '"';
        }
      }
      const type = mask.getAttribute?.("mask-type");
      if (type != null) {
        if (type !== "luminance" && type !== "alpha") throw new Error("Unsupported mask type");
        units += ' mask-type="' + type + '"';
      }
      const before = geometry;
      const children = Array.from(mask.children || []).map((child) => copy2(child, depth + 1)).join("");
      if (geometry === before) throw new Error("Empty icon mask");
      copiedMasks.set(sourceId, '<mask id="' + maskIds.get(sourceId) + '"' + units + attributes(mask, ["x", "y", "width", "height", ...PRESENTATION]) + ">" + children + "</mask>");
      visitingMasks.delete(sourceId);
    }
    return ' mask="url(#' + maskIds.get(sourceId) + ')"';
  }
  function copy2(node, depth) {
    if (depth > 12 || ++count > 256) throw new Error("Oversized icon");
    const name = nameOf(node);
    if (!SHAPES.has(name) || node.namespaceURI && node.namespaceURI !== SVG_NS) return "";
    if (name !== "g") geometry++;
    return "<" + name + attributes(node, [...GEOMETRY[name], ...PRESENTATION]) + maskAttribute(node, depth) + ">" + Array.from(node.children || []).map((child) => copy2(child, depth + 1)).join("") + "</" + name + ">";
  }
  try {
    const children = Array.from(root.children || []).map((child) => copy2(child, 0)).join("");
    if (!geometry) return null;
    const raw = root.getAttribute?.("viewBox")?.trim();
    const box = raw?.split(/[\s,]+/).map(Number);
    let viewBox = "0 0 24 24";
    if (box?.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0) viewBox = box.join(" ");
    else {
      const width = Number(root.getAttribute?.("width")), height = Number(root.getAttribute?.("height"));
      if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) viewBox = "0 0 " + width + " " + height;
    }
    const rootFill = root.getAttribute?.("fill")?.trim();
    const rootMask = maskAttribute(root, 0);
    const definitions = copiedMasks.size ? "<defs>" + Array.from(copiedMasks.values()).join("") + "</defs>" : "";
    const markup = '<svg xmlns="' + SVG_NS + '" viewBox="' + viewBox + '" color="#fff"' + (rootFill && allowedValue("fill", rootFill) ? "" : ' fill="currentColor"') + attributes(root, PRESENTATION) + rootMask + ">" + definitions + children + "</svg>";
    if (markup.length > 32768) return null;
    return "data:image/svg+xml," + encodeURIComponent(markup);
  } catch {
    return null;
  }
}
function imageURL(node, document2) {
  const raw = String(node.currentSrc || node.getAttribute?.("src") || "").trim();
  if (!raw || raw.length > 256e3 || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  if (/^data:/i.test(raw)) {
    if (/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+=*$/i.test(raw)) return raw;
    const svg = /^data:image\/svg\+xml(?:;charset=utf-8)?(;base64)?,(.*)$/is.exec(raw);
    if (!svg) return null;
    const Parser = document2?.defaultView?.DOMParser;
    if (typeof Parser !== "function") return null;
    try {
      const markup = svg[1] ? document2.defaultView.atob(svg[2]) : decodeURIComponent(svg[2]);
      if (markup.length > 32768 || /<!DOCTYPE|<!ENTITY/i.test(markup)) return null;
      const parsed = new Parser().parseFromString(markup, "image/svg+xml");
      if (parsed.querySelector?.("parsererror")) return null;
      return svgImage(parsed.documentElement);
    } catch {
      return null;
    }
  }
  try {
    const base = new URL(document2?.baseURI || document2?.location?.href);
    const url = new URL(raw, base);
    if (url.username || url.password) return null;
    const sameOrigin = url.origin !== "null" ? url.origin === base.origin : url.protocol === "dsh-app:" && url.protocol === base.protocol && url.host === base.host;
    if (sameOrigin && ["https:", "http:", "dsh-app:"].includes(url.protocol)) return url.href;
    if (url.protocol === "https:" && /\.(?:png|jpe?g|webp|gif|avif|ico|svg)$/i.test(url.pathname)) return url.href;
  } catch {
  }
  return null;
}
function readNativeAppIcons(nav) {
  const icons = /* @__PURE__ */ new Map();
  for (const button of nav?.querySelectorAll?.("[data-cgpt-nav-button]") || []) {
    if (button.closest?.("[data-cgpt-app-button],[data-cgpt-app-dock]")) continue;
    const id = button.getAttribute?.("data-cgpt-nav-button");
    if (!id || icons.has(id)) continue;
    const node = button.querySelector?.("svg,img");
    if (!node) continue;
    const url = nameOf(node) === "svg" ? svgImage(node) : nameOf(node) === "img" ? imageURL(node, node.ownerDocument || nav.ownerDocument) : null;
    if (url) icons.set(id, url);
  }
  return icons;
}

// app-dock-host.js
function mountAppDockSeat(anchor, model) {
  const nav = anchor?.closest?.("nav");
  if (!nav) return null;
  const document2 = nav.ownerDocument, view = document2.defaultView;
  const seat = document2.createElement("span");
  seat.className = "cgpt-app-dock-seat";
  seat.setAttribute("data-cgpt-app-dock", "");
  const previousMode = nav.getAttribute("data-cgpt-app-mode"), previousMore = nav.getAttribute("data-cgpt-app-native-more");
  const previousExtra = nav.style.getPropertyValue("--cgpt-app-extra-height");
  let disposed = false, queued = false;
  const reflect = () => {
    const value = model.getSnapshot();
    nav.setAttribute("data-cgpt-app-native-more", String(value.canShowNativeMore));
    nav.style.setProperty("--cgpt-app-extra-height", (value.reservedEntryCount || 0) * 44 + "px");
  };
  const read2 = () => {
    if (disposed) return;
    queued = false;
    model.setIcons(readNativeAppIcons(nav));
  };
  const queue = () => {
    if (disposed || queued) return;
    queued = true;
    queueMicrotask(read2);
  };
  nav.appendChild(seat);
  nav.setAttribute("data-cgpt-app-mode", "");
  let stop5, observer;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stop5?.();
    observer?.disconnect();
    seat.remove();
    if (previousMode === null) nav.removeAttribute("data-cgpt-app-mode");
    else nav.setAttribute("data-cgpt-app-mode", previousMode);
    if (previousMore === null) nav.removeAttribute("data-cgpt-app-native-more");
    else nav.setAttribute("data-cgpt-app-native-more", previousMore);
    if (previousExtra) nav.style.setProperty("--cgpt-app-extra-height", previousExtra);
    else nav.style.removeProperty("--cgpt-app-extra-height");
  };
  try {
    stop5 = model.subscribe(reflect);
    reflect();
    read2();
    if (view?.MutationObserver) {
      observer = new view.MutationObserver((records) => {
        if (records.some((record) => !record.target?.closest?.("[data-cgpt-app-dock]"))) queue();
      });
      observer.observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "d", "viewBox", "fill", "stroke", "data-cgpt-nav-button"] });
    }
  } catch (error) {
    dispose();
    throw error;
  }
  return { node: seat, dispose };
}

// app-dock-ui.js
var import_react7 = __toESM(require("react"), 1);

// notification-ui.js
var import_react6 = __toESM(require("react"), 1);
var h6 = import_react6.default.createElement;
var stop2 = (event) => event.stopPropagation();
var pendingKinds = /* @__PURE__ */ new Set(["approval", "question", "plan-review"]);
var attention = (item) => pendingKinds.has(item.kind) || item.unread === true;
var MODE_ATTRIBUTE = "data-cgpt-notification-mode";
function mountNotificationSeat(anchor, model) {
  const root = anchor?.closest?.("nav")?.parentElement;
  if (!root) return null;
  const document2 = root.ownerDocument, frame = root.closest('[data-slot="sidebar"]')?.parentElement?.parentElement;
  const previousMode = root.getAttribute(MODE_ATTRIBUTE);
  const node = document2.createElement("span");
  node.className = "cgpt-notification-seat";
  root.appendChild(node);
  let observer, unsubscribe, disposed = false;
  const syncMode = () => {
    if (disposed) return;
    if (model.getSnapshot().open && !frame?.hasAttribute("data-sidebar-collapsed")) root.setAttribute(MODE_ATTRIBUTE, "");
    else root.removeAttribute(MODE_ATTRIBUTE);
  };
  const closeIfHidden = () => {
    if (disposed) return;
    if (frame?.hasAttribute("data-sidebar-collapsed")) model.close();
    syncMode();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    unsubscribe?.();
    node.remove();
    if (previousMode === null) root.removeAttribute(MODE_ATTRIBUTE);
    else root.setAttribute(MODE_ATTRIBUTE, previousMode);
    model.close();
  };
  try {
    unsubscribe = model.subscribe(syncMode);
    if (frame && document2.defaultView?.MutationObserver) {
      observer = new document2.defaultView.MutationObserver(closeIfHidden);
      observer.observe(frame, { attributes: true, attributeFilter: ["data-sidebar-collapsed"] });
    }
    closeIfHidden();
  } catch (error) {
    dispose();
    throw error;
  }
  return { node, dispose };
}
function BellIcon() {
  return h6(
    "svg",
    { width: 16, height: 16, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    h6("path", { d: "M6 7a4 4 0 0 1 8 0c0 5 1.5 5.2 1.5 6.5H4.5C4.5 12.2 6 12 6 7Zm2 9a2.2 2.2 0 0 0 4 0" })
  );
}
function ReadIcon() {
  return h6(
    "svg",
    { width: 16, height: 16, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    h6("path", { d: "m3 10 3 3 7-7m-3 7 7-7" })
  );
}
function HomeNotificationBadge({ model }) {
  const snapshot2 = import_react6.default.useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  return snapshot2.count > 0 ? h6("span", { className: "cgpt-notification-dot cgpt-home-notification-dot", role: "img", "aria-label": snapshot2.count + " \u6761\u672A\u8BFB\u6216\u5F85\u5904\u7406\u901A\u77E5" }) : null;
}
function NotificationBell({ model }) {
  const snapshot2 = import_react6.default.useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  const bell = import_react6.default.useRef(null), feedId = import_react6.default.useId();
  const [selectedId, setSelectedId] = import_react6.default.useState(null);
  const close = import_react6.default.useCallback(() => {
    model.close();
    bell.current?.focus({ preventScroll: true });
  }, [model]);
  import_react6.default.useEffect(() => {
    if (!snapshot2.open) return;
    const document2 = bell.current?.ownerDocument;
    const escape2 = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || event.target?.closest?.('[role="dialog"],[role="menu"]')) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    document2?.addEventListener("keydown", escape2);
    return () => document2?.removeEventListener("keydown", escape2);
  }, [snapshot2.open, close]);
  const title = snapshot2.count ? "\u901A\u77E5 \xB7 " + snapshot2.count + " \u6761\u672A\u8BFB\u6216\u5F85\u5904\u7406" : "\u901A\u77E5";
  const priority = snapshot2.items.filter(attention), recent = snapshot2.items.filter((item) => !attention(item));
  const busy = snapshot2.busyId !== null && snapshot2.busyId !== void 0;
  const canMarkRead = snapshot2.items.some((item) => !pendingKinds.has(item.kind) && item.unread === true);
  const select = async (item) => {
    if (busy) return;
    try {
      if (await model.select(item.id) !== false) setSelectedId(item.id);
    } catch {
    }
  };
  const row = (item) => h6(
    "button",
    {
      key: item.id,
      type: "button",
      className: "cgpt-notification-item",
      disabled: busy,
      "data-notification-id": item.id,
      "data-selected": selectedId === item.id ? "" : void 0,
      "aria-current": selectedId === item.id ? "true" : void 0,
      onClick: () => {
        void select(item);
      }
    },
    h6(
      "span",
      { className: "cgpt-notification-copy" },
      h6(
        "span",
        { className: "cgpt-notification-title-line" },
        h6("span", { className: "cgpt-notification-title" }, item.title),
        item.workspaceTitle && h6("span", { className: "cgpt-notification-workspace" }, item.workspaceTitle)
      ),
      h6("span", { className: "cgpt-notification-excerpt" }, snapshot2.busyId === item.id ? "\u6B63\u5728\u6253\u5F00\u2026" : item.excerpt || item.detail),
      pendingKinds.has(item.kind) && item.excerpt && h6("span", { className: "cgpt-notification-detail" }, item.detail)
    ),
    attention(item) && h6("span", { className: "cgpt-notification-item-dot", role: "img", "aria-label": pendingKinds.has(item.kind) ? "\u5F85\u5904\u7406" : "\u672A\u8BFB" })
  );
  const readButton = typeof model.markAllRead === "function" && h6("button", {
    type: "button",
    className: "cgpt-notification-read-all",
    disabled: busy || !canMarkRead,
    "aria-label": "\u5C06\u5B8C\u6210\u901A\u77E5\u5168\u90E8\u6807\u4E3A\u5DF2\u8BFB",
    title: "\u5C06\u5B8C\u6210\u901A\u77E5\u5168\u90E8\u6807\u4E3A\u5DF2\u8BFB",
    onClick: () => {
      void Promise.resolve(model.markAllRead()).catch(() => {
      });
    }
  }, h6(ReadIcon));
  return h6(
    "span",
    { className: "cgpt-notifications", onClick: stop2, onPointerDown: stop2, onContextMenu: stop2 },
    h6("button", {
      ref: bell,
      type: "button",
      className: "cgpt-notification-button",
      "aria-label": title,
      title,
      "aria-controls": feedId,
      "aria-expanded": snapshot2.open,
      onClick: () => snapshot2.open ? model.close() : model.open()
    }, h6(BellIcon), snapshot2.count > 0 && h6("span", { className: "cgpt-notification-dot", "aria-hidden": true })),
    snapshot2.open && h6(
      "section",
      { id: feedId, className: "cgpt-notification-feed", role: "region", "aria-label": "\u4F1A\u8BDD\u901A\u77E5", "aria-busy": snapshot2.loading || void 0 },
      h6("div", { className: "cgpt-notification-heading" }, h6("h2", null, priority.length ? "\u4F18\u5148\u4E8B\u9879" : "\u901A\u77E5"), readButton),
      snapshot2.error && h6("p", { className: "cgpt-notification-error", role: "alert" }, snapshot2.error),
      snapshot2.notice && h6("p", { className: "cgpt-notification-notice", role: "status" }, snapshot2.notice),
      h6(
        "div",
        { className: "cgpt-notification-list" },
        priority.length > 0 && h6("div", { className: "cgpt-notification-group", "aria-label": "\u4F18\u5148\u4E8B\u9879" }, priority.map(row)),
        recent.length > 0 && h6(
          "div",
          { className: "cgpt-notification-group", "aria-label": "\u6700\u8FD1\u5B8C\u6210" },
          h6("h3", { className: "cgpt-notification-group-title" }, "\u6700\u8FD1\u5B8C\u6210"),
          recent.map(row)
        ),
        !snapshot2.items.length && h6(
          "div",
          { className: "cgpt-notification-empty", role: "status" },
          h6(BellIcon),
          h6("p", null, snapshot2.loading ? "\u6B63\u5728\u8BFB\u53D6\u4F1A\u8BDD\u8BB0\u5F55\u2026" : snapshot2.available ? "\u6682\u65E0\u901A\u77E5\u8BB0\u5F55" : "\u4F1A\u8BDD\u63D0\u9192\u6682\u4E0D\u53EF\u7528"),
          !snapshot2.loading && h6("small", null, snapshot2.available ? "\u4F1A\u8BDD\u5B8C\u6210\u6216\u9700\u8981\u4F60\u5904\u7406\u65F6\uFF0C\u4F1A\u663E\u793A\u5728\u8FD9\u91CC\u3002" : "\u5F53\u524D\u5BBF\u4E3B\u5C1A\u672A\u63D0\u4F9B\u4F1A\u8BDD\u63D0\u9192\u72B6\u6001\u3002")
        )
      )
    )
  );
}

// app-dock-ui.js
var h7 = import_react7.default.createElement;
var stop3 = (event) => event.stopPropagation();
var PATHS = {
  home: "m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9",
  plugins: "M14.5 17.1A8 8 0 1 1 18 10c0 3.6-3.3 4.8-5.5 2.5M6.4 10.6l4.2-4.2 2.1 2.1a3 3 0 0 1-4.2 4.2ZM5 9.2l1.4 1.4M9.2 5l1.4 1.4",
  schedules: "M17.6 10a7.6 7.6 0 1 1-15.2 0 7.6 7.6 0 0 1 15.2 0ZM10 5.5V10l-2.7 2",
  apps: "M4 4h3v3H4V4Zm6.5 0h3v3h-3V4ZM17 4h3v3h-3V4ZM4 10.5h3v3H4v-3Zm6.5 0h3v3h-3v-3Zm6.5 0h3v3h-3v-3ZM4 17h3v3H4v-3Zm6.5 0h3v3h-3v-3Zm6.5 0h3v3h-3v-3Z",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm4.7-1.8L20 20",
  close: "m6 6 12 12M18 6 6 18",
  pin: "m8 3 8 0-1 6 4 4H5l4-4-1-6Zm4 10v8"
};
function Glyph2({ name, size = 18 }) {
  const legacy = name === "plugins" || name === "schedules";
  return h7("svg", { width: size, height: size, viewBox: legacy ? "0 0 20 20" : "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: legacy ? 1.5 : 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }, h7("path", { d: PATHS[name] || PATHS.apps }));
}
function AppArtwork({ app }) {
  const [failed, setFailed] = import_react7.default.useState(null);
  const label = Array.from(app.label || "?")[0];
  const url = !["plugins", "schedules"].includes(app.id) && app.iconUrl && failed !== app.iconUrl ? app.iconUrl : null;
  const monochrome = url?.startsWith("data:image/svg+xml,");
  const source2 = url && h7("img", { src: url, alt: "", draggable: false, onError: () => setFailed(app.iconUrl) });
  return h7(
    "span",
    { className: "cgpt-app-artwork", "aria-hidden": true },
    url ? monochrome ? h7("span", { className: "cgpt-app-symbol", style: { maskImage: "url(" + JSON.stringify(url) + ")", WebkitMaskImage: "url(" + JSON.stringify(url) + ")" } }, source2) : source2 : PATHS[app.id] ? h7(Glyph2, { name: app.id, size: 20 }) : h7("span", { className: "cgpt-app-letter" }, label)
  );
}
function wireAppDockPointer(root, { model, onError = () => {
} }) {
  if (!root?.addEventListener) return () => {
  };
  const document2 = root.ownerDocument, view = document2?.defaultView;
  let pointer = null, dropMark = null, suppressed = null, releases = [];
  const buttonOf = (target) => target?.closest?.("[data-cgpt-app-button]");
  const idOf = (button) => button?.getAttribute?.("data-cgpt-app-button");
  const pinned = (id) => model.getSnapshot().dock.some((app) => app.id === id && app.pinned);
  const hit = (x, y) => {
    const element = document2?.elementFromPoint?.(x, y), button = buttonOf(element);
    if (!element || !root.contains(element)) return null;
    if (button) return pinned(idOf(button)) ? button : null;
    const targets = Array.from(root.querySelectorAll?.("[data-cgpt-app-button]") || []).filter((node) => pinned(idOf(node))).map((node) => ({ node, rect: node.getBoundingClientRect() })).filter(({ rect }) => [rect.left, rect.right, rect.top, rect.height].every(Number.isFinite) && rect.right > rect.left && rect.height > 0);
    if (!targets.length || x < Math.min(...targets.map(({ rect }) => rect.left)) || x >= Math.max(...targets.map(({ rect }) => rect.right))) return null;
    const top = Math.min(...targets.map(({ rect }) => rect.top)), bottom = Math.max(...targets.map(({ rect }) => rect.top + rect.height));
    if (y < top - 4 || y > bottom + 4) return null;
    const distance = ({ rect }) => Math.max(rect.top - y, y - rect.top - rect.height, 0);
    return targets.reduce((nearest, target) => distance(target) <= distance(nearest) ? target : nearest).node;
  };
  function clear() {
    for (const release of releases.splice(0)) release();
    dropMark?.removeAttribute("data-app-drop");
    dropMark = null;
    const previous = pointer;
    pointer = null;
    if (previous) {
      previous.button.removeAttribute("data-app-dragging");
      if (previous.captured) try {
        previous.button.releasePointerCapture?.(previous.pointerId);
      } catch {
      }
    }
  }
  const suppress = (id) => {
    suppressed = { id, until: Date.now() + 350 };
  };
  function cancel(event) {
    if (pointer && event?.pointerId !== void 0 && event.pointerId !== pointer.pointerId) return;
    if (pointer?.active) suppress(pointer.id);
    clear();
  }
  function key(event) {
    if (event.key !== "Escape" || !pointer) return;
    const id = pointer.active ? pointer.id : null;
    event.preventDefault();
    event.stopPropagation();
    cancel();
    if (id) suppressed = { id, until: Infinity };
  }
  function move(event) {
    if (!pointer || event.pointerId !== pointer.pointerId) return;
    if (!root.contains(pointer.button) || !pinned(pointer.id)) {
      cancel();
      return;
    }
    if (!pointer.active && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 6) return;
    if (!pointer.active) {
      pointer.active = true;
      try {
        pointer.button.setPointerCapture?.(pointer.pointerId);
        pointer.captured = typeof pointer.button.setPointerCapture === "function";
      } catch {
      }
    }
    pointer.button.setAttribute("data-app-dragging", "");
    event.preventDefault();
    event.stopPropagation();
    dropMark?.removeAttribute("data-app-drop");
    dropMark = null;
    const target = hit(event.clientX, event.clientY);
    if (target && idOf(target) !== pointer.id) {
      const rect = target.getBoundingClientRect();
      target.setAttribute("data-app-drop", event.clientY < rect.top + rect.height / 2 ? "before" : "after");
      dropMark = target;
    }
  }
  function up(event) {
    if (!pointer || event.pointerId !== pointer.pointerId) return;
    const { id, active, button } = pointer;
    const target = active ? hit(event.clientX, event.clientY) : null;
    const valid = root.contains(button) && pinned(id);
    clear();
    if (!active) return;
    suppress(id);
    event.preventDefault();
    event.stopPropagation();
    if (!valid || !target || id === idOf(target)) return;
    const rect = target.getBoundingClientRect();
    try {
      model.place(id, idOf(target), event.clientY >= rect.top + rect.height / 2);
    } catch (error) {
      onError(error);
    }
  }
  function down(event) {
    if (event.button !== 0 || event.isPrimary === false) return;
    suppressed = null;
    clear();
    const button = buttonOf(event.target), id = idOf(button);
    if (!button || !root.contains(button) || id === "home" || !pinned(id) || model.getSnapshot().loadingId != null) return;
    pointer = { id, button, pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false, captured: false };
    for (const [target, name, handler] of [[document2, "pointermove", move], [document2, "pointerup", up], [document2, "pointercancel", cancel], [document2, "lostpointercapture", cancel], [document2, "keydown", key], [view, "blur", cancel]]) {
      if (!target?.addEventListener) continue;
      target.addEventListener(name, handler, true);
      releases.push(() => target.removeEventListener(name, handler, true));
    }
  }
  function click(event) {
    if (!suppressed) return;
    if (Date.now() >= suppressed.until) {
      suppressed = null;
      return;
    }
    const button = buttonOf(event.target);
    if (event.detail === 0 || !root.contains(button) || idOf(button) !== suppressed.id) return;
    suppressed = null;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }
  root.addEventListener("pointerdown", down, true);
  root.addEventListener("click", click, true);
  return () => {
    clear();
    suppressed = null;
    root.removeEventListener("pointerdown", down, true);
    root.removeEventListener("click", click, true);
  };
}
function AppDock({ model, notificationModel, Modal, Menu: Menu2, MenuItem }) {
  const snapshot2 = import_react7.default.useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  const [menu, setMenu] = import_react7.default.useState(null), [error, setError] = import_react7.default.useState(""), [pendingId, setPendingId] = import_react7.default.useState(null);
  const dockRef = import_react7.default.useRef(null);
  const operation = import_react7.default.useRef(null), alive = import_react7.default.useRef(true), search = import_react7.default.useRef(null);
  const previousLibrary = import_react7.default.useRef(snapshot2.libraryOpen);
  import_react7.default.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operation.current = null;
    };
  }, [model]);
  import_react7.default.useLayoutEffect(() => wireAppDockPointer(dockRef.current, { model, onError: (reason) => setError(reason?.message || "\u65E0\u6CD5\u4FDD\u5B58\u5E94\u7528\u987A\u5E8F\uFF0C\u8BF7\u91CD\u8BD5\u3002") }), [model]);
  import_react7.default.useLayoutEffect(() => {
    if (previousLibrary.current && !snapshot2.libraryOpen) {
      operation.current = null;
      setPendingId(null);
      setMenu(null);
    }
    previousLibrary.current = snapshot2.libraryOpen;
  }, [snapshot2.libraryOpen]);
  import_react7.default.useEffect(() => {
    if (menu && !snapshot2.apps.some((app) => app.id === menu.id)) setMenu(null);
  }, [menu, snapshot2.apps]);
  const busy = snapshot2.loadingId != null || pendingId !== null;
  const appError = error || snapshot2.error;
  const pinned = snapshot2.dock.filter((app) => app.pinned), recent = snapshot2.dock.filter((app) => !app.pinned);
  const query = (snapshot2.query || "").trim().toLocaleLowerCase();
  const shown = snapshot2.apps.filter((app) => (snapshot2.filter !== "pinned" || app.pinned) && (snapshot2.filter !== "recent" || app.recent) && (!query || app.label.toLocaleLowerCase().includes(query)));
  const selected = menu && snapshot2.apps.find((app) => app.id === menu.id);
  const pinnedOrder = snapshot2.dock.filter((app) => app.pinned).map((app) => app.id), selectedIndex = selected ? pinnedOrder.indexOf(selected.id) : -1;
  async function run(action, id) {
    if (busy || operation.current) return;
    const current = { id };
    operation.current = current;
    setPendingId(id);
    setError("");
    setMenu(null);
    try {
      await action();
    } catch (reason) {
      if (alive.current && operation.current === current) setError(reason?.message || "\u6682\u65F6\u65E0\u6CD5\u6253\u5F00\uFF0C\u8BF7\u91CD\u8BD5\u3002");
    } finally {
      if (alive.current && operation.current === current) {
        operation.current = null;
        setPendingId(null);
      }
    }
  }
  function change(action) {
    if (busy) return;
    setError("");
    try {
      action();
      setMenu(null);
    } catch (reason) {
      setError(reason?.message || "\u65E0\u6CD5\u4FDD\u5B58\u5E94\u7528\u680F\u8BBE\u7F6E\uFF0C\u8BF7\u91CD\u8BD5\u3002");
    }
  }
  function openMenu(event, app, keyboard = false) {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    if (!Menu2 || !MenuItem) {
      model.openLibrary();
      return;
    }
    event.currentTarget.focus?.({ preventScroll: true });
    const rect = event.currentTarget.getBoundingClientRect?.();
    setMenu({ id: app.id, x: keyboard ? (rect?.right || 0) + 6 : event.clientX, y: keyboard ? rect?.top || 0 : event.clientY });
  }
  function menuKey(event, app) {
    if (event.key === "ContextMenu" || event.key === "F10" && event.shiftKey) openMenu(event, app, true);
  }
  function dockButton(app) {
    return h7(
      "button",
      {
        key: app.id,
        type: "button",
        className: "cgpt-app-dock-button",
        "data-cgpt-app-button": app.id,
        "data-app-pinned": app.pinned ? "" : void 0,
        "aria-label": app.label,
        title: app.label + (app.active ? " \xB7 \u5F53\u524D\u9875\u9762" : ""),
        "aria-current": app.active ? "page" : void 0,
        "aria-disabled": busy || void 0,
        draggable: false,
        onClick: () => void run(() => model.open(app.id), app.id),
        onContextMenu: (event) => openMenu(event, app),
        onKeyDown: (event) => menuKey(event, app)
      },
      h7(AppArtwork, { app }),
      app.id === "home" && notificationModel && h7(HomeNotificationBadge, { model: notificationModel }),
      (pendingId === app.id || snapshot2.loadingId === app.id) && h7("span", { className: "cgpt-app-opening", "aria-hidden": true })
    );
  }
  const closeLibrary = () => {
    setError("");
    model.closeLibrary();
  };
  return h7(
    "div",
    { ref: dockRef, className: "cgpt-app-dock", "data-cgpt-app-dock": "", onClick: stop3, onPointerDown: stop3, onContextMenu: stop3 },
    h7(
      "div",
      { className: "cgpt-app-dock-scroll", "aria-label": "\u5E94\u7528 Dock" },
      h7("div", { className: "cgpt-app-dock-group", "aria-label": "\u56FA\u5B9A\u5E94\u7528" }, pinned.map(dockButton)),
      recent.length > 0 && h7(import_react7.default.Fragment, null, pinned.length > 0 && h7("div", { className: "cgpt-app-dock-divider", role: "separator" }), h7("div", { className: "cgpt-app-dock-group", "aria-label": "\u6700\u8FD1\u4F7F\u7528\u7684\u5E94\u7528" }, recent.map(dockButton)))
    ),
    h7("button", { type: "button", className: "cgpt-app-library-button", "aria-label": "\u5168\u90E8\u5E94\u7528", title: "\u5168\u90E8\u5E94\u7528", "aria-expanded": snapshot2.libraryOpen, onClick: () => {
      setError("");
      model.openLibrary();
    } }, h7(Glyph2, { name: "apps", size: 21 })),
    appError && !snapshot2.libraryOpen && h7("div", { className: "cgpt-app-toast", role: "alert" }, String(appError), h7("button", { type: "button", "aria-label": "\u67E5\u770B\u5E94\u7528\u8BE6\u60C5", onClick: () => model.openLibrary() }, "\u67E5\u770B")),
    selected && Menu2 && MenuItem && h7(
      Menu2,
      {
        open: true,
        portal: true,
        autoFocus: true,
        onClose: () => setMenu(null),
        className: "cgpt-app-context",
        listClassName: "cgpt-app-context",
        getAnchorRect: () => ({ left: menu.x, right: menu.x, top: menu.y, bottom: menu.y, width: 0, height: 0 }),
        anchor: h7("button", { type: "button", tabIndex: -1, "aria-hidden": true, className: "cgpt-app-context-anchor", style: { left: menu.x, top: menu.y } })
      },
      h7(MenuItem, { onSelect: () => void run(() => model.open(selected.id), selected.id) }, "\u6253\u5F00 " + selected.label),
      selected.id !== "home" && h7(MenuItem, { onSelect: () => change(() => model.pin(selected.id, !selected.pinned)) }, selected.pinned ? "\u4ECE Dock \u79FB\u9664" : "\u56FA\u5B9A\u5230 Dock"),
      selected.pinned && selected.id !== "home" && h7(
        import_react7.default.Fragment,
        null,
        h7(MenuItem, { disabled: selectedIndex <= 1, onSelect: () => change(() => model.move(selected.id, -1)) }, "\u4E0A\u79FB"),
        h7(MenuItem, { disabled: selectedIndex === pinnedOrder.length - 1, onSelect: () => change(() => model.move(selected.id, 1)) }, "\u4E0B\u79FB")
      ),
      !selected.pinned && selected.recent && h7(MenuItem, { onSelect: () => change(() => model.dismissRecent(selected.id)) }, "\u4E0D\u518D\u663E\u793A\u5728\u6700\u8FD1\u4F7F\u7528"),
      h7(MenuItem, { onSelect: () => {
        setMenu(null);
        model.openLibrary();
      } }, "\u5168\u90E8\u5E94\u7528\u2026")
    ),
    h7(
      Modal,
      { open: snapshot2.libraryOpen, title: "\u5E94\u7528", headless: true, onClose: closeLibrary, shortcutModal: "dsh-dock.apps", className: "cgpt-app-library-modal", contentClassName: "cgpt-app-library-content" },
      h7(
        "div",
        { className: "cgpt-app-library", onClick: stop3, onPointerDown: stop3, onContextMenu: stop3 },
        h7(
          "header",
          { className: "cgpt-app-library-header" },
          h7("div", null, h7("h2", null, "\u5E94\u7528"), h7("p", null, "\u4F60\u7684\u63D2\u4EF6\u4E0E\u5DE5\u5177\uFF0C\u90FD\u5728\u8FD9\u91CC\u3002")),
          h7("button", { type: "button", className: "cgpt-app-close", "aria-label": "\u5173\u95ED\u5E94\u7528\u603B\u89C8", onClick: closeLibrary }, h7(Glyph2, { name: "close" }))
        ),
        h7("div", { className: "cgpt-app-search" }, h7(Glyph2, { name: "search" }), h7("input", { ref: search, type: "search", value: snapshot2.query || "", placeholder: "\u641C\u7D22\u5E94\u7528", "aria-label": "\u641C\u7D22\u5E94\u7528", "data-modal-autofocus": true, autoComplete: "off", spellCheck: false, onChange: (event) => model.setQuery(event.target.value) })),
        h7("div", { className: "cgpt-app-filters", role: "group", "aria-label": "\u5E94\u7528\u8303\u56F4" }, [["all", "\u5168\u90E8"], ["pinned", "\u5DF2\u56FA\u5B9A"], ["recent", "\u6700\u8FD1\u4F7F\u7528"]].map(([id, label]) => h7("button", { key: id, type: "button", "aria-pressed": snapshot2.filter === id, onClick: () => {
          model.setFilter(id);
          search.current?.focus();
        } }, label))),
        h7(
          "div",
          { className: "cgpt-app-library-body", "aria-busy": busy },
          appError && h7("p", { className: "cgpt-app-error", role: "alert" }, String(appError)),
          shown.length > 0 ? h7("ul", { className: "cgpt-app-grid", "aria-label": "\u5E94\u7528\u5217\u8868" }, shown.map((app) => h7(
            "li",
            { key: app.id, className: "cgpt-app-card", "data-app-active": app.active ? "" : void 0 },
            h7(
              "button",
              { type: "button", className: "cgpt-app-launch", "aria-label": "\u6253\u5F00 " + app.label, "aria-current": app.active ? "page" : void 0, "aria-disabled": busy || void 0, onClick: () => void run(() => model.open(app.id), app.id), onContextMenu: (event) => openMenu(event, app), onKeyDown: (event) => menuKey(event, app) },
              h7(AppArtwork, { app }),
              h7("span", { className: "cgpt-app-label" }, app.label),
              h7("span", { className: "cgpt-app-status" }, pendingId === app.id || snapshot2.loadingId === app.id ? "\u6B63\u5728\u6253\u5F00\u2026" : app.active ? "\u5F53\u524D\u9875\u9762" : app.recent ? "\u6700\u8FD1\u4F7F\u7528" : "\u6253\u5F00\u5E94\u7528")
            ),
            app.id === "home" ? h7("span", { className: "cgpt-app-fixed-note" }, "\u56FA\u5B9A\u5165\u53E3") : h7("button", { type: "button", className: "cgpt-app-pin", "aria-label": (app.pinned ? "\u4ECE Dock \u79FB\u9664 " : "\u56FA\u5B9A\u5230 Dock ") + app.label, "aria-pressed": app.pinned, disabled: busy, onClick: () => change(() => model.pin(app.id, !app.pinned)) }, h7(Glyph2, { name: "pin", size: 13 }), app.pinned ? "\u5DF2\u56FA\u5B9A" : "\u56FA\u5B9A")
          ))) : h7("div", { className: "cgpt-app-empty", role: "status" }, h7(Glyph2, { name: "apps", size: 30 }), h7("p", null, query ? "\u6CA1\u6709\u627E\u5230\u8FD9\u4E2A\u5E94\u7528" : snapshot2.filter === "recent" ? "\u6253\u5F00\u8FC7\u7684\u5E94\u7528\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC" : snapshot2.filter === "pinned" ? "\u5C06\u5E38\u7528\u5E94\u7528\u56FA\u5B9A\u5230 Dock" : "\u6682\u65E0\u53EF\u7528\u7684\u5E94\u7528\u5165\u53E3"))
        ),
        h7("footer", { className: "cgpt-app-library-footer" }, h7("span", null, shown.length + " \u4E2A\u5E94\u7528"), h7("button", { type: "button", disabled: busy, onClick: () => void run(() => model.openPluginManager(), "plugins") }, "\u7BA1\u7406\u63D2\u4EF6", h7("span", { "aria-hidden": true }, " \u2197")))
      )
    )
  );
}

// global-search-model.js
var CATEGORIES = [["all", "\u5168\u90E8"], ["actions", "\u64CD\u4F5C"], ["sessions", "\u804A\u5929"], ["workspaces", "\u5DE5\u4F5C\u533A"], ["text", "\u6587\u672C"]];
var text2 = (value) => typeof value === "string" ? value.trim() : "";
var read = (source2) => source2?.getSnapshot?.() || {};
var time = (value) => typeof value === "number" ? value : Date.parse(value) || 0;
var INDEX_DISABLED = "\u5F53\u524D DSH \u672A\u542F\u7528\u804A\u5929\u6B63\u6587\u641C\u7D22\uFF0C\u73B0\u6309\u4F1A\u8BDD\u6807\u9898\u548C\u5DE5\u4F5C\u533A\u67E5\u627E\u3002";
function sanitizeQuery(value) {
  let query = String(value).replace(/\0/g, "").slice(0, 500);
  const last = query.charCodeAt(query.length - 1);
  if (last >= 55296 && last <= 56319) query = query.slice(0, -1);
  return query;
}
function createGlobalSearchModel(ctx, { openHome, openWorkspace, debounceMs = 180 } = {}) {
  const listeners = /* @__PURE__ */ new Set();
  const supportsText = typeof ctx.sessions.search === "function";
  const categories = CATEGORIES.filter(([id]) => id !== "text" || supportsText).map(([id, label]) => ({ id, label }));
  let state = { open: false, query: "", category: "all", loading: false, error: "", notice: "", busyId: null, hasMore: false };
  let remoteItems = [], snapshot2, rows = /* @__PURE__ */ new Map(), stops = [], timer, request, queryEpoch = 0, actionEpoch = 0, disposed = false, textUnavailable = false;
  const mainPanels = () => new Set((ctx.slots?.entries?.("main") || []).map((entry) => entry.options?.key));
  function catalog() {
    const list = read(ctx.sessions.list), workspaceState = read(ctx.workspaces.list);
    const workspaces = workspaceState.items || [], archived = new Set(workspaceState.archivedSessionIds || []), membership = /* @__PURE__ */ new Map();
    for (const workspace of workspaces) for (const id of workspace.sessionIds || []) {
      if (!membership.has(id)) membership.set(id, text2(workspace.title) || text2(workspace.path));
    }
    const sessions = [...new Set(list.ids || [])].map((id) => list.byId?.[id]).filter((s) => s?.id && s.origin !== "subagent" && !s.blank && !archived.has(s.id)).sort((a, b) => time(b.updatedAt) - time(a.updatedAt) || a.id.localeCompare(b.id));
    const sessionRows = sessions.map((s) => ({
      id: "session:" + s.id,
      sessionId: s.id,
      kind: "session",
      title: text2(s.title) || text2(s.projectionValues?.title) || "\u672A\u547D\u540D\u804A\u5929",
      detail: membership.get(s.id) || text2(s.cwd).split(/[\\/]/).filter(Boolean).at(-1) || ""
    }));
    const workspaceRows = workspaces.filter((w) => w.workspaceId).map((w) => ({ id: "workspace:" + w.workspaceId, workspaceId: w.workspaceId, kind: "workspace", title: text2(w.title) || text2(w.path) || "\u672A\u547D\u540D\u5DE5\u4F5C\u533A", detail: text2(w.path) }));
    const panels = mainPanels();
    const actions = [
      { id: "action:home", kind: "action", title: "\u65B0\u804A\u5929", panel: "home" },
      { id: "action:plugins", kind: "action", title: "\u6253\u5F00\u63D2\u4EF6", panel: "plugins" },
      { id: "action:schedules", kind: "action", title: "\u81EA\u52A8\u5316\u4EFB\u52A1", panel: "schedules" }
    ].filter((row) => panels.has(row.panel));
    return { sessionRows, workspaceRows, actions };
  }
  function publish() {
    const { sessionRows, workspaceRows, actions } = catalog(), query = state.query.trim().toLocaleLowerCase();
    const terms = query.split(/\s+/).filter(Boolean);
    const matches = (row) => terms.every((term) => [row.title, row.detail, row.sessionId].filter(Boolean).join(" ").toLocaleLowerCase().includes(term));
    const byId = new Map(sessionRows.map((row) => [row.sessionId, row])), hits = /* @__PURE__ */ new Map();
    for (const item of remoteItems) {
      if (byId.has(item?.sessionId) && !hits.has(item.sessionId)) hits.set(item.sessionId, text2(item.snippet));
    }
    const local = sessionRows.filter(matches);
    const seen = new Set(local.map((row) => row.sessionId));
    const combined = [...local, ...[...hits.keys()].filter((id) => !seen.has(id)).map((id) => byId.get(id))].map((row) => ({ ...row, ...hits.has(row.sessionId) ? { snippet: hits.get(row.sessionId) } : {} }));
    const body = [...hits].map(([id, snippet]) => ({ ...byId.get(id), id: "text:" + id, kind: "text", snippet }));
    const all = state.category === "all", groups = [];
    let truncated = false;
    const add = (id, label, items, limit = 20) => {
      if ((all || state.category === id) && items.length) {
        truncated ||= items.length > limit;
        groups.push({ id, label, items: items.slice(0, limit) });
      }
    };
    add("actions", "\u5FEB\u6377\u64CD\u4F5C", actions.filter(matches));
    add("sessions", query ? "\u804A\u5929" : "\u6700\u8FD1\u804A\u5929", combined, all ? 8 : 20);
    add("workspaces", "\u5DE5\u4F5C\u533A", workspaceRows.filter(matches), all ? 5 : 20);
    if (state.category === "text" && body.length) groups.push({ id: "text", label: "\u804A\u5929\u5185\u5BB9", items: body.slice(0, 20) });
    rows = new Map(groups.flatMap((group) => group.items).map((row) => [row.id, row]));
    snapshot2 = { ...state, hasMore: truncated || ["all", "sessions", "text"].includes(state.category) && state.hasMore, categories: categories.filter((c) => !textUnavailable || c.id !== "text"), groups };
    for (const listener of [...listeners]) listener();
  }
  function cancelSearch() {
    queryEpoch++;
    clearTimeout(timer);
    timer = void 0;
    request?.abort();
    request = void 0;
  }
  function scheduleSearch() {
    cancelSearch();
    remoteItems = [];
    state.hasMore = false;
    state.error = "";
    state.notice = "";
    state.loading = false;
    const query = state.query.trim();
    if (!state.open || !query || !supportsText) return;
    if (textUnavailable) {
      state.notice = INDEX_DISABLED;
      return;
    }
    state.loading = true;
    const epoch = queryEpoch;
    timer = setTimeout(async () => {
      timer = void 0;
      const controller = new AbortController();
      request = controller;
      try {
        const result = await ctx.sessions.search(query, controller.signal);
        if (disposed || epoch !== queryEpoch || controller.signal.aborted) return;
        if (!result?.ok) throw new Error(result?.error?.message || "\u804A\u5929\u5185\u5BB9\u641C\u7D22\u5931\u8D25");
        remoteItems = Array.isArray(result.value?.items) ? result.value.items : [];
        state.hasMore = result.value?.hasMore === true;
      } catch (error) {
        if (disposed || epoch !== queryEpoch || controller.signal.aborted) return;
        if (/session search is disabled/i.test(error?.message || "")) {
          textUnavailable = true;
          if (state.category === "text") state.category = "sessions";
          state.notice = INDEX_DISABLED;
        } else state.error = "\u804A\u5929\u5185\u5BB9\u641C\u7D22\u6682\u4E0D\u53EF\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\uFF1B\u4ECD\u53EF\u641C\u7D22\u4F1A\u8BDD\u6807\u9898\u3002";
      } finally {
        if (!disposed && epoch === queryEpoch && !controller.signal.aborted) {
          request = void 0;
          state.loading = false;
          publish();
        }
      }
    }, debounceMs);
  }
  function stopSources() {
    for (const stop5 of stops.splice(0)) stop5();
  }
  function close() {
    if (!state.open) return;
    cancelSearch();
    actionEpoch++;
    stopSources();
    remoteItems = [];
    state = { ...state, open: false, loading: false, busyId: null, error: "", notice: "", hasMore: false };
    publish();
  }
  publish();
  return {
    getSnapshot: () => snapshot2,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    open() {
      if (disposed || state.open) return;
      state = { ...state, open: true, query: "", category: "all", loading: false, error: "", notice: "", busyId: null, hasMore: false };
      try {
        for (const source2 of [ctx.sessions.list, ctx.workspaces.list]) if (source2?.subscribe) stops.push(source2.subscribe(publish));
        if (ctx.slots?.subscribe) stops.push(ctx.slots.subscribe("main", publish));
      } catch (error) {
        stopSources();
        state.open = false;
        publish();
        throw error;
      }
      publish();
    },
    close,
    setQuery(query) {
      if (disposed || !state.open || state.busyId) return;
      const next = sanitizeQuery(query);
      if (next === state.query) return;
      state.query = next;
      scheduleSearch();
      publish();
    },
    setCategory(id) {
      if (disposed || !state.open || state.busyId || !snapshot2.categories.some((c) => c.id === id)) return;
      state.category = id;
      publish();
    },
    async select(id) {
      if (disposed || !state.open || state.busyId) return false;
      publish();
      const row = rows.get(id);
      if (!row) return false;
      const epoch = ++actionEpoch;
      state.busyId = id;
      state.error = "";
      publish();
      try {
        if (row.kind === "session" || row.kind === "text") await ctx.uiWorkspace.openSession(row.sessionId);
        else if (row.kind === "workspace") {
          if (!openWorkspace) throw new Error("\u5F53\u524D\u7248\u672C\u4E0D\u652F\u6301\u4ECE\u641C\u7D22\u6253\u5F00\u5DE5\u4F5C\u533A");
          await openWorkspace(row.workspaceId);
        } else if (row.panel === "home" && openHome) await openHome();
        else await ctx.layout.selectPanel(row.panel);
        if (!disposed && epoch === actionEpoch) close();
        return true;
      } catch (error) {
        if (!disposed && epoch === actionEpoch) {
          state.error = error?.message || "\u65E0\u6CD5\u6253\u5F00\uFF0C\u8BF7\u91CD\u8BD5";
          state.busyId = null;
          publish();
        }
        return false;
      }
    },
    dispose() {
      if (disposed) return;
      close();
      disposed = true;
      cancelSearch();
      stopSources();
      listeners.clear();
    }
  };
}

// global-search-ui.js
var import_react8 = __toESM(require("react"), 1);
var h8 = import_react8.default.createElement;
var stop4 = (event) => event.stopPropagation();
var ICONS = {
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm4.7-1.8L20 20",
  action: "m13 2-8 11h6l-1 9 9-13h-6l1-7Z",
  session: "M20 11.5a8 8 0 0 1-8 8 9 9 0 0 1-3.6-.8L4 20l1.3-4.4a9 9 0 0 1-.8-3.6 8 8 0 1 1 15.5-.5Z",
  workspace: "M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10H3V6Z",
  text: "M5 3h10l4 4v14H5V3Zm9 0v5h5M8 12h8M8 16h6"
};
var ACTION_ICONS = {
  "action:home": "M12 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7M17 3l4 4-11 11-5 1 1-5L17 3Zm-3 3 4 4",
  "action:plugins": "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z",
  "action:schedules": "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2"
};
function Icon({ kind = "search", itemId }) {
  const path = kind === "action" ? ACTION_ICONS[itemId] || ICONS.action : ICONS[kind] || ICONS.search;
  return h8("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true }, h8("path", { d: path }));
}
function GlobalSearchPalette({ model, Modal }) {
  const snapshot2 = import_react8.default.useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  const [activeId, setActiveId] = import_react8.default.useState(null);
  const [pendingId, setPendingId] = import_react8.default.useState(null);
  const inputRef = import_react8.default.useRef(null), rows = import_react8.default.useRef(/* @__PURE__ */ new Map()), composing = import_react8.default.useRef(false), selection = import_react8.default.useRef(null);
  const instance = import_react8.default.useId(), listId = instance + "-results", statusId = instance + "-status";
  const groups = snapshot2.groups || [], items = groups.flatMap((group) => group.items || []);
  const currentId = items.some((item) => item.id === activeId) ? activeId : items[0]?.id ?? null;
  const busy = snapshot2.busyId != null || pendingId !== null;
  const optionId = (id) => instance + "-option-" + encodeURIComponent(id);
  import_react8.default.useEffect(() => {
    setActiveId(snapshot2.open ? currentId : null);
    if (!snapshot2.open) {
      composing.current = false;
      selection.current = null;
      setPendingId(null);
    }
  }, [snapshot2.open, currentId]);
  import_react8.default.useEffect(() => () => {
    selection.current = null;
  }, [model]);
  import_react8.default.useLayoutEffect(() => {
    if (snapshot2.open && currentId !== null) rows.current.get(currentId)?.scrollIntoView?.({ block: "nearest" });
  }, [snapshot2.open, currentId, groups]);
  async function select(id) {
    if (id === null || busy || selection.current || !snapshot2.open) return;
    const operation = { id };
    selection.current = operation;
    setPendingId(id);
    try {
      await model.select(id);
    } catch {
    } finally {
      if (selection.current === operation) {
        selection.current = null;
        setPendingId(null);
      }
    }
  }
  function onKeyDown(event) {
    if (composing.current || event.isComposing || event.nativeEvent?.isComposing || event.keyCode === 229 || event.nativeEvent?.keyCode === 229) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (items.length) {
        const index = items.findIndex((item) => item.id === currentId), delta = event.key === "ArrowDown" ? 1 : -1;
        setActiveId(items[(index + delta + items.length) % items.length].id);
      }
    } else if (event.key === "Enter") {
      event.preventDefault();
      void select(currentId);
    }
  }
  const needsTextQuery = snapshot2.category === "text" && !snapshot2.query?.trim();
  const emptyLabel = needsTextQuery ? "\u8F93\u5165\u5173\u952E\u8BCD\uFF0C\u641C\u7D22\u804A\u5929\u5185\u5BB9" : snapshot2.query?.trim() ? "\u6CA1\u6709\u627E\u5230\u5339\u914D\u7684\u7ED3\u679C" : "\u6682\u65E0\u53EF\u7528\u7ED3\u679C";
  const error = typeof snapshot2.error === "string" ? snapshot2.error : snapshot2.error?.message;
  const status = snapshot2.loading ? "\u6B63\u5728\u641C\u7D22\u2026" : items.length ? "\u627E\u5230 " + items.length + " \u6761\u7ED3\u679C" + (snapshot2.hasMore ? "\uFF0C\u7EE7\u7EED\u8F93\u5165\u53EF\u7F29\u5C0F\u8303\u56F4" : "") : emptyLabel;
  return h8(Modal, {
    open: snapshot2.open,
    title: "\u641C\u7D22",
    headless: true,
    className: "cgpt-global-search-modal",
    contentClassName: "cgpt-global-search-modal-content",
    shortcutModal: "dsh-dock.search",
    onClose: () => model.close()
  }, h8(
    "div",
    { className: "cgpt-global-search", onClick: stop4, onPointerDown: stop4, onContextMenu: stop4 },
    h8(
      "div",
      { className: "cgpt-global-search-input-row" },
      h8(Icon),
      h8("input", {
        ref: inputRef,
        type: "text",
        role: "combobox",
        className: "cgpt-global-search-input",
        value: snapshot2.query || "",
        placeholder: "\u641C\u7D22\u4F1A\u8BDD\u3001\u5DE5\u4F5C\u533A\u6216\u64CD\u4F5C\u2026",
        "aria-label": "\u641C\u7D22\u4F1A\u8BDD\u3001\u5DE5\u4F5C\u533A\u6216\u64CD\u4F5C",
        "aria-autocomplete": "list",
        "aria-expanded": Boolean(snapshot2.open),
        "aria-controls": listId,
        "aria-activedescendant": snapshot2.open && currentId !== null ? optionId(currentId) : void 0,
        "aria-describedby": statusId,
        "aria-busy": Boolean(snapshot2.loading),
        autoComplete: "off",
        spellCheck: false,
        "data-modal-autofocus": true,
        onChange: (event) => model.setQuery(event.target.value),
        onKeyDown,
        onCompositionStart: () => {
          composing.current = true;
        },
        onCompositionEnd: () => {
          composing.current = false;
        }
      }),
      h8("button", { type: "button", className: "cgpt-global-search-close", "aria-label": "\u5173\u95ED\u641C\u7D22", onClick: () => model.close() }, h8("kbd", null, "esc"))
    ),
    h8(
      "div",
      { className: "cgpt-global-search-results", id: listId, role: "listbox", "aria-label": "\u641C\u7D22\u7ED3\u679C", "aria-busy": Boolean(snapshot2.loading || busy) },
      error && h8("div", { className: "cgpt-global-search-message cgpt-global-search-error", role: "alert" }, error),
      snapshot2.notice && h8("div", { className: "cgpt-global-search-message", role: "status" }, snapshot2.notice),
      groups.filter((group) => group.items?.length).map((group, index) => h8(
        "div",
        { key: group.id, role: "group", "aria-labelledby": instance + "-group-" + index, className: "cgpt-global-search-group" },
        h8("div", { id: instance + "-group-" + index, className: "cgpt-global-search-heading" }, group.label),
        group.items.map((item) => h8(
          "div",
          {
            key: item.id,
            id: optionId(item.id),
            role: "option",
            tabIndex: -1,
            "aria-selected": item.id === currentId,
            "aria-disabled": busy || void 0,
            "data-search-item": item.id,
            className: "cgpt-global-search-option" + (item.snippet ? " cgpt-global-search-option-snippet" : ""),
            ref: (node) => {
              if (node) rows.current.set(item.id, node);
              else rows.current.delete(item.id);
            },
            onMouseEnter: () => setActiveId(item.id),
            onMouseDown: (event) => event.preventDefault(),
            onClick: () => void select(item.id)
          },
          h8("span", { className: "cgpt-global-search-icon" }, h8(Icon, { kind: item.kind, itemId: item.id })),
          h8("span", { className: "cgpt-global-search-copy" }, h8("span", { className: "cgpt-global-search-title" }, item.title), item.snippet && h8("span", { className: "cgpt-global-search-snippet" }, item.snippet)),
          item.detail && h8("span", { className: "cgpt-global-search-detail" }, item.detail),
          item.shortcut && h8("kbd", { className: "cgpt-global-search-shortcut" }, item.shortcut),
          (snapshot2.busyId === item.id || pendingId === item.id) && h8("span", { className: "cgpt-global-search-spinner", "aria-label": "\u6B63\u5728\u6253\u5F00" })
        ))
      )),
      snapshot2.loading && h8("div", { className: "cgpt-global-search-message" }, h8("span", { className: "cgpt-global-search-spinner", "aria-hidden": true }), "\u6B63\u5728\u641C\u7D22\u2026"),
      !snapshot2.loading && !items.length && !error && h8("div", { className: "cgpt-global-search-empty" }, h8(Icon, { kind: needsTextQuery ? "text" : "search" }), h8("p", null, emptyLabel)),
      snapshot2.hasMore && !snapshot2.loading && h8("div", { className: "cgpt-global-search-message cgpt-global-search-more" }, "\u7ED3\u679C\u8F83\u591A\uFF0C\u8BF7\u7EE7\u7EED\u8F93\u5165\u4EE5\u7F29\u5C0F\u8303\u56F4\u3002")
    ),
    h8("div", { id: statusId, className: "cgpt-global-search-sr-only", role: "status", "aria-live": "polite" }, status),
    h8(
      "div",
      { className: "cgpt-global-search-footer" },
      h8("div", { className: "cgpt-global-search-categories", role: "group", "aria-label": "\u641C\u7D22\u8303\u56F4" }, (snapshot2.categories || []).map((category) => h8("button", {
        key: category.id,
        type: "button",
        "aria-pressed": snapshot2.category === category.id,
        onClick: () => {
          model.setCategory(category.id);
          inputRef.current?.focus();
        }
      }, category.label))),
      h8("span", { className: "cgpt-global-search-hint", "aria-hidden": true }, h8("kbd", null, "\u2191\u2193"), " \u9009\u62E9 ", h8("kbd", null, "\u21B5"), " \u6253\u5F00")
    )
  ));
}

// global-search-entry.js
var wrappers = /* @__PURE__ */ new WeakMap();
function liveResolver(resolve) {
  let record;
  while ((record = wrappers.get(resolve)) && !record.active) resolve = record.original;
  return resolve;
}
function wireGlobalSearchEntry({ document: document2, shortcuts, open, getSearchLabel }) {
  if (typeof document2?.addEventListener !== "function" || typeof open !== "function") {
    throw new TypeError("A document and search opener are required.");
  }
  const records = /* @__PURE__ */ new Map(), seen = /* @__PURE__ */ new WeakSet();
  let current, unsubscribe, disposed = false;
  function onClick(event) {
    if (disposed || event.defaultPrevented || event.button > 0) return;
    const target = event.target?.closest ? event.target : event.target?.parentElement;
    if (!target) return;
    let trigger = target.closest("[data-cgpt-search-button]");
    if (!trigger) {
      const button = target.closest("button");
      const label = typeof getSearchLabel === "function" ? getSearchLabel() : void 0;
      if (!button?.closest('[data-slot="sidebar.workspaces"]') || !label || button.getAttribute("aria-label") !== label) return;
      trigger = button;
    }
    if (trigger.disabled || trigger.getAttribute("aria-disabled") === "true") return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    trigger.focus?.({ preventScroll: true });
    open();
  }
  function release(record) {
    record.active = false;
    if (record.command.resolve === record.wrapper) {
      record.command.resolve = liveResolver(record.original);
    }
  }
  function sync() {
    if (disposed) return;
    const command = shortcuts?.registry?.commands?.get?.("session.search");
    if (command !== current) {
      const previous = records.get(current);
      if (previous) release(previous);
      current = command;
    }
    if (!command || typeof command !== "object" && typeof command !== "function" || typeof command.resolve !== "function" || seen.has(command)) return;
    seen.add(command);
    const record = { command, original: command.resolve, wrapper: null, active: true };
    record.wrapper = function(...args) {
      const result = Reflect.apply(record.original, this, args);
      if (!record.active || result?.status !== "handled") return result;
      return { ...result, run: function(...runArgs) {
        if (!record.active) return typeof result.run === "function" ? Reflect.apply(result.run, this, runArgs) : void 0;
        return open();
      } };
    };
    try {
      command.resolve = record.wrapper;
    } catch {
      return;
    }
    if (command.resolve !== record.wrapper) return;
    wrappers.set(record.wrapper, record);
    records.set(command, record);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    document2.removeEventListener("click", onClick, true);
    unsubscribe?.();
    for (const record of records.values()) release(record);
    records.clear();
  }
  document2.addEventListener("click", onClick, true);
  try {
    sync();
    if (typeof shortcuts?.catalog?.subscribe === "function") unsubscribe = shortcuts.catalog.subscribe(sync);
  } catch (error) {
    dispose();
    throw error;
  }
  return dispose;
}

// notification-model.js
var text3 = (value) => typeof value === "string" ? value.trim() : "";
var time2 = (value) => typeof value === "number" && Number.isFinite(value) ? value : Date.parse(value) || 0;
var isSource2 = (value) => typeof value?.getSnapshot === "function" && typeof value?.subscribe === "function";
var DETAILS = { approval: "\u7B49\u5F85\u5BA1\u6279", question: "\u7B49\u5F85\u56DE\u7B54", "plan-review": "\u7B49\u5F85\u786E\u8BA4\u8BA1\u5212", completed: "\u4EFB\u52A1\u5DF2\u5B8C\u6210", error: "\u4EFB\u52A1\u51FA\u9519", aborted: "\u4EFB\u52A1\u5DF2\u53D6\u6D88", blocked: "\u4EFB\u52A1\u88AB\u963B\u6B62", "max-tokens": "\u5DF2\u8FBE\u5230\u957F\u5EA6\u9650\u5236", interrupted: "\u4EFB\u52A1\u5DF2\u4E2D\u65AD" };
var PENDING = /* @__PURE__ */ new Set(["approval", "question", "plan-review"]);
var STORAGE_KEY = "dsh-dock:notification-inbox:v1";
var MAX_RECORDS = 200;
var sameItems = (a, b) => a.length === b.length && a.every((item, i) => Object.keys(item).every((key) => item[key] === b[i][key]));
function preview(content) {
  if (!Array.isArray(content)) return "";
  return content.filter((block) => block?.type === "text").slice(0, 8).map((block) => text3(block.text).slice(0, 400)).join(" ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*_#]/g, "").replace(/\s+/g, " ").slice(0, 180);
}
function latestCompletion(records) {
  let excerpt = "", latest = null;
  const events = (Array.isArray(records) ? records : []).filter((row) => row?.type === "event").map((row) => row.event).filter(Boolean).sort((a, b) => a.seq - b.seq);
  for (const event of events) {
    if (event.type === "turn/start") excerpt = "";
    if (event.type === "assistant/message") excerpt = preview(event.data?.message?.content) || excerpt;
    const kind = event.data?.reason?.kind;
    if (event.type !== "turn/end" || !Object.hasOwn(DETAILS, kind) || PENDING.has(kind) || !Number.isSafeInteger(event.seq) || event.seq < 0 || !time2(event.time)) continue;
    latest = { seq: event.seq, occurredAt: time2(event.time), kind, excerpt };
  }
  return latest;
}
function createNotificationModel(ctx, options = {}) {
  const listeners = /* @__PURE__ */ new Set(), records = /* @__PURE__ */ new Map(), fingerprints = /* @__PURE__ */ new Map(), requests = /* @__PURE__ */ new Map(), queue = /* @__PURE__ */ new Set(), failures = /* @__PURE__ */ new Set(), unsupported = /* @__PURE__ */ new Set(), running = /* @__PURE__ */ new Map(), awaitingEnd = /* @__PURE__ */ new Map();
  const now = options.now || Date.now;
  let storage = options.storage;
  if (storage === void 0) try {
    storage = globalThis.localStorage;
  } catch {
  }
  let storageError = "", since = now(), state = { open: false, busyId: null, error: "" }, snapshot2, publishedSnapshot, stops = [], timer, actionEpoch = 0, disposed = false, started = false;
  try {
    const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || "null");
    if (saved?.version === 1) {
      if (Number.isFinite(saved.since) && saved.since > 0) since = saved.since;
      for (const item of (Array.isArray(saved.records) ? saved.records : []).slice(0, MAX_RECORDS)) {
        if (text3(item.id) && Number.isSafeInteger(item.seq) && item.seq >= 0 && time2(item.occurredAt) > 0 && Object.hasOwn(DETAILS, item.kind) && !PENDING.has(item.kind))
          records.set(item.id, { seq: item.seq, occurredAt: time2(item.occurredAt), kind: item.kind, excerpt: text3(item.excerpt).slice(0, 180), unread: item.unread === true });
      }
    }
  } catch {
  }
  function persist() {
    const entries = [...records].sort((a, b) => b[1].occurredAt - a[1].occurredAt).slice(0, MAX_RECORDS);
    records.clear();
    for (const [id, record] of entries) records.set(id, record);
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify({ version: 1, since, records: entries.map(([id, record]) => ({ id, ...record })) }));
    } catch {
      storageError = "\u901A\u77E5\u5DF2\u8BFB\u53D6\uFF0C\u4F46\u672C\u673A\u5B58\u50A8\u4E0D\u53EF\u7528\uFF0C\u5237\u65B0\u540E\u5DF2\u8BFB\u72B6\u6001\u53EF\u80FD\u4E22\u5931\u3002";
    }
  }
  function sources() {
    return [(ctx.uiSession || ctx.get?.("uiSession"))?.sessionStatus, ctx.sessions?.list, ctx.workspaces?.list];
  }
  function roster() {
    const [statusSource, sessionSource, workspaceSource] = sources();
    if (!isSource2(sessionSource) || !isSource2(workspaceSource)) return { available: false, rows: [], statuses: /* @__PURE__ */ new Map(), phase: "pending" };
    const list = sessionSource.getSnapshot(), workspaces = workspaceSource.getSnapshot(), statuses = isSource2(statusSource) ? statusSource.getSnapshot() : /* @__PURE__ */ new Map();
    const archived = new Set(workspaces?.archivedSessionIds || []), titles = /* @__PURE__ */ new Map();
    for (const workspace of workspaces?.items || []) for (const id of workspace.sessionIds || []) titles.set(id, text3(workspace.title));
    const rows = [...new Set(list?.ids || [])].map((id) => list.byId?.[id]).filter((row) => row?.id && !row.blank && row.origin !== "subagent" && !archived.has(row.id));
    return { available: typeof ctx.uiWorkspace?.openSession === "function", rows, statuses: statuses instanceof Map ? statuses : /* @__PURE__ */ new Map(), phase: list?.phase, titles };
  }
  function refresh() {
    if (disposed) return;
    let items = [], available = false, error = state.error;
    try {
      const data = roster();
      available = data.available;
      if (available) items = data.rows.map((row) => {
        const status = data.statuses.get(row.id), pending = status?.pendingInteraction?.kind, record = records.get(row.id);
        if (!PENDING.has(pending) && !record) return null;
        const kind = PENDING.has(pending) ? pending : record.kind;
        return { id: row.id, title: text3(row.title) || text3(row.projectionValues?.title) || "\u672A\u547D\u540D\u804A\u5929", workspaceTitle: data.titles.get(row.id) || "", kind, detail: DETAILS[kind], excerpt: PENDING.has(pending) ? DETAILS[kind] : record.excerpt, unread: PENDING.has(pending) || record?.unread === true, occurredAt: PENDING.has(pending) ? time2(row.updatedAt) : record.occurredAt };
      }).filter(Boolean).sort((a, b) => Number(b.unread) - Number(a.unread) || b.occurredAt - a.occurredAt || a.id.localeCompare(b.id));
    } catch {
      available = false;
      error = "\u901A\u77E5\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002";
    }
    if (!error && storageError) error = storageError;
    if (!error && failures.size) error = "\u90E8\u5206\u5B8C\u6210\u8BB0\u5F55\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6\uFF0C\u7A0D\u540E\u4F1A\u81EA\u52A8\u91CD\u8BD5\u3002";
    const loading = requests.size > 0 || queue.size > 0;
    const notice = unsupported.size ? `${unsupported.size} \u4E2A\u65E7\u7248\u4F1A\u8BDD\u65E0\u6CD5\u8BFB\u53D6\u5386\u53F2\u8BB0\u5F55\uFF0C\u5176\u4F59\u901A\u77E5\u6B63\u5E38\u3002` : "";
    if (snapshot2 && snapshot2.open === state.open && snapshot2.busyId === state.busyId && snapshot2.error === error && snapshot2.available === available && snapshot2.loading === loading && snapshot2.notice === notice && sameItems(snapshot2.items, items)) return;
    snapshot2 = Object.freeze({ ...state, error, available, loading, notice, count: items.filter((item) => item.unread).length, items: Object.freeze(items.map((item) => Object.freeze(item))) });
  }
  function publish() {
    if (disposed) return;
    refresh();
    if (snapshot2 === publishedSnapshot) return;
    publishedSnapshot = snapshot2;
    for (const listener of [...listeners]) listener();
  }
  function enqueue(id) {
    if (!disposed) {
      queue.add(id);
    }
  }
  function readMethod() {
    return ctx.remote?.session?.events || ctx.remote?.session?.page;
  }
  function pump() {
    if (disposed || !started || typeof readMethod() !== "function") return;
    for (const id of [...queue]) {
      if (requests.size >= 3) break;
      if (requests.has(id)) continue;
      queue.delete(id);
      const controller = new AbortController();
      requests.set(id, controller);
      Promise.resolve().then(() => readMethod().call(ctx.remote.session, { address: { kind: "session", sessionId: id }, maxMessages: 50, turnWindow: { minMessages: 1, minTurns: 2 } }, controller.signal)).then((result) => {
        if (disposed || controller.signal.aborted) return;
        if (result?.ok === false) throw result.error || new Error("history unavailable");
        const page = result?.ok === true ? result.value : result;
        if (!Array.isArray(page?.records)) throw new Error("invalid history");
        failures.delete(id);
        unsupported.delete(id);
        const latest = latestCompletion(page.records), previous = records.get(id);
        if (latest && awaitingEnd.has(id) && latest.seq > awaitingEnd.get(id)) awaitingEnd.delete(id);
        if (latest && (!previous || latest.seq > previous.seq)) {
          const hostUnread = roster().statuses.get(id)?.completionUnread === true;
          records.set(id, { ...latest, unread: hostUnread || latest.occurredAt >= since });
          persist();
        }
      }).catch((error) => {
        if (disposed || controller.signal.aborted) return;
        if (error?.code === "gateway/internal" && /Session migration from v\d+ to v\d+ refuses/.test(error.message || "")) {
          unsupported.add(id);
          failures.delete(id);
        } else failures.add(id);
      }).finally(() => {
        if (requests.get(id) === controller) requests.delete(id);
        if (!disposed) {
          pump();
          publish();
        }
      });
    }
    publish();
  }
  function synchronize(force = false) {
    if (disposed) return;
    try {
      const data = roster();
      if (typeof readMethod() === "function") {
        const sorted = [...data.rows].sort((a, b) => time2(b.updatedAt) - time2(a.updatedAt));
        const initial = new Set(sorted.map((row) => row.id));
        for (const row of sorted) {
          const status = data.statuses.get(row.id), fingerprint = `${time2(row.updatedAt)}:${status?.running ?? row.running ?? false}:${status?.completionUnread === true}`;
          const previous = fingerprints.get(row.id), isRunning = (status?.running ?? row.running) === true;
          if (running.get(row.id) === true && !isRunning) awaitingEnd.set(row.id, records.get(row.id)?.seq ?? -1);
          running.set(row.id, isRunning);
          if (previous === void 0 && initial.has(row.id) || previous !== void 0 && previous !== fingerprint || force && initial.has(row.id)) enqueue(row.id);
          fingerprints.set(row.id, fingerprint);
        }
        if (data.phase === "ready") {
          const visible = new Set(data.rows.map((row) => row.id));
          for (const id of fingerprints.keys()) if (!visible.has(id)) {
            fingerprints.delete(id);
            running.delete(id);
            awaitingEnd.delete(id);
            queue.delete(id);
            failures.delete(id);
            unsupported.delete(id);
            requests.get(id)?.abort();
          }
        }
      }
    } catch {
    }
    pump();
    publish();
  }
  function start() {
    if (started || disposed) return;
    started = true;
    persist();
    try {
      for (const source2 of sources()) if (isSource2(source2)) stops.push(source2.subscribe(() => synchronize()));
    } catch {
      state.error = "\u901A\u77E5\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002";
    }
    synchronize();
    timer = setInterval(() => {
      try {
        for (const row of [...roster().rows].sort((a, b) => time2(b.updatedAt) - time2(a.updatedAt)).slice(0, 6)) enqueue(row.id);
        for (const id of failures) enqueue(id);
        for (const id of awaitingEnd.keys()) enqueue(id);
      } catch {
      }
      pump();
    }, options.pollMs || 3e4);
    timer?.unref?.();
  }
  function close() {
    if (disposed || !state.open) return;
    actionEpoch++;
    state = { ...state, open: false, busyId: null, error: "" };
    publish();
  }
  refresh();
  publishedSnapshot = snapshot2;
  return {
    getSnapshot() {
      refresh();
      return snapshot2;
    },
    subscribe(listener) {
      if (disposed) return () => {
      };
      const registered = () => listener();
      listeners.add(registered);
      start();
      return () => listeners.delete(registered);
    },
    open() {
      if (disposed || state.open) return;
      actionEpoch++;
      state = { ...state, open: true, busyId: null, error: "" };
      start();
      synchronize(true);
    },
    close,
    markAllRead() {
      if (disposed) return;
      for (const record of records.values()) record.unread = false;
      persist();
      publish();
    },
    async select(sessionId) {
      if (disposed || !state.open || state.busyId !== null) return false;
      publish();
      if (!snapshot2.available || !snapshot2.items.some((item) => item.id === sessionId)) return false;
      const selectedSeq = records.get(sessionId)?.seq, epoch = ++actionEpoch;
      state.busyId = sessionId;
      state.error = "";
      publish();
      try {
        await ctx.uiWorkspace.openSession(sessionId);
        if (!disposed && epoch === actionEpoch) {
          const record = records.get(sessionId);
          if (record && record.seq === selectedSeq) {
            record.unread = false;
            persist();
          }
          state.busyId = null;
          publish();
        }
        return true;
      } catch (error) {
        if (!disposed && epoch === actionEpoch) {
          state.busyId = null;
          state.error = text3(error?.message) || "\u65E0\u6CD5\u6253\u5F00\u4F1A\u8BDD\uFF0C\u8BF7\u91CD\u8BD5\u3002";
          publish();
        }
        return false;
      }
    },
    dispose() {
      if (disposed) return;
      actionEpoch++;
      disposed = true;
      clearInterval(timer);
      for (const stop5 of stops.splice(0)) stop5();
      for (const request of requests.values()) request.abort();
      requests.clear();
      queue.clear();
      listeners.clear();
      snapshot2 = Object.freeze({ ...snapshot2, open: false, busyId: null, loading: false });
    }
  };
}

// video-preview.js
var import_react9 = __toESM(require("react"), 1);

// desktop-video-source.js
var DESKTOP_VIDEO_BYTE_LIMIT = 256 * 1024 * 1024;
var failure3 = (code, message, cause) => Object.assign(new Error(message, cause ? { cause } : void 0), { name: code === "aborted" ? "AbortError" : "DesktopVideoSourceError", code });
var abortFailure = () => failure3("aborted", "\u89C6\u9891\u8F7D\u5165\u5DF2\u53D6\u6D88\u3002");
var MIME_TYPES = /* @__PURE__ */ new Set(["video/mp4", "video/x-m4v", "video/quicktime", "video/webm", "application/octet-stream"]);
function createDesktopVideoSourceManager({ fetch: fetcher = globalThis.fetch, urlApi = globalThis.URL, Blob: BlobClass = globalThis.Blob, limit = DESKTOP_VIDEO_BYTE_LIMIT, now = () => globalThis.performance?.now?.() ?? Date.now() } = {}) {
  const operations = /* @__PURE__ */ new Set();
  let used = 0, disposed = false;
  const rejected = (error) => {
    const promise = Promise.reject(error);
    promise.catch(() => {
    });
    return { promise, dispose() {
    } };
  };
  function release(operation) {
    if (operation.released) return;
    operation.released = true;
    if (operation.url !== null) {
      urlApi.revokeObjectURL(operation.url);
      operation.url = null;
    }
    used -= operation.reserved;
    operation.reserved = 0;
    operations.delete(operation);
    operation.signal?.removeEventListener?.("abort", operation.cancel);
  }
  function cancel(operation) {
    if (operation.released) return;
    operation.controller.abort();
    try {
      Promise.resolve(operation.reader?.cancel()).catch(() => {
      });
    } catch {
    }
    if (operation.complete) release(operation);
  }
  return {
    get reservedBytes() {
      return used;
    },
    open(url, { bytes, signal, onProgress } = {}) {
      if (disposed) return rejected(failure3("closed", "\u89C6\u9891\u9884\u89C8\u5DF2\u5173\u95ED\u3002"));
      let address;
      try {
        address = new URL(url);
      } catch {
        return rejected(failure3("unavailable", "\u65E0\u6548\u7684\u89C6\u9891\u5730\u5740\u3002"));
      }
      if (address.protocol !== "dsh-app:" || address.hostname !== "app" || address.username || address.password || !address.pathname.endsWith("/api/chatgpt-rail/media") || typeof fetcher !== "function") return rejected(failure3("unavailable", "\u684C\u9762\u89C6\u9891\u5730\u5740\u4E0D\u53EF\u7528\u3002"));
      const expected = bytes === void 0 ? null : bytes;
      if (expected !== null && (!Number.isSafeInteger(expected) || expected < 0)) return rejected(failure3("unavailable", "\u89C6\u9891\u5927\u5C0F\u4E0D\u53EF\u7528\u3002"));
      if (expected !== null && expected > limit) return rejected(failure3("too-large", "\u89C6\u9891\u8D85\u8FC7\u684C\u9762\u9884\u89C8\u5927\u5C0F\u4E0A\u9650\u3002"));
      const reservation = expected === null ? limit : expected;
      if (used + reservation > limit) return rejected(failure3("busy", "\u8BF7\u5148\u5173\u95ED\u5176\u4ED6\u89C6\u9891\uFF0C\u518D\u91CD\u65B0\u8F7D\u5165\u3002"));
      const operation = { reserved: reservation, signal, controller: new AbortController(), reader: null, url: null, complete: false, released: false, cancel: null };
      operation.cancel = () => cancel(operation);
      used += reservation;
      operations.add(operation);
      signal?.addEventListener?.("abort", operation.cancel, { once: true });
      if (signal?.aborted) operation.cancel();
      const check = () => {
        if (operation.controller.signal.aborted || signal?.aborted || disposed) throw abortFailure();
      };
      const promise = (async () => {
        const parts = [];
        let response, total = 0, lastAt = -Infinity, lastPercent = -1, declared = expected;
        const progress = (complete = false) => {
          const percent = declared !== null && declared > 0 ? Math.min(100, Math.floor(total / declared * 100)) : null, at = now();
          if (!complete && at - lastAt < 100 && (percent === null || percent <= lastPercent)) return;
          lastAt = at;
          if (percent !== null) lastPercent = percent;
          try {
            onProgress?.({ loaded: total, total: declared, percent });
          } catch {
          }
        };
        try {
          check();
          response = await fetcher(address.href, { signal: operation.controller.signal, credentials: "same-origin", cache: "no-store", redirect: "error" });
          check();
          if (!response.ok) throw failure3(response.status === 412 ? "changed" : response.status === 413 ? "too-large" : "unavailable", "\u89C6\u9891\u8BFB\u53D6\u5931\u8D25\uFF08" + response.status + "\uFF09\u3002");
          const mediaType = (response.headers.get("content-type") || "application/octet-stream").split(";")[0].trim().toLowerCase();
          if (!MIME_TYPES.has(mediaType)) throw failure3("unavailable", "\u89C6\u9891\u54CD\u5E94\u683C\u5F0F\u4E0D\u6B63\u786E\u3002");
          const range = response.headers.get("content-range");
          const length = response.headers.get("content-length");
          let responseSize = null;
          if (response.status === 206) {
            const match = range?.match(/^bytes (\d+)-(\d+)\/(\d+)$/i);
            if (!match || Number(match[1]) !== 0 || Number(match[2]) + 1 !== Number(match[3])) throw failure3("unavailable", "\u89C6\u9891\u54CD\u5E94\u4E0D\u5B8C\u6574\u3002");
            responseSize = Number(match[3]);
          } else if (length !== null && /^\d+$/.test(length)) responseSize = Number(length);
          if (responseSize !== null && (!Number.isSafeInteger(responseSize) || responseSize > limit)) throw failure3("too-large", "\u89C6\u9891\u8D85\u8FC7\u684C\u9762\u9884\u89C8\u5927\u5C0F\u4E0A\u9650\u3002");
          if (expected !== null && responseSize !== null && expected !== responseSize) throw failure3("changed", "\u89C6\u9891\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u8F7D\u5165\u3002");
          if (declared === null && responseSize !== null) declared = responseSize;
          if (typeof response.body?.getReader !== "function") throw failure3("unavailable", "\u89C6\u9891\u6570\u636E\u6D41\u4E0D\u53EF\u7528\u3002");
          operation.reader = response.body.getReader();
          progress();
          for (; ; ) {
            const chunk = await operation.reader.read();
            check();
            if (chunk.done) break;
            const value = chunk.value;
            if (!ArrayBuffer.isView(value) || typeof value.byteLength !== "number") throw failure3("unavailable", "\u89C6\u9891\u6570\u636E\u65E0\u6548\u3002");
            const next = total + value.byteLength;
            if (next > limit) throw failure3("too-large", "\u89C6\u9891\u8D85\u8FC7\u684C\u9762\u9884\u89C8\u5927\u5C0F\u4E0A\u9650\u3002");
            if (declared !== null && next > declared) throw failure3("changed", "\u89C6\u9891\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u8F7D\u5165\u3002");
            if (next > operation.reserved) {
              const extra = next - operation.reserved;
              if (used + extra > limit) throw failure3("busy", "\u8BF7\u5148\u5173\u95ED\u5176\u4ED6\u89C6\u9891\uFF0C\u518D\u91CD\u65B0\u8F7D\u5165\u3002");
              used += extra;
              operation.reserved = next;
            }
            total = next;
            parts.push(value);
            progress();
            check();
          }
          if (total === 0 || declared !== null && total !== declared) throw failure3("changed", "\u89C6\u9891\u6570\u636E\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u65B0\u8F7D\u5165\u3002");
          check();
          const blob = new BlobClass(parts, { type: mediaType });
          if (blob.size !== total) throw failure3("changed", "\u89C6\u9891\u6570\u636E\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u65B0\u8F7D\u5165\u3002");
          operation.url = urlApi.createObjectURL(blob);
          check();
          operation.complete = true;
          used -= operation.reserved - total;
          operation.reserved = total;
          progress(true);
          check();
          return Object.freeze({ url: operation.url, bytes: total, mediaType });
        } catch (error) {
          if (operation.controller.signal.aborted || signal?.aborted || disposed) throw abortFailure();
          if (error?.name === "DesktopVideoSourceError") throw error;
          throw failure3("unavailable", "\u89C6\u9891\u8BFB\u53D6\u5931\u8D25\u3002", error);
        } finally {
          parts.length = 0;
          if (!operation.complete || operation.controller.signal.aborted || disposed) {
            operation.controller.abort();
            try {
              await (operation.reader ? operation.reader.cancel() : response?.body?.cancel());
            } catch {
            }
            release(operation);
          }
          try {
            operation.reader?.releaseLock();
          } catch {
          }
          operation.reader = null;
        }
      })();
      promise.catch(() => {
      });
      return { promise, dispose: operation.cancel };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const operation of [...operations]) cancel(operation);
    }
  };
}

// video-preview.js
var VIDEO_PREVIEW_ID = "@local/chatgpt-rail/video";
var SLOT = "sidebar.right.tab.document";
var NS = "chatgptRailVideo";
var EXTENSIONS = Object.freeze(["mp4", "m4v", "mov", "webm"]);
var h9 = import_react9.default.createElement;
var copy = {
  zh: { title: "\u89C6\u9891", player: "\u89C6\u9891\u9884\u89C8\uFF1A{name}", loading: "\u6B63\u5728\u8BFB\u53D6\u89C6\u9891\u2026", progress: "\u6B63\u5728\u8F7D\u5165\u89C6\u9891 {percent}%", hidden: "\u89C6\u9891\u5DF2\u6682\u505C\u3002", unavailable: "\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6\u89C6\u9891\u3002", failed: "\u6682\u65F6\u65E0\u6CD5\u64AD\u653E\u6B64\u89C6\u9891\u3002", decode: "\u65E0\u6CD5\u64AD\u653E\u6B64\u89C6\u9891\uFF0C\u53EF\u80FD\u662F\u4E0D\u652F\u6301\u7684\u7F16\u7801\u3002", "too-large": "\u89C6\u9891\u8D85\u8FC7\u684C\u9762\u9884\u89C8\u4E0A\u9650\uFF08256 MiB\uFF09\u3002", busy: "\u8BF7\u5148\u5173\u95ED\u5176\u4ED6\u89C6\u9891\uFF0C\u518D\u91CD\u65B0\u8F7D\u5165\u3002", changed: "\u89C6\u9891\u5DF2\u53D8\u5316\u6216\u6570\u636E\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u65B0\u8F7D\u5165\u3002", external: "\u53EF\u4F7F\u7528\u9876\u90E8\u7684\u6253\u5F00\u65B9\u5F0F\uFF0C\u5728\u7CFB\u7EDF\u5E94\u7528\u4E2D\u6253\u5F00\u3002", retry: "\u91CD\u65B0\u8F7D\u5165" },
  en: { title: "Video", player: "Video preview: {name}", loading: "Loading video\u2026", progress: "Loading video {percent}%", hidden: "Video paused.", unavailable: "This video is unavailable.", failed: "This video could not be played.", decode: "This video may use an unsupported encoding.", "too-large": "This video exceeds the desktop preview limit (256 MiB).", busy: "Close another video, then reload.", changed: "This video changed or is incomplete. Reload it to continue.", external: "Use the opening options above to open it in a system application.", retry: "Reload" }
};
var fallbackT = (key, values = {}) => Object.entries(values).reduce((text4, [name, value]) => text4.replaceAll("{" + name + "}", String(value)), copy.zh[key] || key);
function videoMediaUrl(base, path, version) {
  if (typeof base !== "string" || typeof path !== "string" || !path || /[\u0000-\u001f\u007f]/u.test(path) || /^[/\\]{2}/u.test(path) || !(/^[A-Za-z]:[/\\]/u.test(path) || path.startsWith("/"))) return null;
  try {
    const application = new URL(base);
    if (application.username || application.password || !(["http:", "https:"].includes(application.protocol) || application.protocol === "dsh-app:" && application.hostname === "app")) return null;
    const url = new URL("api/chatgpt-rail/media", application);
    url.searchParams.set("path", path);
    if (application.protocol === "dsh-app:") url.searchParams.set("stream", "1");
    if (typeof version === "string" && version) url.searchParams.set("version", version);
    return url.href;
  } catch {
    return null;
  }
}
function createVideoProgress() {
  const records = /* @__PURE__ */ new Map();
  let disposed = false;
  function record(signal) {
    if (disposed || !signal || signal.aborted || typeof signal.addEventListener !== "function") return null;
    let held = records.get(signal);
    if (!held) {
      const release = () => {
        signal.removeEventListener("abort", release);
        records.delete(signal);
      };
      held = { address: null, version: null, time: 0, release };
      records.set(signal, held);
      signal.addEventListener("abort", release, { once: true });
    }
    return held;
  }
  return {
    position(signal, address, version) {
      const held = record(signal);
      return held?.address === address && held.version === version ? held.time : 0;
    },
    remember(signal, address, version, time3) {
      if (!Number.isFinite(time3) || time3 < 0) return;
      const held = record(signal);
      if (held) Object.assign(held, { address, version, time: time3 });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const held of [...records.values()]) held.release();
      records.clear();
    }
  };
}
function metadataOf(snapshot2) {
  if (snapshot2?.status) return snapshot2;
  if (snapshot2?.ok === true) return { status: "live", value: snapshot2.value };
  if (snapshot2?.ok === false) return { status: "failed", failure: snapshot2.error };
  return { status: "none" };
}
var frameStyle = { position: "relative", display: "flex", flex: "1 1 auto", flexDirection: "column", minHeight: 0, height: "100%", width: "100%", background: "#111", whiteSpace: "normal", fontFamily: "var(--dsw-font-family,system-ui)", fontSize: 13 };
var noticeStyle = { display: "flex", flex: "1 1 auto", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, minHeight: 120, padding: 24, color: "var(--dsw-alias-label-secondary,#888)", textAlign: "center", whiteSpace: "normal", lineHeight: 1.6 };
var retryStyle = { border: "1px solid var(--dsw-alias-border-l2,#ddd)", borderRadius: 7, padding: "5px 12px", background: "transparent", color: "inherit", font: "inherit", cursor: "pointer" };
function VideoPlayer({ src, version, address, request, tab, progress, t, name }) {
  const ref = import_react9.default.useRef(null), alive = import_react9.default.useRef(true), reported = import_react9.default.useRef(null);
  const [failure4, setFailure] = import_react9.default.useState(null), [ready, setReady] = import_react9.default.useState(false);
  const remember = import_react9.default.useCallback((element) => progress?.remember(tab.signal, address, version, element?.ended ? 0 : element?.currentTime), [progress, tab.signal, address, version]);
  import_react9.default.useEffect(() => {
    alive.current = true;
    const element = ref.current;
    let retired = false;
    const stop5 = () => {
      if (!element) return;
      remember(element);
      try {
        element.pause();
      } catch {
      }
    };
    const retire = () => {
      stop5();
      if (element && !retired) {
        retired = true;
        try {
          element.removeAttribute("src");
          element.load();
        } catch {
        }
      }
    };
    tab.signal?.addEventListener?.("abort", retire, { once: true });
    if (tab.signal?.aborted) retire();
    return () => {
      alive.current = false;
      tab.signal?.removeEventListener?.("abort", retire);
      retire();
    };
  }, [tab.signal, remember]);
  import_react9.default.useEffect(() => {
    if (!tab.visible) {
      const element = ref.current;
      remember(element);
      try {
        element?.pause();
      } catch {
      }
    }
  }, [tab.visible, remember]);
  function loaded(event) {
    if (!alive.current || tab.signal?.aborted || reported.current) return;
    const element = event.currentTarget;
    const position = progress?.position(tab.signal, address, version) || 0;
    if (position > 0) try {
      element.currentTime = Number.isFinite(element.duration) ? Math.min(position, Math.max(0, element.duration - 0.05)) : position;
    } catch {
    }
    if (!tab.visible) try {
      element.pause();
    } catch {
    }
    reported.current = "loaded";
    setReady(true);
    request.loaded?.(version);
  }
  function failed(event) {
    if (!alive.current || tab.signal?.aborted) return;
    remember(event.currentTarget);
    try {
      event.currentTarget?.pause();
    } catch {
    }
    const code = event.currentTarget?.error?.code;
    setFailure(code === 3 || code === 4 ? "decode" : "failed");
    if (reported.current !== "failed") {
      reported.current = "failed";
      request.failed?.();
    }
  }
  return h9(
    "div",
    { className: "cgpt-video-preview", "data-video-preview": failure4 ? "failed" : ready ? "ready" : "loading", style: frameStyle },
    h9("video", { key: src, ref, src, controls: true, preload: "metadata", playsInline: true, "aria-label": t("player", { name }), style: { display: failure4 ? "none" : "block", width: "100%", height: "100%", minHeight: 0, flex: "1 1 auto", objectFit: "contain", background: "#111" }, onLoadedMetadata: loaded, onError: failed, onTimeUpdate: (event) => remember(event.currentTarget), onPause: (event) => remember(event.currentTarget), onSeeked: (event) => remember(event.currentTarget), onEnded: () => progress?.remember(tab.signal, address, version, 0) }),
    !ready && !failure4 && h9("div", { role: "status", style: { ...noticeStyle, position: "absolute", inset: 0, pointerEvents: "none", color: "#ddd" } }, t("loading")),
    failure4 && h9("div", { role: "alert", style: noticeStyle }, h9("p", { style: { margin: 0 } }, t(failure4)), h9("p", { style: { margin: 0 } }, t("external")), h9("button", { type: "button", style: retryStyle, onClick: () => request.reload?.() }, t("retry")))
  );
}
function DesktopVideo({ src, bytes, desktopSources, request, tab, ...playerProps }) {
  const sourceKey = src + "\0" + bytes;
  const [state, setState] = import_react9.default.useState({ key: sourceKey, kind: "loading", percent: Number.isFinite(bytes) ? 0 : null });
  const shown = state.key === sourceKey ? state : { kind: "loading", percent: Number.isFinite(bytes) ? 0 : null };
  const requestRef = import_react9.default.useRef(request);
  requestRef.current = request;
  const { t } = playerProps;
  import_react9.default.useEffect(() => {
    let alive = true;
    setState({ key: sourceKey, kind: "loading", percent: Number.isFinite(bytes) ? 0 : null });
    const handle = desktopSources?.open(src, { bytes, signal: tab.signal, onProgress: (value) => {
      if (alive) setState({ key: sourceKey, kind: "loading", percent: value.percent });
    } });
    if (!handle) {
      setState({ key: sourceKey, kind: "failed", reason: "unavailable" });
      requestRef.current.failed?.();
      return;
    }
    handle.promise.then((source2) => {
      if (!alive || tab.signal?.aborted) {
        handle.dispose();
        return;
      }
      setState({ key: sourceKey, kind: "ready", url: source2.url });
    }, (error) => {
      if (!alive || tab.signal?.aborted) return;
      const reason = ["too-large", "busy", "changed"].includes(error?.code) ? error.code : "unavailable";
      setState({ key: sourceKey, kind: "failed", reason });
      requestRef.current.failed?.();
    });
    return () => {
      alive = false;
      handle.dispose();
    };
  }, [src, bytes, desktopSources, tab.signal]);
  if (shown.kind === "ready") return h9(VideoPlayer, { ...playerProps, src: shown.url, request, tab });
  return h9(
    "div",
    { className: "cgpt-video-preview", "data-video-preview": shown.kind === "failed" ? "failed" : "loading", style: frameStyle },
    shown.kind === "failed" ? h9("div", { role: "alert", style: noticeStyle }, h9("p", { style: { margin: 0 } }, t(shown.reason)), h9("p", { style: { margin: 0 } }, t("external")), h9("button", { type: "button", style: retryStyle, onClick: () => requestRef.current.reload?.() }, t("retry"))) : h9("div", { role: "status", style: noticeStyle }, t(shown.percent === null ? "loading" : "progress", { percent: shown.percent }))
  );
}
function VideoPreview({ resourceAddress, content, useResource, useTabInfo, progress, desktopSources, mediaUrl, t = fallbackT }) {
  const { tab } = useTabInfo();
  const metadata = metadataOf(useResource(resourceAddress)), request = content?.kind === "renderer" ? content : null;
  const path = metadata.value?.absolutePath, version = metadata.value?.version;
  const src = typeof path === "string" ? (mediaUrl || ((value, stamp) => videoMediaUrl(globalThis.document?.baseURI, value, stamp)))(path, version) : null;
  const pending = metadata.status === "loading";
  const unavailable = !pending && (metadata.status !== "live" || !src || tab.signal?.aborted);
  const report = import_react9.default.useRef(null);
  import_react9.default.useEffect(() => {
    if (!request || !unavailable || tab.signal?.aborted) return;
    const identity = resourceAddress + "\0" + request.revision;
    if (report.current === identity) return;
    report.current = identity;
    request.failed?.();
  }, [request, unavailable, resourceAddress, tab.signal]);
  if (!request) return null;
  if (pending) return h9("div", { role: "status", style: noticeStyle }, t("loading"));
  if (unavailable) return h9("div", { role: "alert", style: noticeStyle }, h9("p", { style: { margin: 0 } }, t("unavailable")), h9("button", { type: "button", style: retryStyle, onClick: () => request.reload?.() }, t("retry")));
  const name = path.replaceAll("\\", "/").split("/").pop() || tab.title || t("title");
  if (src.startsWith("dsh-app://")) {
    if (!tab.visible) return h9("div", { className: "cgpt-video-preview", "data-video-preview": "paused", role: "status", style: noticeStyle }, t("hidden"));
    return h9(DesktopVideo, { key: resourceAddress + "\0" + version + "\0" + request.revision, src, bytes: metadata.value?.bytes, desktopSources, version, address: resourceAddress, request, tab, progress, t, name });
  }
  return h9(VideoPlayer, { key: resourceAddress + "\0" + version + "\0" + request.revision, src, version, address: resourceAddress, request, tab, progress, t, name });
}
function installVideoPreview(ctx) {
  if (typeof ctx.inject !== "function" && typeof ctx.documentPreviews?.register !== "function") return () => {
  };
  ctx.effect(() => ctx.locale.register(NS, copy), "chatgpt-rail:video-locale");
  const install = (scope) => {
    const progress = createVideoProgress(), desktopSources = createDesktopVideoSourceManager();
    scope.effect(() => () => progress.dispose(), "chatgpt-rail:video-progress");
    scope.effect(() => () => desktopSources.dispose(), "chatgpt-rail:desktop-video-sources");
    scope.effect(() => scope.documentPreviews.register({ id: VIDEO_PREVIEW_ID, extensions: EXTENSIONS, binaryExtensions: EXTENSIONS, priority: "extension", title: () => scope.locale.bind(NS)("title"), loading: "renderer", wrap: false }), "chatgpt-rail:video-renderer");
    scope.effect(() => scope.slots.inject(SLOT, () => scope.slots.register({ name: SLOT, key: VIDEO_PREVIEW_ID, locale: NS, inject: () => ({ progress, desktopSources, mediaUrl: (path, version) => videoMediaUrl(globalThis.document?.baseURI, path, version) }) }, VideoPreview)), "chatgpt-rail:video-body");
  };
  return typeof ctx.inject === "function" ? ctx.inject(["documentPreviews"], install) : install(ctx);
}

// home.css
var home_default = ".cgpt-home{height:100%;min-height:0;box-sizing:border-box;display:flex;align-items:center;justify-content:center;padding:48px 28px 70px;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,inherit);overflow:auto}\n.cgpt-home *{box-sizing:border-box}.cgpt-home button,.cgpt-home input,.cgpt-home textarea{font-family:inherit}.cgpt-home button{cursor:pointer}.cgpt-home button:disabled{cursor:default;opacity:.45}.cgpt-home button:focus-visible,.cgpt-home input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4d6bfe);outline-offset:2px}\n.cgpt-home-stack{width:100%;max-width:var(--dsh-composer-card-max-width,800px);display:flex;flex-direction:column;gap:12px;margin:auto 0}.cgpt-home-headline{display:flex;align-items:center;justify-content:center;gap:10px;font-size:26px;line-height:34px;font-weight:500;margin-bottom:22px}.cgpt-preview{align-self:flex-start;margin-top:3px;padding:0 7px;font-size:11px;line-height:19px;border-radius:999px;background:var(--dsw-alias-state-business-tertiary,#edf1ff);color:var(--dsw-alias-label-primary-bluish,#53618b);border:.5px solid var(--dsw-alias-border-l1,#e7e9ef)}\n.cgpt-home-selectors{display:flex;align-items:center;gap:4px;padding-left:5px}.cgpt-home-card{position:relative;background:var(--dsw-specific-input-major,var(--dsw-alias-bg-base,#fff));border:1px solid var(--dsw-alias-border-l1,#e7e8ed);box-shadow:0 3px 16px #00000009;border-radius:24px;padding:10px 8px 6px;flex:none}.cgpt-home-input{display:block;width:100%;min-height:66px;max-height:220px;resize:none;border:0;background:transparent;color:var(--dsw-alias-label-primary);font-size:15px;line-height:24px;padding:4px 7px 8px;outline:none;overflow-y:auto}.cgpt-home-input::placeholder{color:var(--dsw-alias-label-caption,#a6aab3)}\n.cgpt-home-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 1px;min-height:34px;flex-wrap:wrap}.cgpt-toolbar-left,.cgpt-toolbar-right{display:flex;align-items:center;gap:5px;min-width:0}.cgpt-toolbar-right{margin-left:auto}.cgpt-menu-anchor{position:relative;display:inline-flex;min-width:0}.cgpt-control{display:inline-flex;align-items:center;gap:5px;min-height:28px;padding:3px 7px;color:var(--dsw-alias-label-secondary,#737985);font-size:13px;line-height:20px;border:0;background:transparent;border-radius:7px;white-space:nowrap;max-width:300px}.cgpt-control:hover,.cgpt-control[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover,#f2f3f6)}.cgpt-control-label{overflow:hidden;text-overflow:ellipsis}.cgpt-control-label:empty{display:none}.cgpt-control:has(.cgpt-control-label:empty)>svg:last-child{display:none}.cgpt-home-selectors .cgpt-control{color:var(--dsw-alias-label-primary);font-weight:500}.cgpt-send{display:grid;place-items:center;width:34px;height:34px;flex:none;border:0;border-radius:50%;background:var(--dsw-alias-button-info-fill,#4d6bfe);color:#fff}.cgpt-send:hover{background:var(--dsw-alias-button-info-hover,#3957ed)}\n.cgpt-menu{position:absolute;z-index:1100;top:calc(100% + 7px);left:0;width:max-content;min-width:210px;max-width:min(420px,80vw);max-height:330px;overflow-y:auto;background:var(--dsw-specific-menu,var(--dsw-alias-bg-overlay,#fff));color:var(--dsw-alias-label-primary);border:.5px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:12px;padding:5px;box-shadow:var(--dsw-elevation-prominent,0 8px 40px #0002);backdrop-filter:var(--dsw-menu-backdrop-filter,blur(14px))}.cgpt-menu[data-align=right]{left:auto;right:0}.cgpt-menu[data-above]{top:auto;bottom:calc(100% + 9px)}.cgpt-menu-wide{min-width:280px}.cgpt-menu-item{width:100%;min-height:34px;border:0;border-radius:7px;background:transparent;color:inherit;display:flex;align-items:center;justify-content:space-between;gap:15px;padding:6px 8px;text-align:left;font-size:13px;line-height:20px}.cgpt-menu-item:hover,.cgpt-menu-item:focus-visible{background:var(--dsw-alias-interactive-bg-hover,#f2f3f6);outline:none}.cgpt-menu-item-body{display:flex;flex-direction:column;min-width:0;overflow-wrap:anywhere}.cgpt-menu-item small{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary,#8b919b)}.cgpt-menu-divider{height:1px;margin:5px 3px;background:var(--dsw-alias-border-l1,#eee)}.cgpt-menu-section{font-size:11px;color:var(--dsw-alias-label-caption,#9299a4);padding:5px 8px}.cgpt-model-search{width:100%;border:0;border-bottom:1px solid var(--dsw-alias-border-l1,#eee);background:transparent;color:inherit;padding:7px 8px;font-size:12px;outline:none}.cgpt-menu-empty,.cgpt-menu-error{padding:8px;font-size:12px;line-height:18px}.cgpt-menu-error{color:var(--dsw-alias-state-error-primary,#b94545)}\n.cgpt-file-list{display:flex;gap:8px;flex-wrap:wrap;padding:3px 5px 10px}.cgpt-file{display:flex;align-items:center;gap:7px;max-width:240px;border:1px solid var(--dsw-alias-border-l1,#e7e8ed);border-radius:10px;padding:6px;background:var(--dsw-alias-bg-module-platform,#f8f9fb);font-size:12px;line-height:17px}.cgpt-file img{width:35px;height:35px;object-fit:cover;border-radius:5px}.cgpt-file>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px}.cgpt-file small{display:block;color:var(--dsw-alias-label-tertiary,#8b919b);font-size:10px}.cgpt-file button{display:grid;place-items:center;width:20px;height:20px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:50%}.cgpt-file button:hover{background:var(--dsw-alias-interactive-bg-hover)}\n.cgpt-home-notice{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8b919b);padding:0 12px;overflow-wrap:anywhere}.cgpt-home-notice[data-error=true]{color:var(--dsw-alias-state-error-primary,#b94545)}.cgpt-home-notice button{border:0;background:none;color:var(--dsw-alias-state-business-primary,#4d6bfe);font:inherit;padding:2px 5px}.cgpt-modal-backdrop{position:fixed;inset:0;z-index:1300;display:flex;align-items:center;justify-content:center;background:#0005;padding:24px}.cgpt-modal{width:420px;max-width:100%;background:var(--dsw-specific-menu,var(--dsw-alias-bg-overlay,#fff));border:1px solid var(--dsw-alias-border-l1,#eee);border-radius:18px;padding:22px;box-shadow:0 15px 60px #0003;font-size:14px;line-height:22px}.cgpt-modal h3{font-size:17px;font-weight:600;margin:0 0 12px}.cgpt-modal p{color:var(--dsw-alias-label-secondary);margin:0 0 16px}.cgpt-ack{display:flex;gap:8px;align-items:flex-start;font-size:13px}.cgpt-modal input:not([type=checkbox]){width:100%;padding:9px 12px;border:1px solid var(--dsw-alias-border-l1,#ddd);border-radius:9px;background:transparent;color:inherit;outline:none}.cgpt-modal-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}.cgpt-modal-actions button{padding:6px 13px;border:1px solid var(--dsw-alias-border-l1,#ddd);border-radius:8px;background:transparent;color:inherit;font-size:13px}.cgpt-modal-actions button:last-child{background:var(--dsw-alias-button-info-fill,#4d6bfe);color:#fff;border-color:transparent}.cgpt-home-native-voice{display:inline-flex;align-items:center}.cgpt-home-voice-unavailable>button{border:0;background:none;color:var(--dsw-alias-label-secondary);font-size:12px;padding:4px}.cgpt-home-control-error{font-size:11px;line-height:16px;max-width:220px;color:var(--dsw-alias-state-error-primary,#b94545)}\n@media(max-width:650px){.cgpt-home{padding:35px 15px}.cgpt-home-headline{font-size:23px}.cgpt-control{max-width:180px}.cgpt-home-toolbar{gap:6px}.cgpt-toolbar-left,.cgpt-toolbar-right{gap:2px}.cgpt-toolbar-right>.cgpt-menu-anchor>.cgpt-control{max-width:190px}}\n";

// rail.css
var rail_default = `/* Reference geometry: 52px icon rail + 340px conversation column. */
[data-cgpt-rail-column]{background:#f2f3f3!important;border-right:1px solid #e7e7e7!important}
[data-cgpt-rail]{--cgpt-rail-width:52px;position:relative!important;padding:48px 14px 8px 68px!important;background:transparent!important;isolation:isolate;font-size:14px!important}
[data-cgpt-rail]::before{content:"";position:absolute;z-index:-1;inset:44px 0 8px 52px;background:#fafafa;border-top-left-radius:15px;border-bottom-left-radius:15px;box-shadow:-2px 0 12px #00000003;pointer-events:none}
[data-cgpt-brand-row]{height:38px!important;min-height:38px!important;padding:0!important;margin:0 0 3px!important;gap:0!important;overflow:visible!important}
[data-cgpt-brand-row] [data-slot="sidebar.brand.mark"]{display:none!important}
[data-cgpt-brand-row] [data-slot="sidebar.brand.name"]{display:inline-flex!important;align-items:center;letter-spacing:0!important;font-size:18px!important;font-weight:600!important;line-height:24px!important}
[data-cgpt-brand-row] [data-slot="sidebar.brand.name"]>span{font-size:18px!important;letter-spacing:0!important}
[data-cgpt-top-strip]{position:absolute!important;left:52px;right:12px;top:2px;height:36px!important;min-height:0!important;margin:0!important;padding:0!important;background:transparent!important}
[data-cgpt-top-strip] button{width:28px!important;height:28px!important;color:#808487!important}
[data-cgpt-new-chat]{height:30px!important;min-height:30px!important;margin:0 0 17px!important;padding:4px 8px!important;border:0!important;border-radius:7px!important;background:transparent!important;justify-content:flex-start!important;box-shadow:none!important;font-size:14px!important;font-weight:400!important;overflow:visible!important}
/* The hidden shortcut still matches the Host's :has(+shortcut) hover rule.
   This compact label needs no fade now that the shortcut is not displayed. */
[data-cgpt-new-chat]>span:first-child{flex:initial!important;overflow:visible!important;mask-image:none!important;-webkit-mask-image:none!important}
[data-cgpt-new-chat]>span:first-child>span{width:auto!important;justify-content:flex-start!important;gap:9px!important}
[data-cgpt-new-chat] svg{width:15px!important;height:15px!important}
[data-cgpt-new-chat] svg{visibility:hidden!important}
[data-cgpt-new-chat]::before{content:"";position:absolute;left:8px;top:7px;width:16px;height:16px;background:currentColor;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M8 3.5H4a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 4 17.5h11a1.5 1.5 0 0 0 1.5-1.5v-4M8 12l.7-3.1L15.5 2l2.5 2.5-6.9 6.8L8 12Z'/%3E%3C/svg%3E") center/16px no-repeat;pointer-events:none}
[data-cgpt-new-chat]>span+span{display:none!important}
[data-cgpt-new-chat]:hover{background:#eceeee!important}
[data-cgpt-new-label]{font-size:0!important}
[data-cgpt-new-label]::after{content:attr(data-cgpt-new-label);font-size:14px;line-height:20px}
[data-cgpt-rail-nav]{position:absolute!important;left:7px!important;top:52px!important;width:38px!important;display:flex!important;flex-direction:column!important;align-items:center!important;gap:8px!important;margin:0!important;padding:0!important;overflow:visible!important;z-index:5!important}
[data-cgpt-rail-nav] [data-cgpt-nav-hidden]{display:none!important}
[data-cgpt-nav-order="0"]{order:0}
[data-cgpt-nav-order="1"]{order:1}
[data-cgpt-nav-order="2"]{order:2}
[data-cgpt-nav-order="3"]{order:3}
[data-cgpt-nav-order="4"]{order:4}
[data-cgpt-nav-order="5"]{order:5}
[data-cgpt-nav-order="6"]{order:6}
[data-cgpt-rail-nav] [data-cgpt-nav-item="more"]{position:relative;margin-top:12px!important}
[data-cgpt-rail-nav] [data-cgpt-nav-item="more"]::before{content:"";position:absolute;left:1px;top:-8px;width:36px;height:1px;background:#e1e4e5;pointer-events:none}
[data-cgpt-rail-nav] button{position:relative!important;box-sizing:border-box!important;width:36px!important;height:36px!important;min-height:36px!important;margin:0!important;padding:0!important;justify-content:center!important;gap:0!important;border:0!important;border-radius:10px!important;background:transparent!important;color:#858a8d!important}
[data-cgpt-rail-nav] button:hover{background:#e9ebeb!important;color:#33383b!important}
[data-cgpt-rail-nav] button[aria-current="page"]{background:#e3e6e6!important;color:#222729!important}
[data-cgpt-rail-nav] button svg{width:19px!important;height:19px!important}
[data-cgpt-rail-nav] button>span+span{display:none!important}
[data-cgpt-rail-nav] button[data-cgpt-nav-button="plugins"] svg,[data-cgpt-rail-nav] button[data-cgpt-nav-button="schedules"] svg,[data-cgpt-rail-nav] button[data-cgpt-nav-button="more"] svg{visibility:hidden!important}
[data-cgpt-rail-nav] button:is([data-cgpt-nav-button="plugins"],[data-cgpt-nav-button="schedules"],[data-cgpt-nav-button="more"])::before{content:"";position:absolute;top:8px;left:8px;width:20px;height:20px;background:currentColor;mask:var(--cgpt-rail-icon) center/20px 20px no-repeat;-webkit-mask:var(--cgpt-rail-icon) center/20px 20px no-repeat;pointer-events:none}
[data-cgpt-rail-nav] button[data-cgpt-nav-button="home"]::before{display:none}
[data-cgpt-nav-button="schedules"]{--cgpt-rail-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='1.45' stroke-linecap='round'%3E%3Ccircle cx='10' cy='10' r='7.6'/%3E%3Cpath d='M10 5.5V10l-2.7 2'/%3E%3C/svg%3E")}
[data-cgpt-nav-button="more"]{--cgpt-rail-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='black'%3E%3Ccircle cx='4' cy='10' r='1.45'/%3E%3Ccircle cx='10' cy='10' r='1.45'/%3E%3Ccircle cx='16' cy='10' r='1.45'/%3E%3C/svg%3E")}
[data-cgpt-nav-button="plugins"]{--cgpt-rail-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14.5 17.1A8 8 0 1 1 18 10c0 3.6-3.3 4.8-5.5 2.5'/%3E%3Cpath d='m6.4 10.6 4.2-4.2 2.1 2.1a3 3 0 0 1-4.2 4.2ZM5 9.2l1.4 1.4M9.2 5l1.4 1.4'/%3E%3C/svg%3E")}
[data-cgpt-rail-nav] button::after{content:attr(aria-label);position:absolute;left:calc(100% + 10px);top:50%;transform:translateY(-50%);padding:4px 8px;border-radius:6px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary);font-size:12px;font-weight:400;line-height:16px;white-space:nowrap;box-shadow:0 4px 12px #0002;opacity:0;pointer-events:none;z-index:30}
[data-cgpt-rail-nav] button:hover::after,[data-cgpt-rail-nav] button:focus-visible::after{opacity:1}
[data-cgpt-workspace-region]{position:static!important;min-height:0!important;margin:0!important;padding:0!important}
[data-cgpt-workspace-region] [data-slot="sidebar.workspaces"]>div{padding:0!important}
[data-cgpt-search-button]{position:absolute!important;top:53px!important;right:12px!important;width:28px!important;height:28px!important;margin:0!important;z-index:3!important;color:#898e91!important}
[data-cgpt-search-button] svg{width:16px!important;height:16px!important}
[data-cgpt-settings-row]{position:static!important}
[data-cgpt-account-seat]{display:block!important;position:absolute!important;left:9px!important;bottom:10px!important;width:34px!important;z-index:6!important}
[data-cgpt-account-seat] button[aria-haspopup="menu"]{box-sizing:border-box!important;width:34px!important;height:34px!important;min-height:34px!important;max-width:34px!important;justify-content:center!important;gap:0!important;padding:3px!important;border-radius:50%!important;background:transparent!important}
[data-cgpt-account-seat] button[aria-haspopup="menu"]>span:not([data-avatar-status]){display:none!important}
[data-cgpt-account-seat] [data-avatar-status]{width:26px!important;height:26px!important;border-radius:50%!important;flex:none!important}
[data-cgpt-footer-seat]{display:block!important;position:absolute!important;left:9px!important;bottom:53px!important;width:34px!important;z-index:6!important}
[data-cgpt-footer-seat] button{width:34px!important;height:34px!important;padding:6px!important;border-radius:50%!important;color:#81878b!important}
[data-cgpt-footer-seat] button>span+span{display:none!important}
html[data-ds-dark-theme] [data-cgpt-rail-column],[data-ds-dark-theme] [data-cgpt-rail-column]{background:#252728!important;border-color:#36393b!important}
html[data-ds-dark-theme] [data-cgpt-rail]::before,[data-ds-dark-theme] [data-cgpt-rail]::before{background:#202223}
[data-ds-dark-theme] [data-cgpt-rail-nav] button{color:#949b9f!important}
[data-ds-dark-theme] [data-cgpt-rail-nav] button:hover{background:#303436!important;color:#e6e9eb!important}
[data-ds-dark-theme] [data-cgpt-rail-nav] button[aria-current="page"]{background:#363b3d!important;color:#f0f2f3!important}
[data-ds-dark-theme] [data-cgpt-rail-nav] [data-cgpt-nav-item="more"]::before{background:#3c4245}

[data-ds-dark-theme] [data-cgpt-new-chat]:hover{background:#303638!important}

/* Collapse the conversation column only; keep the original navigation and
   account controls in a real 52px grid track, including during host fades. */
[data-cgpt-rail-frame]{grid-template-columns:var(--cgpt-rail-columns)!important}
[data-cgpt-rail-frame][data-sidebar-drawer][data-sidebar-collapsed] [data-cgpt-rail]{box-sizing:border-box!important;width:52px!important;min-width:52px!important;padding:0!important}
[data-cgpt-rail-frame][data-sidebar-drawer][data-sidebar-collapsed] [data-cgpt-rail]::before{display:none}
[data-cgpt-rail-frame][data-sidebar-drawer][data-sidebar-collapsed] [data-cgpt-workspace-region],
[data-cgpt-rail-frame][data-sidebar-drawer][data-sidebar-collapsed] [data-cgpt-new-chat]{display:none!important}
/* Keep text at its final width while the native column clips it. Animating
   the inner width as well reflows the list and makes opening lag the frame. */
[data-cgpt-rail-frame]:not([data-sidebar-drawer]) [data-cgpt-rail]{width:var(--cgpt-rail-content-width,392px)!important;min-width:var(--cgpt-rail-content-width,392px)!important;transition:none!important}
[data-cgpt-rail-frame]:not([data-sidebar-drawer])[data-sidebar-collapsed] :is([data-cgpt-workspace-region],[data-cgpt-new-chat]){pointer-events:none;visibility:hidden;transition:opacity .15s var(--ds-ease-in-out),visibility 0s linear .15s}
@media(prefers-reduced-motion:reduce){[data-cgpt-rail-frame]:not([data-sidebar-drawer])[data-sidebar-collapsed] :is([data-cgpt-workspace-region],[data-cgpt-new-chat]){transition:none!important}}
[data-cgpt-rail-frame][data-sidebar-collapsed] [data-cgpt-brand-row],
[data-cgpt-rail-frame][data-sidebar-collapsed] [data-cgpt-top-strip]{visibility:hidden!important}
[data-cgpt-rail-frame][data-sidebar-collapsed] [data-cgpt-rail-toggle]{visibility:visible!important;position:absolute!important;top:10px!important;left:12px!important;width:28px!important;height:28px!important}
[data-cgpt-rail-frame][data-sidebar-collapsed]:has([data-shell-leading]) [data-cgpt-rail-toggle]{display:none!important}
[data-cgpt-rail-frame][data-sidebar-collapsed] [data-cgpt-rail-nav],
[data-cgpt-rail-frame][data-sidebar-collapsed] [data-cgpt-foot-area]{display:flex!important;opacity:1!important;animation:none!important;transition:none!important;visibility:visible!important}
[data-cgpt-rail-frame] [data-cgpt-rail-nav] button,
[data-cgpt-rail-frame] [data-cgpt-footer-seat],
[data-cgpt-rail-frame] [data-cgpt-settings-row]{animation:none!important}

/* One window surface: the native title controls stay at their original
   coordinates, above a continuous sheet that starts below the 44px chrome. */
html[data-platform="darwin"] [data-cgpt-window-frame]{--cgpt-window-chrome-height:44px;--dsh-frame-top-clearance:44px;--cgpt-window-chrome:#f2f3f3;--cgpt-window-sheet:var(--dsw-alias-bg-base,#fff);background:var(--cgpt-window-chrome)!important}
.cgpt-window-drag-strip{display:none}
html[data-platform="darwin"] [data-cgpt-window-frame]>.cgpt-window-drag-strip{display:block;position:absolute;inset:0 0 auto;height:44px;z-index:0;pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-app-region:drag}
html[data-platform="darwin"] [data-cgpt-window-frame]>[data-side="sidebar"],
html[data-platform="darwin"] [data-cgpt-window-frame]>[data-side="rightbar"]{-webkit-app-region:no-drag}
html[data-platform="darwin"] [data-cgpt-rail-column]{border-right:0!important}
html[data-platform="darwin"] [data-cgpt-window-center]{position:relative!important;isolation:isolate;background:transparent!important;border-left:0!important}
html[data-platform="darwin"] [data-cgpt-window-center]::before{content:"";position:absolute;inset:44px 8px 8px 0;border-radius:0 15px 15px 0;background:var(--cgpt-window-sheet);z-index:-1;pointer-events:none;transition:right var(--ds-transition-duration-slow) var(--ds-ease-in-out),border-top-right-radius var(--ds-transition-duration-slow) var(--ds-ease-in-out),border-bottom-right-radius var(--ds-transition-duration-slow) var(--ds-ease-in-out)}
/* Paint the frame divider above opaque page headers and sticky composers;
   keep it below menus and outside hit testing. Its bounds never scroll. */
html[data-platform="darwin"] [data-cgpt-window-center]::after{content:"";position:absolute;z-index:10;left:0;top:44px;bottom:8px;width:1px;background:#e7e7e7;pointer-events:none}
html[data-platform="darwin"] [data-cgpt-window-frame][data-sidebar-collapsed] [data-cgpt-window-center]::before{border-top-left-radius:15px;border-bottom-left-radius:15px}
html[data-platform="darwin"] [data-cgpt-window-frame][data-sidebar-collapsed] [data-cgpt-window-center]::after{display:none}
html[data-platform="darwin"] [data-cgpt-window-center] :has(> [data-slot="conversation.header"]),
html[data-platform="darwin"] [data-cgpt-window-center] [data-slot="conversation.header"]>header{background:transparent!important}
/* Native chrome used 10px top padding plus a 30px title row (center 25px).
   Share the frame's 44px row with the global control (center 22px), while
   preserving the native view-tabs start at 50px: 44px + 6px. */
html[data-platform="darwin"] [data-cgpt-window-frame] [data-slot="conversation.header"]>header{grid-template-rows:var(--cgpt-window-chrome-height,44px) auto;padding-block:0!important}
html[data-platform="darwin"] [data-cgpt-window-frame] [data-slot="conversation.header"] :has(>[data-conversation-tabs]){margin-top:6px!important}
/* The native task page paints an opaque full-height surface; let it share
   the same window chrome and rounded sheet as Home and Plugins. */
html[data-platform="darwin"] [data-cgpt-window-center] [data-testid="task-manager-page"],
html[data-platform="darwin"] [data-cgpt-window-center] [data-testid="task-manager-page"]>aside[aria-label]{background:transparent!important}
html[data-platform="darwin"] [data-cgpt-window-frame]:not([data-rightbar-collapsed]) [data-cgpt-window-center]::before{right:0;border-top-right-radius:0;border-bottom-right-radius:0}
html[data-platform="darwin"] [data-cgpt-window-frame] [data-rightbar-col]{background:var(--cgpt-window-chrome)!important}
/* Keep geometry constant while native Dockkit children slide out. A background
   on this fixed parent would cover the conversation even after collapse. */
html[data-platform="darwin"] [data-cgpt-window-frame] [data-sidebar-right-panel]{box-sizing:border-box;padding:0 8px 8px 0}
html[data-platform="darwin"] [data-cgpt-window-frame] [data-sidebar-right-panel] [data-dockkit-host="dock"]>section[data-dockkit-content]{background:var(--cgpt-window-chrome)!important}
html[data-platform="darwin"] [data-cgpt-window-frame] [data-sidebar-right-panel] [data-dockkit-host="dock"]>section[data-dockkit-content]>div:has(>[data-dockkit-strip])+div{background:var(--cgpt-window-sheet)}
html[data-platform="darwin"] [data-cgpt-window-frame] [data-sidebar-right-panel] :not([data-dockkit-split])>[data-dockkit-host="dock"][data-dockkit-column="0"]>section[data-dockkit-content]>div:has(>[data-dockkit-strip])+div,
html[data-platform="darwin"] [data-cgpt-window-frame] [data-sidebar-right-panel] [data-dockkit-split]>[data-dockkit-host="dock"][data-dockkit-column="1"]>section[data-dockkit-content]>div:has(>[data-dockkit-strip])+div{border-radius:0 15px 15px 0}
html[data-platform="darwin"][data-ds-dark-theme] [data-cgpt-window-frame],
html[data-platform="darwin"] [data-ds-dark-theme] [data-cgpt-window-frame]{--cgpt-window-chrome:#252728}
html[data-platform="darwin"][data-ds-dark-theme] [data-cgpt-window-center]::after,
html[data-platform="darwin"] [data-ds-dark-theme] [data-cgpt-window-center]::after{background:#36393b}

/* Harness 0.2.2 gives every global page one persistent MainPanel wrapper.
   Constrain that real box: an opaque plugin page must not paint over chrome.
   Conversation has no data-global-panel and keeps its native title row.
   Older hosts keep the existing surface adapter above. */
html[data-platform="darwin"] [data-cgpt-window-frame]{
 --cgpt-window-edge:8px;
 --cgpt-window-radius:15px;
 --cgpt-window-sidebar:#fafafa;
 --cgpt-window-rule:var(--dsw-alias-border-l1,#e7e7e7);
}
html[data-platform="darwin"][data-ds-dark-theme] [data-cgpt-window-frame],
html[data-platform="darwin"] [data-ds-dark-theme] [data-cgpt-window-frame]{--cgpt-window-sidebar:#202223}
html[data-platform="darwin"] [data-cgpt-window-center]>[data-global-panel]{
 --dsh-frame-top-clearance:0px;
 box-sizing:border-box;
 min-width:0;
 min-height:0;
 margin:var(--cgpt-window-chrome-height) var(--cgpt-window-edge) var(--cgpt-window-edge) 0;
 /* The native narrow-window drawer otherwise adds a second 48px clearance. */
 padding-top:0!important;
 border-radius:0 var(--cgpt-window-radius) var(--cgpt-window-radius) 0;
 background:var(--cgpt-window-sheet);
 color:var(--dsw-alias-label-primary);
 overflow:hidden;
}
html[data-platform="darwin"] [data-cgpt-window-frame][data-sidebar-collapsed] [data-cgpt-window-center]>[data-global-panel]{
 border-top-left-radius:var(--cgpt-window-radius);
 border-bottom-left-radius:var(--cgpt-window-radius);
}
html[data-platform="darwin"] [data-cgpt-window-frame]:not([data-rightbar-collapsed]) [data-cgpt-window-center]>[data-global-panel]{
 margin-right:0;
 border-top-right-radius:0;
 border-bottom-right-radius:0;
}
/* The native conversation also needs a real bounded box. Its title stays at
   y=0; only the trailing/bottom edge shrink, so sticky input/footer surfaces
   cannot cover the shared gutter. The direct main slot identifies 0.2.2's box. */
html[data-platform="darwin"] [data-cgpt-window-center]>:not([data-global-panel]):has(>[data-slot="main"]){
 min-width:0;
 min-height:0;
 margin:0 var(--cgpt-window-edge) var(--cgpt-window-edge) 0;
 border-bottom-right-radius:var(--cgpt-window-radius);
 overflow:hidden;
}
html[data-platform="darwin"] [data-cgpt-window-frame][data-sidebar-collapsed] [data-cgpt-window-center]>:not([data-global-panel]):has(>[data-slot="main"]){
 border-bottom-left-radius:var(--cgpt-window-radius);
}
html[data-platform="darwin"] [data-cgpt-window-frame]:not([data-rightbar-collapsed]) [data-cgpt-window-center]>:not([data-global-panel]):has(>[data-slot="main"]){
 margin-right:0;
 border-bottom-right-radius:0;
}
/* Header group rectangles are not controls. Keep their gaps in the native
   drag region while the actual controls retain their own no-drag hit boxes. */
html[data-platform="darwin"] [data-cgpt-window-frame] [data-slot="conversation.header"] :is(
 :has(>[data-slot="conversation.session.header.actions"]),
 :has(>[data-slot="conversation.session.header.utilities"]),
 [data-conversation-header-leading],
 [data-conversation-header-corner]
){-webkit-app-region:drag!important}
html[data-platform="darwin"] [data-cgpt-window-frame] [data-slot="conversation.header"]>header{
 user-select:none;
 -webkit-user-select:none;
}
html[data-platform="darwin"] [data-cgpt-window-frame] [data-slot="conversation.header"] :is(button,a,input,textarea,select,[role="button"],[role="tab"],[tabindex],[contenteditable="true"]){
 -webkit-app-region:no-drag!important;
}
html[data-platform="darwin"] [data-cgpt-window-frame] [data-slot="conversation.header"] :is(input,textarea,[contenteditable="true"]){
 user-select:text;
 -webkit-user-select:text;
}
/* The title's native context-menu trigger follows the visible label rather
   than its old 8px horizontal padding; preserve its keyboard/context actions. */
html[data-platform="darwin"] [data-cgpt-window-frame] [data-slot="conversation.header"] nav[aria-label]>span[tabindex]>:is(span,button){
 padding-inline:0;
}
/* Scrolled-out controls can still subtract their unclipped rectangles from
   Electron's native title-bar region. The conversation scrollport never owns
   window dragging: reset its entire subtree to the initial, unregistered
   region instead of letting buttons/images inherit a no-drag rectangle.
   Keep the sibling header and body-portaled menus on the Host's drag rules. */
html[data-platform="darwin"] [data-cgpt-window-center] [data-conversation-scroll],
html[data-platform="darwin"] [data-cgpt-window-center] [data-conversation-scroll] *{
 -webkit-app-region:initial!important;
}
/* dsh-chat owns its controls and semantic status colors. Map only its neutral
   surface tokens to the same theme; never style arbitrary third-party nodes. */
html[data-platform="darwin"] [data-cgpt-window-center]>[data-global-panel] .dc-app{
 --dc-canvas:var(--cgpt-window-sheet);
 --dc-panel:var(--cgpt-window-sheet);
 --dc-side:var(--cgpt-window-sidebar);
 --dc-side-hover:var(--dsw-alias-interactive-bg-hover);
 --dc-side-active:var(--dsw-alias-interactive-bg-active,var(--dsw-alias-interactive-bg-hover));
 --dc-well:var(--dsw-alias-interactive-bg-hover);
 --dc-text-1:var(--dsw-alias-label-primary);
 --dc-text-2:var(--dsw-alias-label-secondary);
 --dc-text-3:var(--dsw-alias-label-tertiary);
 --dc-line:var(--cgpt-window-rule);
 --dc-line-strong:var(--dsw-alias-border-l2);
 --dc-bubble-in:var(--cgpt-window-sheet);
 --dc-bubble-in-line:var(--cgpt-window-rule);
 --dc-chip-bg:var(--dsw-alias-interactive-bg-hover);
 --dc-chip-text:var(--dsw-alias-label-secondary);
 --dc-fp-chip-bg:var(--dsw-alias-interactive-bg-hover);
 --dc-file-icon-bg:var(--dsw-alias-interactive-bg-hover);
 --dc-file-icon-text:var(--dsw-alias-label-secondary);
 --dc-dot:transparent;
 font-family:inherit;
}
/* Context Insights supplies its own canvas token. Keep charts and cards intact. */
html[data-platform="darwin"] [data-cgpt-window-center]>[data-global-panel] .lc-ov-page{
 --lc-canvas:var(--cgpt-window-sheet);
}

/* One persistent window toolbar, independent of the selected main page. */
.cgpt-window-chrome-anchor{display:none}
.cgpt-window-chrome-seat{display:none}
html[data-platform="darwin"] [data-cgpt-window-frame]>.cgpt-window-chrome-seat{display:flex;position:absolute;top:8px;right:12px;width:28px;height:28px;z-index:70;pointer-events:auto;-webkit-app-region:no-drag}
.cgpt-window-toolbar{display:contents}
.cgpt-window-plus{box-sizing:border-box;display:flex;flex:none;align-items:center;justify-content:center;width:28px;height:28px;padding:4px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-tertiary,#858a8d);cursor:pointer;-webkit-app-region:no-drag}
.cgpt-window-plus svg{display:block;flex:none}
.cgpt-window-plus:hover,.cgpt-window-plus[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover,#e7e9e9);color:var(--dsw-alias-label-primary,#282d31)}
.cgpt-window-plus:disabled{cursor:wait}
.cgpt-window-plus[aria-haspopup="menu"]:disabled{opacity:.45}
.cgpt-window-plus:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#4d6bfe);outline-offset:1px}
.cgpt-window-plus-menu{min-width:250px;max-width:min(340px,calc(100vw - 24px))}
.cgpt-window-menu-plus{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;font-size:20px;line-height:16px;font-weight:300}
.cgpt-window-menu-context{margin:3px 8px 5px;padding-top:6px;border-top:1px solid var(--dsw-alias-border-l1,#e4e6e8);max-width:290px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary,#8c9094);font-size:11px;line-height:18px}
.cgpt-window-session-modal{width:min(440px,calc(100vw - 32px))}
.cgpt-window-session-search{box-sizing:border-box;width:100%;height:34px;padding:6px 10px;margin:2px 0 12px;border:1px solid var(--dsw-alias-border-l1,#e3e5e7);border-radius:7px;background:var(--dsw-alias-bg-base,#fff);color:inherit;font:inherit;font-size:13px}
.cgpt-window-session-list{list-style:none;max-height:330px;overflow:auto;margin:0;padding:0}
.cgpt-window-session-list button{display:flex;flex-direction:column;gap:3px;width:100%;padding:9px 10px;border:0;border-radius:7px;text-align:left;background:transparent;color:inherit;font:inherit;font-size:14px;cursor:pointer}
.cgpt-window-session-list button:hover{background:var(--dsw-alias-interactive-bg-hover,#eef0f1)}
.cgpt-window-session-list button span{max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.cgpt-window-session-list small,.cgpt-window-empty{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8c9094)}
.cgpt-window-empty{margin:8px 0}
.cgpt-window-secondary{padding:5px 12px;border:1px solid var(--dsw-alias-border-l1,#e3e5e7);border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer}
.cgpt-window-notice{position:fixed;right:20px;bottom:20px;z-index:10000;display:flex;align-items:center;gap:12px;max-width:min(420px,calc(100vw - 40px));padding:10px 12px;border:1px solid var(--dsw-alias-border-l1,#e3e5e7);border-radius:9px;background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-secondary,#6d747b);box-shadow:0 4px 16px #0002;font-size:13px;line-height:19px;-webkit-app-region:no-drag}
.cgpt-window-notice[data-error]{color:var(--dsw-alias-state-error-primary,#b94545)}
.cgpt-window-notice button{flex:none;padding:0;border:0;background:transparent;color:inherit;cursor:pointer;font-size:18px}
/* One stateful control owns the frame's far-right position. Native tab-strip
   add/fullscreen/split controls remain; only duplicate column toggles are hidden. */
html[data-platform="darwin"] [data-cgpt-window-frame] [data-slot="conversation.header"] [data-conversation-header-corner] [data-sidebar-right-expand],
html[data-platform="darwin"] [data-cgpt-window-frame] [data-sidebar-right-panel] [data-dockkit-strip-chrome] [data-sidebar-right-toggle]{display:none!important}
/* Reserve space for the global control without covering native actions. */
html[data-platform="darwin"] [data-cgpt-window-frame] [data-slot="conversation.header"]>header{padding-right:68px!important}
html[data-platform="darwin"] [data-cgpt-window-frame] [data-dockkit-strip]:has(>[data-dockkit-strip-chrome]){padding-inline-end:46px!important}
html[data-platform="darwin"] [data-cgpt-window-frame] [data-sidebar-right-panel] [data-dockkit-host="dock"] [data-dockkit-strip]{box-sizing:border-box;height:var(--cgpt-window-chrome-height,44px);padding-block:8px}
/* Keep the outer navigation available in the native complete tool view. */
html[data-platform="darwin"] [data-cgpt-window-frame] [data-sidebar-right-panel="fullscreen"]{max-width:calc(100vw - var(--cgpt-window-leading,52px))!important;--dsh-sidebar-width:calc(100vw - var(--cgpt-window-leading,52px))!important}
html[data-platform="darwin"] [data-cgpt-window-frame] [data-sidebar-right-panel="fullscreen"] [data-dockkit-host="dock"][data-dockkit-column="0"]{--dsh-dockkit-strip-inline-start:max(10px,calc(var(--dsh-frame-leading-clearance,88px) - var(--cgpt-window-leading,52px)))!important}
html[data-platform="darwin"] [data-cgpt-window-frame][data-sidebar-collapsed] [data-sidebar-right-panel="fullscreen"] [data-dockkit-host="dock"][data-dockkit-column="0"]>section[data-dockkit-content]>div:has(>[data-dockkit-strip])+div{border-top-left-radius:15px;border-bottom-left-radius:15px}
html[data-platform="darwin"] [data-cgpt-window-frame] [data-shell-leading]{z-index:71}
/* Arm the grid transition before the native flushSync mutation. The native
   data-animating flag can otherwise arrive after its new width was laid out. */
html[data-platform="darwin"] [data-cgpt-window-frame][data-cgpt-right-motion]:not([data-dragging]):not([data-rightbar-fullscreen]):not([data-rightbar-instant]){transition:grid-template-columns var(--ds-transition-duration-slow) var(--ds-ease-in-out)}
@media(prefers-reduced-motion:reduce){html[data-platform="darwin"] [data-cgpt-window-center]::before,html[data-platform="darwin"] [data-cgpt-window-frame][data-cgpt-right-motion]{transition:none!important}}

/* Pins are displayed only in the global section. The native workspace tree
   stays mounted and retains membership/order; the pin component owns its filter. */
.cgpt-pinned-seat{display:flex;flex-direction:column;flex:0 1 auto;min-height:0;max-height:45%}
.cgpt-pinned-seat:empty{display:none}
.cgpt-pinned-section{display:flex;flex-direction:column;min-height:0;padding:0 0 14px;color:var(--dsw-alias-label-primary)}
.cgpt-pinned-heading{flex:none;margin:0;padding:0 4px 9px;font-size:13px;font-weight:400;line-height:20px;color:var(--dsw-alias-label-tertiary,#8c9094)}
.cgpt-pinned-list{list-style:none;display:flex;flex-direction:column;min-height:0;overflow-y:auto;overscroll-behavior:contain;margin:0;padding:0}
.cgpt-pinned-row{display:flex;align-items:center;flex:none;height:32px;min-height:32px;margin:0;border-radius:7px}
.cgpt-pinned-row:hover,.cgpt-pinned-row:focus-within,.cgpt-pinned-row[data-active]{background:var(--dsw-alias-interactive-bg-hover,#e9ebeb)}
.cgpt-pinned-open{display:flex;align-items:center;gap:7px;flex:1;min-width:0;height:32px;padding:5px 8px 5px 4px;border:0;border-radius:7px;background:transparent;color:inherit;font:inherit;font-size:14px;line-height:22px;overflow:hidden;text-align:left;cursor:pointer}
.cgpt-pinned-title{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.cgpt-pinned-status{display:inline-flex;align-items:center;justify-content:center;flex:none;width:14px;height:16px}
.cgpt-pinned-spinner{box-sizing:border-box;width:12px;height:12px;border:1.5px solid var(--dsw-alias-label-tertiary,#8c9094);border-right-color:transparent;border-radius:50%;animation:cgpt-pinned-spin .8s linear infinite}
@keyframes cgpt-pinned-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.cgpt-pinned-spinner{animation:none}}
.cgpt-pinned-actions{display:flex;align-items:center;flex:none;gap:2px;margin-right:3px;opacity:0;pointer-events:none;transition:opacity .12s ease}
.cgpt-pinned-row:hover .cgpt-pinned-actions,.cgpt-pinned-row:has(:focus-visible) .cgpt-pinned-actions{opacity:1;pointer-events:auto}
.cgpt-pinned-actions button{position:relative;display:flex;align-items:center;justify-content:center;flex:none;width:24px;height:24px;margin:0;padding:4px;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary,#62676b);cursor:pointer}
.cgpt-pinned-actions button:hover{color:var(--dsw-alias-label-primary,#303538)}
.cgpt-pinned-actions button:disabled{cursor:wait;opacity:.4}
.cgpt-pinned-open:focus-visible,.cgpt-pinned-actions button:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,#4d6bfe);outline-offset:-2px}
.cgpt-pinned-error{flex:none;padding:4px;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary,#b94545)}
@media(hover:none) and (pointer:coarse){.cgpt-pinned-actions{opacity:1;pointer-events:auto}}
@media(prefers-reduced-motion:reduce){.cgpt-pinned-actions{transition:none}}

/* Original action components render in the native pointer-anchored menu. */
[data-cgpt-session-more]{display:none!important}
.cgpt-context-layer,[data-cgpt-context-seat]{display:contents}
.cgpt-context-anchor{position:fixed;width:1px;height:1px;padding:0;border:0;opacity:0;pointer-events:none}
[data-cgpt-workspace-region] [data-row-key^="session:"]:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,#4d6bfe);outline-offset:-2px}

.cgpt-rail-actions-seat,.cgpt-rail-action-buttons{display:contents}
.cgpt-rail-action-error{position:absolute;left:48px;top:0;width:max-content;max-width:280px;padding:7px 10px;border-radius:8px;background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-state-error-primary,#b94545);font-size:12px;line-height:18px;box-shadow:0 4px 18px #0002;z-index:40}
.cgpt-rail-overflow-error{padding:5px 10px;color:var(--dsw-alias-state-error-primary,#b94545);font-size:12px;line-height:18px}
@media(max-height:420px){[data-cgpt-rail-nav]{max-height:calc(100% - 142px);overflow-y:auto!important;scrollbar-width:none}[data-cgpt-rail-nav]::-webkit-scrollbar{display:none}}

/* Dock customization uses the Host menu/modal, with no permanent new icon. */
.cgpt-dock-ui{display:contents}
[data-cgpt-rail-nav] button[data-cgpt-dock-dragging]{opacity:.45;cursor:grabbing!important}
[data-cgpt-rail-nav] button[data-cgpt-dock-drop="before"]{box-shadow:0 -3px 0 -1px var(--dsw-focus-ring-color,#4d6bfe)!important}
[data-cgpt-rail-nav] button[data-cgpt-dock-drop="after"]{box-shadow:0 3px 0 -1px var(--dsw-focus-ring-color,#4d6bfe)!important}
.cgpt-dock-modal{width:min(460px,calc(100vw - 32px))}
.cgpt-dock-section-title{margin:12px 0 7px;font-size:13px;font-weight:600;color:var(--dsw-alias-label-secondary,#72777c)}
.cgpt-dock-list{list-style:none;margin:0;padding:0;border:1px solid var(--dsw-alias-border-l1,#e6e8ea);border-radius:10px;overflow:hidden}
.cgpt-dock-entry{display:flex;align-items:center;gap:12px;min-height:44px;padding:7px 12px;font-size:14px;color:var(--dsw-alias-label-primary,#25292d)}
.cgpt-dock-entry+.cgpt-dock-entry{border-top:1px solid var(--dsw-alias-border-l1,#e6e8ea)}
.cgpt-dock-entry-name{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.cgpt-dock-fixed,.cgpt-dock-hint{font-size:12px;color:var(--dsw-alias-label-tertiary,#8c9094)}
.cgpt-dock-row-actions{display:flex;align-items:center;gap:5px}
.cgpt-dock-entry button,.cgpt-dock-footer button{padding:4px 8px;border:1px solid var(--dsw-alias-border-l1,#e3e5e7);border-radius:6px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}
.cgpt-dock-entry button:hover,.cgpt-dock-footer button:hover{background:var(--dsw-alias-interactive-bg-hover,#f0f1f2)}
.cgpt-dock-entry button:disabled,.cgpt-dock-footer button:disabled{opacity:.35;cursor:default}
.cgpt-dock-optional{margin-top:16px;font-size:13px;color:var(--dsw-alias-label-secondary,#72777c)}
.cgpt-dock-optional summary{padding:4px 0 10px;cursor:pointer}
.cgpt-dock-hint{margin:14px 0 0;line-height:18px}
.cgpt-dock-footer{display:flex;align-items:center;justify-content:space-between;width:100%;gap:12px}
.cgpt-dock-footer button{font-size:13px;padding:6px 12px}
.cgpt-dock-footer .cgpt-dock-done{border-color:transparent;background:var(--dsw-alias-label-primary,#24282d);color:var(--dsw-alias-bg-base,#fff)}
.cgpt-dock-error{font-size:12px;color:var(--dsw-alias-state-error-primary,#b94545)}
.cgpt-dock-toast{position:fixed;bottom:24px;left:66px;z-index:10000;max-width:340px;padding:10px 12px;border-radius:9px;background:var(--dsw-alias-bg-overlay,#fff);box-shadow:0 4px 18px #0002;color:var(--dsw-alias-state-error-primary,#b94545);font-size:13px}
.cgpt-dock-toast button{margin-left:12px;border:0;background:transparent;color:inherit;cursor:pointer}

/* UA media controls consume their own pointer/keyboard events. Keep their native
   focus indication, but give it a quiet rounded treatment on the dark player. */
.cgpt-video-preview video:focus{outline-color:#8d97a5!important}
.cgpt-video-preview video::-webkit-media-controls-play-button{outline-color:#8d97a5!important;border-radius:999px!important}
.cgpt-video-preview video::-webkit-media-controls-timeline{outline-color:#8d97a5!important;border-radius:999px!important}
.cgpt-video-preview video::-webkit-media-controls-mute-button{outline-color:#8d97a5!important;border-radius:999px!important}
.cgpt-video-preview video::-webkit-media-controls-volume-slider{outline-color:#8d97a5!important;border-radius:999px!important}
.cgpt-video-preview video::-webkit-media-controls-fullscreen-button{outline-color:#8d97a5!important;border-radius:999px!important}

/* Shared leading navigation: Back, Forward, native sidebar toggle.
   Keep the Host's toggle nodes in place so shortcuts, tooltips and the drawer's
   autofocus/return-focus stay native. Only each small button is a no-drag box. */
.cgpt-window-navigation-seat{display:none}
.cgpt-window-navigation{display:contents}
html[data-platform="darwin"] [data-cgpt-window-frame]{--cgpt-window-navigation-left:88px}
html[data-platform="darwin"][data-fullscreen] [data-cgpt-window-frame]{--cgpt-window-navigation-left:12px}
html[data-platform="darwin"] [data-cgpt-window-frame]>.cgpt-window-navigation-seat{
 display:flex;
 position:absolute;
 top:8px;
 left:var(--cgpt-window-navigation-left);
 width:62px;
 height:28px;
 gap:6px;
 z-index:71;
 pointer-events:none;
 -webkit-app-region:initial;
}
.cgpt-window-navigation-button{
 box-sizing:border-box;
 display:flex;
 flex:none;
 align-items:center;
 justify-content:center;
 width:28px;
 height:28px;
 margin:0;
 padding:0;
 border:0;
 border-radius:6px;
 background:transparent;
 color:var(--dsw-alias-label-tertiary,#858a8d);
 cursor:pointer;
 pointer-events:auto;
 -webkit-app-region:no-drag;
}
.cgpt-window-navigation-button svg{display:block;width:16px;height:16px;flex:none}
.cgpt-window-navigation-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#e7e9e9);color:var(--dsw-alias-label-primary,#282d31)}
.cgpt-window-navigation-button:disabled{opacity:.35;cursor:default}
.cgpt-window-navigation-button:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#4d6bfe);outline-offset:1px}
html[data-platform="darwin"] [data-cgpt-window-frame] :is([data-sidebar-toggle],[data-cgpt-rail-toggle]){
 position:fixed!important;
 top:8px!important;
 left:calc(var(--cgpt-window-navigation-left) + 68px)!important;
 right:auto!important;
 width:28px!important;
 height:28px!important;
 min-width:28px!important;
 min-height:28px!important;
 margin:0!important;
 padding:0!important;
 transform:none!important;
 border-radius:6px!important;
 color:var(--dsw-alias-label-tertiary,#858a8d)!important;
 z-index:72;
 -webkit-app-region:no-drag!important;
}
html[data-platform="darwin"] [data-cgpt-window-frame] :is([data-sidebar-toggle],[data-cgpt-rail-toggle])>span[aria-hidden]{display:none!important}
html[data-platform="darwin"] [data-cgpt-window-frame] :is([data-sidebar-toggle],[data-cgpt-rail-toggle])>svg{display:block!important;visibility:visible!important;width:16px!important;height:16px!important}
html[data-platform="darwin"] [data-cgpt-window-frame]>[data-shell-leading]{
 top:8px!important;
 left:calc(var(--cgpt-window-navigation-left) + 68px)!important;
 width:28px;
 height:28px;
 -webkit-app-region:initial!important;
}
/* The hidden-sidebar seat also has a native New Session button. Home and the
   expanded sidebar retain chat entry; keep this title-bar group to three icons. */
html[data-platform="darwin"] [data-cgpt-window-frame] [data-shell-leading] :has(>[data-sidebar-opener])>button:not([data-sidebar-opener]){display:none!important}
html[data-platform="darwin"] [data-cgpt-window-frame] [data-sidebar-opener]{
 width:28px!important;
 height:28px!important;
 border-radius:6px!important;
 color:var(--dsw-alias-label-tertiary,#858a8d)!important;
 -webkit-app-region:no-drag!important;
}
html[data-platform="darwin"] [data-cgpt-window-frame] [data-sidebar-opener] svg{width:16px!important;height:16px!important}
html[data-platform="darwin"] [data-cgpt-window-frame]:is([data-sidebar-collapsed],[data-sidebar-drawer]){--dsh-frame-leading-clearance:192px}
html[data-platform="darwin"][data-fullscreen] [data-cgpt-window-frame]:is([data-sidebar-collapsed],[data-sidebar-drawer]){--dsh-frame-leading-clearance:116px}
/* An open narrow sidebar is a modal. Its own toggle stays inside the dialog;
   the arrow seat is also made inert by its owner for keyboard navigation. */
html[data-platform="darwin"] [data-cgpt-window-frame][data-sidebar-drawer]:not([data-sidebar-collapsed])>.cgpt-window-navigation-seat{opacity:.4;pointer-events:none}
html[data-platform="darwin"] [data-cgpt-window-frame][data-sidebar-drawer]:not([data-sidebar-collapsed])>.cgpt-window-navigation-seat button{pointer-events:none}
html[data-platform="darwin"] [data-cgpt-window-frame][data-sidebar-drawer]:not([data-sidebar-collapsed])>[data-shell-leading]{visibility:hidden}
`;

// global-search.css
var global_search_default = '.cgpt-global-search-modal{width:720px!important;max-width:calc(100vw - 40px)!important;padding:0!important;border-radius:18px!important;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,#fff))!important;color:var(--dsw-alias-label-primary,#202326);border:1px solid var(--dsw-alias-border-l1,#e5e7e8);box-shadow:0 20px 70px #0002,0 3px 12px #0000000d;overflow:hidden}\n.cgpt-global-search-modal-content{padding:0!important;min-height:0;overflow:hidden!important}\n.cgpt-global-search{display:flex;flex-direction:column;min-width:0;height:min(480px,calc(100dvh - 80px));max-height:calc(100dvh - 80px);font-family:var(--dsw-font-family,inherit);font-size:14px;line-height:20px;-webkit-app-region:no-drag}\n.cgpt-global-search-input-row{display:flex;align-items:center;gap:12px;flex:none;box-sizing:border-box;height:56px;padding:0 18px;color:var(--dsw-alias-label-tertiary,#8a8e93);border-bottom:1px solid var(--dsw-alias-border-l1,#e8e9eb)}\n.cgpt-global-search-input-row>svg{flex:none;width:19px;height:19px}\n.cgpt-global-search-input{width:100%;min-width:0;flex:1;border:0!important;outline:none!important;box-shadow:none!important;background:transparent!important;color:var(--dsw-alias-label-primary,#202326);padding:0!important;font:inherit;font-size:15px;line-height:24px}\n.cgpt-global-search-input::placeholder{color:var(--dsw-alias-label-tertiary,#8a8e93);opacity:1}\n.cgpt-global-search-close{flex:none;display:flex;align-items:center;justify-content:center;min-width:28px;height:24px;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#8a8e93);border-radius:5px;cursor:pointer;padding:0 3px}\n.cgpt-global-search-close:hover{background:var(--dsw-alias-interactive-bg-hover,#eceeef)}\n.cgpt-global-search kbd{font:inherit;font-size:11px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8a8e93)}\n.cgpt-global-search-results{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:6px 8px 8px;scroll-padding-block:6px}\n.cgpt-global-search-group+.cgpt-global-search-group{margin-top:6px}\n.cgpt-global-search-heading{padding:8px 10px 5px;color:var(--dsw-alias-label-tertiary,#8a8e93);font-size:12px;font-weight:500;line-height:18px}\n.cgpt-global-search-option{display:flex;align-items:center;box-sizing:border-box;gap:10px;min-height:36px;padding:7px 10px;border-radius:8px;cursor:pointer;outline:none;color:var(--dsw-alias-label-primary,#202326);user-select:none}\n.cgpt-global-search-option[aria-selected="true"]{background:var(--dsw-alias-interactive-bg-hover,#eceeef)}\n.cgpt-global-search-option[aria-disabled="true"]{cursor:wait}\n.cgpt-global-search-icon{display:flex;align-items:center;justify-content:center;flex:none;width:18px;height:20px;color:var(--dsw-alias-label-secondary,#697078)}\n.cgpt-global-search-copy{display:flex;flex-direction:column;min-width:0;flex:1;gap:2px}\n.cgpt-global-search-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:22px}\n.cgpt-global-search-snippet{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#697078)}\n.cgpt-global-search-option-snippet{min-height:54px}\n.cgpt-global-search-detail{flex:0 1 auto;max-width:28%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8a8e93)}\n.cgpt-global-search-shortcut{flex:none;margin-left:4px;white-space:nowrap}\n.cgpt-global-search-message{display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 10px;color:var(--dsw-alias-label-secondary,#697078);font-size:12px;line-height:18px;overflow-wrap:anywhere}\n.cgpt-global-search-error{justify-content:flex-start;color:var(--dsw-alias-state-danger-primary,#bd4242)}\n.cgpt-global-search-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:150px;padding:12px;color:var(--dsw-alias-label-tertiary,#8a8e93);text-align:center}\n.cgpt-global-search-empty>svg{width:24px;height:24px;opacity:.7}\n.cgpt-global-search-empty p{margin:12px 0 0;font-size:13px}\n.cgpt-global-search-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;min-height:44px;box-sizing:border-box;padding:7px 12px;border-top:1px solid var(--dsw-alias-border-l1,#e8e9eb)}\n.cgpt-global-search-categories{display:flex;align-items:center;gap:3px;min-width:0;flex-wrap:wrap}\n.cgpt-global-search-categories button{border:0;background:transparent;padding:4px 8px;border-radius:6px;font:inherit;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary,#697078);cursor:pointer;white-space:nowrap}\n.cgpt-global-search-categories button:hover,.cgpt-global-search-categories button[aria-pressed="true"]{background:var(--dsw-alias-interactive-bg-hover,#eceeef);color:var(--dsw-alias-label-primary,#202326)}\n.cgpt-global-search-categories button:focus-visible,.cgpt-global-search-close:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#4d6bfe);outline-offset:1px}\n.cgpt-global-search-hint{flex:none;white-space:nowrap;font-size:11px;color:var(--dsw-alias-label-tertiary,#8a8e93)}\n.cgpt-global-search-spinner{display:inline-block;flex:none;box-sizing:border-box;width:13px;height:13px;border:1.5px solid var(--dsw-alias-border-l2,#d3d6da);border-top-color:var(--dsw-alias-label-secondary,#697078);border-radius:50%;animation:cgpt-global-search-spin .7s linear infinite}\n.cgpt-global-search-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}\n@keyframes cgpt-global-search-spin{to{transform:rotate(360deg)}}\n@media(max-width:560px){.cgpt-global-search-hint{display:none}.cgpt-global-search-input-row{gap:9px;padding-inline:13px}.cgpt-global-search-footer{padding-inline:8px}.cgpt-global-search-detail{max-width:24%}.cgpt-global-search-categories button{padding-inline:7px}}\n@media(max-height:440px){.cgpt-global-search{height:calc(100dvh - 32px);max-height:calc(100dvh - 32px)}.cgpt-global-search-empty{min-height:70px}.cgpt-global-search-results{max-height:calc(100dvh - 140px)}}\n@media(prefers-reduced-motion:reduce){.cgpt-global-search-spinner{animation:none}}\n';

// app-dock.css
var app_dock_default = '[data-cgpt-rail-nav][data-cgpt-app-mode]>[data-cgpt-nav-item]:not([data-cgpt-nav-item="more"]){display:none!important}\n[data-cgpt-rail-nav][data-cgpt-app-mode][data-cgpt-app-native-more="false"]>[data-cgpt-nav-item="more"]{display:none!important}\n.cgpt-app-dock-seat{display:flex;flex:none;order:-100}\n.cgpt-app-dock{display:flex;flex-direction:column;align-items:center;width:38px;min-height:0;gap:8px;position:relative;-webkit-app-region:no-drag}\n.cgpt-app-dock-scroll{display:flex;flex-direction:column;align-items:center;gap:10px;max-height:calc(100dvh - 170px - var(--cgpt-app-extra-height,0px));min-height:0;overflow-y:auto;overflow-x:hidden;padding:0 1px;scrollbar-width:none;overscroll-behavior:contain}\n.cgpt-app-dock-scroll::-webkit-scrollbar{display:none}\n.cgpt-app-dock-group{display:flex;flex-direction:column;align-items:center;gap:8px}\n.cgpt-app-dock .cgpt-app-dock-button{position:relative!important;display:flex;align-items:center;justify-content:center;width:36px!important;height:36px!important;min-height:36px!important;border:0!important;border-radius:10px!important;padding:0!important;box-shadow:none!important;cursor:pointer}\n.cgpt-app-dock .cgpt-app-dock-button::before,.cgpt-app-dock .cgpt-app-dock-button::after,.cgpt-app-dock .cgpt-app-library-button::before,.cgpt-app-dock .cgpt-app-library-button::after{display:none!important}\n.cgpt-app-artwork{display:flex!important;flex:none;align-items:center;justify-content:center;box-sizing:border-box;width:24px;height:24px;color:inherit;user-select:none}\n.cgpt-app-artwork img{display:block;width:20px;height:20px;object-fit:contain;filter:grayscale(1);pointer-events:none}\n.cgpt-app-symbol{display:block;width:20px;height:20px;background:currentColor;mask-position:center;mask-size:contain;mask-repeat:no-repeat;-webkit-mask-position:center;-webkit-mask-size:contain;-webkit-mask-repeat:no-repeat;pointer-events:none}\n.cgpt-app-symbol img{opacity:0}\n.cgpt-app-dock .cgpt-app-artwork svg{display:block!important;visibility:visible!important;width:20px!important;height:20px!important;color:inherit!important}\n.cgpt-app-letter{font-size:17px;font-weight:500;line-height:1;letter-spacing:0}\n.cgpt-app-dock .cgpt-app-dock-button[data-app-pinned]:not([data-cgpt-app-button="home"]):not([aria-disabled="true"]){cursor:grab}\n.cgpt-app-dock .cgpt-app-dock-button[data-app-dragging]{opacity:.55;cursor:grabbing!important}\n/* A straight insertion line belongs in the gap, not around the rounded icon. */\n.cgpt-app-dock .cgpt-app-dock-button[data-app-drop]::after{content:"";display:block!important;position:absolute;left:6px;right:6px;width:auto;height:2px;padding:0;border:0;border-radius:1px;background:var(--dsw-alias-label-tertiary,#8a8e93);box-shadow:none;opacity:1;transform:none;pointer-events:none}\n.cgpt-app-dock .cgpt-app-dock-button[data-app-drop="before"]::after{top:-5px;bottom:auto}\n.cgpt-app-dock .cgpt-app-dock-button[data-app-drop="after"]::after{top:auto;bottom:-5px}\n.cgpt-app-dock .cgpt-app-dock-button,.cgpt-app-dock .cgpt-app-artwork{-webkit-user-drag:none;user-select:none;touch-action:none}\n.cgpt-app-dock .cgpt-app-current-dot{display:none!important}\n.cgpt-app-dock-divider{height:1px;min-height:1px;width:24px;background:var(--dsw-alias-border-l2,#cdd2d5);margin:1px 0}\n.cgpt-app-dock .cgpt-app-library-button{display:flex;align-items:center;justify-content:center;flex:none;width:36px!important;height:36px!important;min-height:36px!important;padding:0!important;border:0!important;border-radius:10px!important;cursor:pointer}\n.cgpt-app-dock .cgpt-app-library-button[aria-expanded="true"]{background:#e3e6e6!important;color:#222729!important}\n[data-ds-dark-theme] .cgpt-app-dock .cgpt-app-library-button[aria-expanded="true"]{background:#363b3d!important;color:#f0f2f3!important}\n.cgpt-app-dock .cgpt-app-library-button svg{visibility:visible!important;width:20px!important;height:20px!important}\n.cgpt-app-dock .cgpt-app-opening{display:block!important;position:absolute;inset:3px;border:1px solid transparent;border-top-color:currentColor;border-radius:50%;animation:cgpt-app-spin 800ms linear infinite;pointer-events:none}\n.cgpt-app-toast{position:fixed;bottom:24px;left:64px;max-width:280px;padding:12px 14px;background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary,#202326);border:1px solid var(--dsw-alias-border-l1,#dfe3e7);box-shadow:0 8px 28px #0002;border-radius:10px;z-index:50;font-size:12px;line-height:18px}\n.cgpt-app-dock .cgpt-app-toast button{width:auto!important;height:auto!important;min-height:0!important;background:transparent!important;color:inherit!important;text-decoration:underline;font:inherit;margin-left:8px!important;cursor:pointer}\n.cgpt-app-dock .cgpt-app-context-anchor{position:fixed!important;width:0!important;height:0!important;min-height:0!important;padding:0!important;border:0!important;pointer-events:none!important;opacity:0!important}\n.cgpt-app-library-modal{width:720px!important;max-width:calc(100vw - 40px)!important;padding:0!important;border-radius:20px!important;background:var(--dsw-alias-bg-layer-2,#fff)!important;color:var(--dsw-alias-label-primary,#202326);border:1px solid var(--dsw-alias-border-l1,#e5e7e8);box-shadow:0 20px 70px #0003;overflow:hidden}\n.cgpt-app-library-content{padding:0!important;min-height:0;overflow:hidden!important}\n.cgpt-app-library{display:flex;flex-direction:column;box-sizing:border-box;height:min(600px,calc(100dvh - 72px));min-height:0;font:14px/1.45 var(--dsw-font-family,system-ui,sans-serif);-webkit-app-region:no-drag}\n.cgpt-app-library-header{display:flex;align-items:flex-start;justify-content:space-between;padding:25px 28px 18px;gap:18px}\n.cgpt-app-library-header h2{margin:0;font-size:23px;font-weight:600;letter-spacing:-.4px;color:var(--dsw-alias-label-primary,#202326)}\n.cgpt-app-library-header p{margin:4px 0 0;color:var(--dsw-alias-label-tertiary,#8a8e93);font-size:12px}\n.cgpt-app-close{display:flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-tertiary,#8a8e93);cursor:pointer;padding:0}\n.cgpt-app-close:hover{background:var(--dsw-alias-interactive-bg-hover,#eceeef)}\n.cgpt-app-search{display:flex;align-items:center;gap:10px;flex:none;margin:0 28px 14px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1,#e2e5e8);border-radius:10px;background:var(--dsw-alias-bg-module-platform,#f6f7f8);color:var(--dsw-alias-label-tertiary,#8a8e93)}\n.cgpt-app-search input{border:0!important;outline:0!important;box-shadow:none!important;padding:0!important;background:transparent!important;color:var(--dsw-alias-label-primary,#202326);font:inherit;min-width:0;width:100%;line-height:22px}\n.cgpt-app-search input::placeholder{color:var(--dsw-alias-label-tertiary,#8a8e93);opacity:1}\n.cgpt-app-search:focus-within{border-color:var(--dsw-focus-ring-color,#4d6bfe)}\n.cgpt-app-filters{display:flex;gap:5px;flex:none;margin:0 28px 15px}\n.cgpt-app-filters button{font:inherit;font-size:12px;line-height:20px;padding:5px 11px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary,#68717b);cursor:pointer}\n.cgpt-app-filters button[aria-pressed="true"]{background:var(--dsw-alias-interactive-bg-hover,#e9ecef);color:var(--dsw-alias-label-primary,#202326);font-weight:500}\n.cgpt-app-library-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 22px 22px;scroll-padding-block:12px}\n.cgpt-app-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px 10px;padding:0;margin:0;list-style:none}\n.cgpt-app-card{display:flex;flex-direction:column;align-items:center;min-width:0;padding:10px 4px 8px;border:1px solid transparent;border-radius:14px;transition:background 130ms ease}\n.cgpt-app-card:hover{background:var(--dsw-alias-bg-module-platform,#f6f7f8)}\n.cgpt-app-card[data-app-active]{border-color:var(--dsw-alias-border-l1,#e4e7e9)}\n.cgpt-app-launch{display:flex;flex-direction:column;align-items:center;gap:7px;min-width:0;width:100%;padding:0 4px 7px;border:0;background:transparent;color:var(--dsw-alias-label-primary,#202326);font:inherit;cursor:pointer;border-radius:10px}\n.cgpt-app-library .cgpt-app-artwork{width:48px;height:48px;margin-bottom:2px;color:var(--dsw-alias-label-secondary,#68717b)}\n.cgpt-app-library .cgpt-app-artwork img,.cgpt-app-library .cgpt-app-artwork svg,.cgpt-app-library .cgpt-app-symbol{width:30px;height:30px}\n.cgpt-app-library .cgpt-app-letter{font-size:25px}\n.cgpt-app-label{display:block;max-width:100%;font-size:13px;font-weight:500;line-height:19px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.cgpt-app-status{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#8a8e93);margin-top:-4px}\n.cgpt-app-card[data-app-active] .cgpt-app-status{color:var(--dsw-alias-label-secondary,#68717b)}\n.cgpt-app-pin{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:24px;padding:2px 7px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary,#8a8e93);font:inherit;font-size:11px;cursor:pointer}\n.cgpt-app-pin:hover,.cgpt-app-pin[aria-pressed="true"]{background:var(--dsw-alias-interactive-bg-hover,#e9ecef);color:var(--dsw-alias-label-secondary,#68717b)}\n.cgpt-app-fixed-note{padding:4px 7px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#8a8e93)}\n.cgpt-app-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:170px;padding:15px;color:var(--dsw-alias-label-tertiary,#8a8e93);text-align:center}\n.cgpt-app-empty p{margin:15px 0 0;font-size:13px}\n.cgpt-app-error{margin:0 6px 14px;color:var(--dsw-alias-state-error-primary,#ba4747);font-size:12px;line-height:18px;overflow-wrap:anywhere}\n.cgpt-app-library-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;min-height:52px;box-sizing:border-box;padding:12px 28px;border-top:1px solid var(--dsw-alias-border-l1,#e5e7e8);color:var(--dsw-alias-label-tertiary,#8a8e93);font-size:12px}\n.cgpt-app-library-footer button{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#68717b);font:inherit;cursor:pointer;padding:4px 0}\n.cgpt-app-library button:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#4d6bfe);outline-offset:3px}\n/* Keep keyboard focus inside the narrow scrollport so it cannot be clipped. */\n.cgpt-app-dock button:focus:not(:focus-visible){outline:none}\n.cgpt-app-dock>button:focus-visible,.cgpt-app-dock .cgpt-app-dock-button:focus-visible{outline:2px solid var(--dsw-alias-label-secondary,#68717b);outline-offset:-2px}\n.cgpt-app-library button:disabled{opacity:.55;cursor:default}\n.cgpt-app-library button[aria-disabled="true"],.cgpt-app-dock button[aria-disabled="true"]{cursor:wait}\n@keyframes cgpt-app-spin{to{transform:rotate(360deg)}}\n@media(max-width:580px){.cgpt-app-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.cgpt-app-library-header{padding:20px 20px 16px}.cgpt-app-search,.cgpt-app-filters{margin-inline:20px}.cgpt-app-library-body{padding-inline:14px}.cgpt-app-library-footer{padding-inline:20px}}\n@media(max-width:380px){.cgpt-app-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}\n@media(prefers-reduced-motion:reduce){.cgpt-app-card{transition:none}.cgpt-app-opening{animation:none}}\n';

// notification.css
var notification_default = `/* The seat owns no hit area: only its bell and feed are interactive. In
   particular, it must not add a no-drag rectangle over the title bar. */
.cgpt-notification-seat{position:absolute;inset:0;z-index:4;pointer-events:none}
.cgpt-notifications{display:contents}
.cgpt-notification-button{position:absolute;top:53px;right:44px;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:7px;background:transparent;color:#898e91;cursor:pointer;pointer-events:auto;-webkit-app-region:no-drag}
.cgpt-notification-button:hover{background:#eceeee;color:#33383b}
.cgpt-notification-button[aria-expanded="true"]{background:#e0eafb;color:#4389f5}
.cgpt-notification-button:focus-visible,.cgpt-notification-read-all:focus-visible,.cgpt-notification-item:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#5683e9);outline-offset:-2px}
.cgpt-notification-dot{position:absolute;top:4px;right:4px;width:5px;height:5px;border-radius:50%;background:#4389f5;box-shadow:0 0 0 1.5px #fafafa;pointer-events:none}
.cgpt-notification-button[aria-expanded="true"]>.cgpt-notification-dot{box-shadow:0 0 0 1.5px #e0eafb}
[data-cgpt-rail-nav] button>.cgpt-home-notification-dot{display:block!important;top:7px;right:8px;width:7px;height:7px;box-shadow:0 0 0 1.5px #f2f3f3}
[data-cgpt-rail-nav] button[aria-current="page"]>.cgpt-home-notification-dot{box-shadow:0 0 0 1.5px #e3e6e6}

/* Keep native scroll/folders mounted. Hide descendants explicitly: a child's
   own visibility:visible overrides an inherited hidden even when the parent
   declaration is important. Only the relocated header search is restored.
   These selectors also outrank the rail's two-attribute visibility rules. */
[data-cgpt-rail][data-cgpt-notification-mode] [data-cgpt-workspace-region],
[data-cgpt-rail][data-cgpt-notification-mode] [data-cgpt-workspace-region] *{visibility:hidden!important;pointer-events:none!important}
[data-cgpt-rail][data-cgpt-notification-mode] [data-cgpt-workspace-region] [data-cgpt-search-button],
[data-cgpt-rail][data-cgpt-notification-mode] [data-cgpt-workspace-region] [data-cgpt-search-button] *{visibility:visible!important;pointer-events:auto!important}
.cgpt-notification-feed{position:absolute;top:136px;bottom:8px;left:60px;right:8px;display:flex;flex-direction:column;min-height:0;overflow:hidden;pointer-events:auto;color:var(--dsw-alias-label-primary,#202426);font-size:13px;-webkit-app-region:no-drag}
.cgpt-notification-heading{display:flex;align-items:center;justify-content:space-between;min-height:28px;padding:0 7px 4px 8px;flex-shrink:0}
.cgpt-notification-heading h2,.cgpt-notification-group-title{margin:0;font-size:12px;line-height:20px;font-weight:400;color:var(--dsw-alias-label-tertiary,#8a9094)}
.cgpt-notification-read-all{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#7b8186);cursor:pointer}
.cgpt-notification-read-all:hover:not(:disabled){background:#eceeee;color:#33383b}
.cgpt-notification-read-all:disabled{opacity:.4;cursor:default}
.cgpt-notification-list{min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-gutter:stable;padding:0 0 10px}
.cgpt-notification-group+.cgpt-notification-group{margin-top:22px}
.cgpt-notification-group-title{padding:0 8px 7px}
.cgpt-notification-item{position:relative;display:flex;align-items:flex-start;width:100%;box-sizing:border-box;min-height:55px;gap:9px;margin:0 0 3px;padding:8px;border:0;border-radius:8px;background:transparent;color:inherit;text-align:left;white-space:normal;cursor:pointer}
.cgpt-notification-item:hover,.cgpt-notification-item[data-selected]{background:#eceeee}
.cgpt-notification-item:disabled{cursor:wait;opacity:.75}
.cgpt-notification-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:3px;text-align:left}
.cgpt-notification-title-line{display:flex;align-items:baseline;min-width:0;gap:4px}
.cgpt-notification-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-primary,#202426)}
.cgpt-notification-workspace{flex:0 3 auto;min-width:0;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8a9094)}
.cgpt-notification-excerpt{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary,#81868a);overflow-wrap:anywhere}
.cgpt-notification-detail{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#8a9094)}
.cgpt-notification-item-dot{display:block;flex:none;width:6px;height:6px;margin-top:6px;border-radius:50%;background:#4389f5}
.cgpt-notification-empty{padding:32px 15px;text-align:center;color:var(--dsw-alias-label-secondary,#81868a)}
.cgpt-notification-empty>svg{width:24px;height:24px;opacity:.7;margin:0 auto 8px}
.cgpt-notification-empty p{margin:0 0 6px;font-size:13px;color:var(--dsw-alias-label-primary,#202426)}
.cgpt-notification-empty small{font-size:12px;line-height:1.6}
.cgpt-notification-error{flex-shrink:0;margin:4px 8px 10px;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary,#bd4b4b)}
[data-cgpt-rail-frame][data-sidebar-collapsed] .cgpt-notification-seat{visibility:hidden;pointer-events:none}
[data-cgpt-rail-frame][data-sidebar-collapsed] :is(.cgpt-notification-button,.cgpt-notification-feed){visibility:hidden;pointer-events:none}
[data-cgpt-rail-frame][data-sidebar-collapsed] [data-cgpt-rail][data-cgpt-notification-mode] [data-cgpt-search-button],
[data-cgpt-rail-frame][data-sidebar-collapsed] [data-cgpt-rail][data-cgpt-notification-mode] [data-cgpt-search-button] *{visibility:hidden!important;pointer-events:none!important}

[data-ds-dark-theme] .cgpt-notification-button{color:#949b9f}
[data-ds-dark-theme] .cgpt-notification-button:hover{background:#303436;color:#e6e9eb}
[data-ds-dark-theme] .cgpt-notification-button[aria-expanded="true"]{background:#25364f;color:#6da2fb}
[data-ds-dark-theme] .cgpt-notification-dot{box-shadow:0 0 0 1.5px #202223}
[data-ds-dark-theme] .cgpt-notification-button[aria-expanded="true"]>.cgpt-notification-dot{box-shadow:0 0 0 1.5px #25364f}
[data-ds-dark-theme] .cgpt-notification-item:hover,[data-ds-dark-theme] .cgpt-notification-item[data-selected],[data-ds-dark-theme] .cgpt-notification-read-all:hover:not(:disabled){background:#303436;color:#e6e9eb}
[data-ds-dark-theme] [data-cgpt-rail-nav] button>.cgpt-home-notification-dot{box-shadow:0 0 0 1.5px #252728}
[data-ds-dark-theme] [data-cgpt-rail-nav] button[aria-current="page"]>.cgpt-home-notification-dot{box-shadow:0 0 0 1.5px #363b3d}

.cgpt-notification-notice{flex-shrink:0;margin:4px 8px 10px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#81868a)}
`;

// client-entry.js
var h10 = import_react10.default.createElement;
var STORAGE = "cgpt-rail.home-draft.v2";
function readDraft() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) || "{}");
  } catch {
    return {};
  }
}
function HomeIcon({ size = 18, layout, slots, getRailLabels, pinnedModel, sessionContext, renderSlot, navigationModel, appDockModel, notificationModel }) {
  const ref = import_react10.default.useRef(null);
  const [pinnedSeat, setPinnedSeat] = import_react10.default.useState(null);
  const [contextSeat, setContextSeat] = import_react10.default.useState(null);
  const [actionSeat, setActionSeat] = import_react10.default.useState(null);
  const [appSeat, setAppSeat] = import_react10.default.useState(null);
  const [notificationSeat, setNotificationSeat] = import_react10.default.useState(null);
  const navigation = import_react10.default.useSyncExternalStore(navigationModel.subscribe, navigationModel.getSnapshot, navigationModel.getSnapshot);
  const preferredWidth = import_react10.default.useRef(392);
  const [rosterRevision, setRosterRevision] = import_react10.default.useState(0);
  import_react10.default.useEffect(() => {
    const update = () => setRosterRevision((n) => n + 1);
    const a = slots.subscribe("sidebar.panellist", update), b = slots.subscribe("sidebar.panellist.actions", update);
    return () => {
      a();
      b();
    };
  }, [slots]);
  import_react10.default.useLayoutEffect(() => {
    const seat = mountPinnedSessionsSeat(ref.current);
    setPinnedSeat(seat?.node || null);
    return () => seat?.dispose();
  }, [pinnedModel]);
  import_react10.default.useLayoutEffect(() => {
    const seat = mountRailActionsSeat(ref.current);
    setActionSeat(seat?.node || null);
    return () => seat?.dispose();
  }, [navigationModel]);
  import_react10.default.useLayoutEffect(() => {
    const seat = mountAppDockSeat(ref.current, appDockModel);
    setAppSeat(seat?.node || null);
    return () => seat?.dispose();
  }, [appDockModel]);
  import_react10.default.useLayoutEffect(() => {
    const seat = mountNotificationSeat(ref.current, notificationModel);
    setNotificationSeat(seat?.node || null);
    return () => seat?.dispose();
  }, [notificationModel]);
  import_react10.default.useLayoutEffect(() => {
    const document2 = ref.current?.ownerDocument;
    const region = ref.current?.closest("nav")?.parentElement?.querySelector('[data-slot="sidebar.workspaces"]')?.parentElement;
    if (!document2 || !region) return;
    const seat = mountSessionContextSeat(document2);
    setContextSeat(seat.node);
    const pattern = getRailLabels().sessionActionsTemplate.split("__cgpt_session_title__");
    const stop5 = wireSessionContextEvents(region, {
      onRequest: (request) => sessionContext.open(request),
      isMoreButton: (label) => pattern.length === 2 && label.startsWith(pattern[0]) && label.endsWith(pattern[1])
    });
    return () => {
      sessionContext.close();
      stop5();
      seat.dispose();
    };
  }, [sessionContext, getRailLabels]);
  import_react10.default.useLayoutEffect(() => {
    return wireRailLayout(ref.current, { labels: getRailLabels(), navigation });
  }, [size, layout, getRailLabels, rosterRevision, navigation]);
  import_react10.default.useLayoutEffect(() => wireRailGeometry(ref.current, {
    preferredWidth: preferredWidth.current,
    setWidth: (width) => layout.panels.setSidebar(width),
    onWidth: (width) => {
      preferredWidth.current = width;
    }
  }), [layout]);
  return h10(
    import_react10.default.Fragment,
    null,
    h10("span", { ref, style: { display: "flex" } }, h10("svg", { width: size, height: size, viewBox: "0 0 20 20", "aria-hidden": true, fill: "currentColor" }, h10("path", { d: "M10 2 1 9.5l1.4 1.7L4 9.9V18h4v-5h4v5h4V9.9l1.6 1.3L19 9.5 10 2Z" }))),
    pinnedSeat && (0, import_react_dom2.createPortal)(h10(PinnedSessions, { model: pinnedModel, labels: getRailLabels(), StateDot: import_dsh_client_ui_primitives.StateDot, Tooltip: import_dsh_client_ui_primitives.Tooltip, renderSlot }), pinnedSeat),
    contextSeat && (0, import_react_dom2.createPortal)(h10(SessionContextMenu, { controller: sessionContext, renderSlot, Menu: import_dsh_client_ui_primitives.Menu }), contextSeat),
    appSeat && (0, import_react_dom2.createPortal)(h10(AppDock, { model: appDockModel, notificationModel, Modal: import_dsh_client_ui_primitives.Modal, Menu: import_dsh_client_ui_primitives.Menu, MenuItem: import_dsh_client_ui_primitives.MenuItemButton, Tooltip: import_dsh_client_ui_primitives.Tooltip }), appSeat),
    notificationSeat && (0, import_react_dom2.createPortal)(h10(NotificationBell, { model: notificationModel, Menu: import_dsh_client_ui_primitives.Menu, MenuItem: import_dsh_client_ui_primitives.MenuItemButton }), notificationSeat),
    actionSeat && (0, import_react_dom2.createPortal)(h10(RailActionButtons, { navigationModel }), actionSeat)
  );
}
function CompactBrand() {
  return h10("span", null, "DeepSeek");
}
function GlobalSearchShell({ ctx, model, Modal, getSearchLabel }) {
  import_react10.default.useLayoutEffect(() => {
    let shortcuts;
    try {
      shortcuts = ctx.get("shortcuts");
    } catch {
    }
    return wireGlobalSearchEntry({ document, shortcuts, open: () => model.open(), getSearchLabel });
  }, [ctx, model, getSearchLabel]);
  return h10(GlobalSearchPalette, { model, Modal });
}
var client_entry_default = {
  inject: ["slots", "locale", "layout", "sessions", "workspaces", "conversation", "uiWorkspace", "uiSession", "remote", "remote.session", "remote.permissionPresets", "remote.agentPresets", "remote.commands"],
  apply(ctx) {
    installVideoPreview(ctx);
    const controller = createDraftController(readDraft());
    const adapter = createHostAdapter(ctx);
    const controls = createNativeControls(ctx, import_react10.default);
    const pinnedModel = createPinnedSessionsModel(ctx);
    const sessionContext = createSessionContextController(ctx);
    const notificationModel = createNotificationModel(ctx);
    ctx.effect(() => () => notificationModel.dispose(), "chatgpt-rail:notifications");
    const searchModel = createGlobalSearchModel(ctx, {
      openHome: () => ctx.layout.selectPanel("home"),
      openWorkspace: (workspaceId) => {
        controller.update({ workspaceId });
        ctx.layout.selectPanel("home");
      }
    });
    ctx.effect(() => () => searchModel.dispose(), "chatgpt-rail:global-search");
    ctx.effect(() => () => sessionContext.dispose(), "chatgpt-rail:session-context");
    adapter.listSessionReferences = () => {
      const snapshot2 = ctx.sessions.list.getSnapshot();
      const archived = ctx.workspaces.list.getSnapshot().archivedSessionIds || [];
      return snapshot2.ids.map((id) => snapshot2.byId[id]).filter((s) => s && !s.blank && !archived.includes(s.id)).map((s) => {
        const label = s.title || s.projectionValues?.title || s.id.slice(0, 16);
        return { sessionId: s.id, label, mention: sessionMention(s.id, label) };
      });
    };
    ctx.effect(() => ctx.locale.register("chatgptRail", { zh: { "panel.home": "\u9996\u9875", "sidebar.newChat": "\u65B0\u804A\u5929", "sidebar.pinned": "\u7F6E\u9876", "sidebar.unpin": "\u53D6\u6D88\u7F6E\u9876\u804A\u5929", "nav.browse": "\u6D4F\u89C8\u66F4\u591A\u63D2\u4EF6", "nav.create": "\u521B\u5EFA\u4F60\u7684\u63D2\u4EF6", "nav.settings": "\u8BBE\u7F6E" }, en: { "panel.home": "Home", "sidebar.newChat": "New chat", "sidebar.pinned": "Pinned", "sidebar.unpin": "Unpin chat", "nav.browse": "Browse other plugins", "nav.create": "Create your plugin", "nav.settings": "Settings" } }), "chatgpt-rail:locale");
    const dockPreferences = createDockPreferences();
    ctx.effect(() => () => dockPreferences.dispose(), "chatgpt-rail:dock-preferences");
    const navigationModel = createRailNavigationModel(ctx, { capacity: 6, preferences: dockPreferences, nativePins: createNativePanelPinsSource(ctx.slots), getLabels: () => {
      const t = ctx.locale.bind("chatgptRail");
      return { browsePlugins: t("nav.browse"), createPlugin: t("nav.create"), settings: t("nav.settings") };
    } });
    const appDockModel = createAppDockModel({ navigationModel, slots: ctx.slots, layout: ctx.layout });
    ctx.effect(() => () => appDockModel.dispose(), "chatgpt-rail:app-dock");
    ctx.effect(() => {
      const tag = document.createElement("style");
      tag.dataset.cgptRailStyle = "2";
      tag.textContent = rail_default + "\n" + home_default + "\n" + global_search_default + "\n" + app_dock_default + "\n" + notification_default;
      document.head.appendChild(tag);
      return () => tag.remove();
    }, "chatgpt-rail:styles");
    ctx.effect(() => {
      let previous = "";
      const persist = () => {
        const s = controller.getSnapshot();
        const value = JSON.stringify({ text: s.text, workspaceId: s.workspaceId, agentPreset: s.agentPreset, modelSelection: s.modelSelection, permissionPreset: s.permissionPreset, recoverySessionId: s.preparedSessionId, sendUncertain: s.sendUncertain || s.status === "sending" || s.status === "creating" });
        if (value !== previous) {
          previous = value;
          try {
            localStorage.setItem(STORAGE, value);
          } catch {
          }
        }
      };
      const stop5 = controller.subscribe(persist);
      persist();
      return () => {
        stop5();
        controller.dispose();
        adapter.dispose();
      };
    }, "chatgpt-rail:draft");
    const getRailLabels = () => ({
      newSession: ctx.locale.bind("sidebar")("session.new.label"),
      newChat: ctx.locale.bind("chatgptRail")("sidebar.newChat"),
      more: ctx.locale.bind("sidebar")("panels.more"),
      search: ctx.locale.bind("workspace")("search.sessions.aria"),
      toggleOpen: ctx.locale.bind("sidebar")("toggle.open"),
      toggleCollapse: ctx.locale.bind("sidebar")("toggle.collapse"),
      pinned: ctx.locale.bind("chatgptRail")("sidebar.pinned"),
      unpin: ctx.locale.bind("chatgptRail")("sidebar.unpin"),
      running: ctx.locale.bind("workspace")("status.running"),
      sessionActionsTemplate: ctx.locale.bind("workspace")("actions.session.aria", { name: "__cgpt_session_title__" }),
      panels: Object.fromEntries(ctx.slots.entriesOfSlot("sidebar.panellist").map(({ options }) => [options.id, typeof options.label === "function" ? options.label() : options.label]))
    });
    ctx.slots.inject("sidebar.brand.name", () => ctx.slots.register({ name: "sidebar.brand.name", priority: -20 }, CompactBrand));
    ctx.slots.inject("shell.overlay", () => ctx.slots.register({
      name: "shell.overlay",
      id: "chatgpt-rail.window-chrome",
      inject: () => ({ ctx, Menu: import_dsh_client_ui_primitives.Menu, MenuItem: import_dsh_client_ui_primitives.MenuItemButton, Modal: import_dsh_client_ui_primitives.Modal })
    }, GlobalWindowChrome));
    const getSearchLabel = () => getRailLabels().search;
    ctx.slots.inject("shell.overlay", () => ctx.slots.register({
      name: "shell.overlay",
      id: "chatgpt-rail.global-search",
      inject: () => ({ ctx, model: searchModel, Modal: import_dsh_client_ui_primitives.Modal, getSearchLabel })
    }, GlobalSearchShell));
    ctx.slots.inject("sidebar.panellist", () => ctx.slots.inject(NATIVE_SESSION_MENU, () => ctx.slots.inject(NATIVE_SESSION_ROW_ACTIONS, () => {
      const nativeSpec = ctx.slots.spec(NATIVE_SESSION_MENU);
      const stopHome = ctx.slots.register({
        name: "sidebar.panellist",
        id: "home",
        order: -10,
        locale: "chatgptRail",
        label: () => ctx.locale.bind("chatgptRail")("panel.home"),
        children: { [SESSION_CONTEXT_MENU]: { kind: "list", scope: "root", inject: nativeSpec.inject }, [PINNED_SESSION_ROW_ACTIONS]: { kind: "list", scope: "root" } },
        inject: () => ({ layout: ctx.layout, slots: ctx.slots, getRailLabels, pinnedModel, sessionContext, navigationModel, appDockModel, notificationModel })
      }, HomeIcon);
      let stopMenu, stopPinnedActions;
      try {
        stopMenu = mirrorNativeSessionMenu(ctx.slots);
        stopPinnedActions = mirrorNativePinnedActions(ctx.slots);
      } catch (error) {
        stopPinnedActions?.();
        stopMenu?.();
        stopHome();
        throw error;
      }
      return () => {
        stopPinnedActions();
        stopMenu();
        stopHome();
      };
    })));
    ctx.slots.inject("sidebar.panellist.actions", () => ctx.slots.register({
      name: "sidebar.panellist.actions",
      id: "entry-customization",
      priority: -20,
      inject: () => ({ navigationModel, MenuItem: import_dsh_client_ui_primitives.MenuItemButton })
    }, RailOverflowContent));
    ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: "home", locale: "chatgptRail", inject: () => ({ controller, adapter, ...controls }) }, HomePage));
  }
};

return module.exports.default;}});
