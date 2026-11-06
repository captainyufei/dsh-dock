/*
 * Session-free adapters for selected, already-loaded Harness contributions.
 *
 * This module consumes the public slot inspection surface; it does not mount a
 * Session scope, fabricate a SessionBinding, or obtain constructors from an
 * existing conversation. The voice adapter is intentionally narrow: the
 * installed official voice contribution owns recording, device preference,
 * readiness, transcription, cancellation, and setup navigation.
 *
 * Verified against Harness 0.2.1-rc.5 and 0.2.2-rc.1. A changed/missing contribution fails with
 * an explicit UI message. Its component/injection contract is version-sensitive
 * and must be checked when upgrading Harness.
 */

export function createNativeControls(ctx, React, helpers = {}) {
  const h = React.createElement;
  const VOICE_SLOT = "conversation.input.activity";
  const cache = new WeakMap();
  let nextVoiceId = 0;
  const noop = () => {};
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
    if (!entry) return unavailable("语音插件尚未启用。请先在插件页启用语音输入并完成语音资源设置。");
    if (cache.has(entry)) return cache.get(entry);
    let result;
    try {
      if (!entry.component || typeof entry.inject !== "function") {
        throw new Error("当前语音插件接口与首页不兼容，请更新首页插件或返回会话使用语音输入。");
      }
      // Official VoiceInput's injection is root-owned and accepts no Session id.
      const actions = entry.inject();
      const source = actions?.hooks?.speechReadiness;
      if (typeof actions?.createRecording !== "function" ||
          typeof actions?.transcribe !== "function" ||
          typeof actions?.openSettings !== "function" ||
          typeof source?.getSnapshot !== "function" ||
          typeof source?.subscribe !== "function") {
        throw new Error("当前语音插件接口已变化，首页语音暂不可用。请更新首页插件。");
      }
      // Match the Host renderer's hooks -> use<Name> binding. New VoiceInput
      // versions also consume pluginNavigation; binding only readiness leaves
      // the microphone unable to render even though its actions are present.
      const {hooks, ...actionProps} = actions;
      const hookProps = {};
      for (const [name, store] of Object.entries(hooks)) {
        if (typeof store?.getSnapshot !== "function" || typeof store?.subscribe !== "function") {
          throw new Error("当前语音插件的状态接口与首页不兼容，请更新首页插件。");
        }
        const subscribe = (listener) => store.subscribe(listener);
        const getSnapshot = () => store.getSnapshot();
        hookProps['use' + name[0].toUpperCase() + name.slice(1)] = function useVoiceSource(select = identity) {
          return select(React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot));
        };
      }
      result = {
        available: true,
        id: ++nextVoiceId,
        component: entry.component,
        props: {
          ...actionProps,
          ...hookProps,
          t: ctx.locale.bind(entry.locale),
        },
      };
    } catch (error) {
      result = unavailable(error instanceof Error ? error.message : String(error));
    }
    cache.set(entry, result);
    return result;
  }

  function useSlotEntries(key) {
    const subscribe = React.useCallback((listener) => {
      if (typeof ctx.slots?.subscribe !== "function") return noop;
      try { return ctx.slots.subscribe(key, listener); } catch (_) { return noop; }
    }, [key]);
    const getSnapshot = React.useCallback(() => {
      try { return ctx.slots.entries(key); } catch (_) { return []; }
    }, [key]);
    // SlotRegistry.entries() guarantees stable array identity between mutations.
    // If a host does not expose it, use one stable empty snapshot.
    const empty = React.useRef([]);
    const read = React.useCallback(() => {
      const value = getSnapshot();
      // Keep inspection wrappers returning an equivalent array from causing an
      // external-store render loop. Entries themselves are identity-stable.
      if (value.length === empty.current.length &&
          value.every((entry, index) => entry === empty.current[index])) return empty.current;
      empty.current = value;
      return value;
    }, [getSnapshot]);
    return React.useSyncExternalStore(subscribe, read, read);
  }

  class VoiceBoundary extends React.Component {
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
        return h("span", { role: "alert", className: "cgpt-home-control-error" },
          "首页语音暂不可用：" + this.state.error);
      }
      return this.props.children;
    }
  }

  /**
   * Actual official microphone, transcription status, retry, and setup dialog.
   *
   * Required owner props:
   *   inputActions.captureInsertion(): {start,end,draftRev}
   *   inputActions.insertText(text, span): boolean
   * Optional owner props:
   *   locked, onActiveChange(boolean), onError(message), draftKey
   *
   * onActiveChange(true) should lock the owner's Send button while recording or
   * transcribing. Changing draftKey cancels the old recording by unmounting it.
   */
  function VoiceControl({ inputActions, controller, textareaRef, locked = false,
      onActiveChange = noop, onError, draftKey = "home", className = "" }) {
    const list = useSlotEntries(VOICE_SLOT);
    const voice = React.useMemo(() => resolveVoice(list), [list]);
    const [notice, setNotice] = React.useState("");
    const owner = React.useRef({ locked, onError });
    owner.current = { locked, onError };
    const localActions = React.useMemo(() => {
      if (inputActions) return inputActions;
      if (typeof controller?.getSnapshot !== "function" || typeof controller?.setText !== "function") return null;
      return createTextareaInputActions({
        textareaRef,
        getText: () => controller.getSnapshot().text,
        getRevision: () => {
          const snapshot = controller.getSnapshot();
          return snapshot.textRevision ?? snapshot.draftRev ?? snapshot;
        },
        setText: (text) => {
          try { controller.setText(text); return true; }
          catch (error) { report(error, owner.current.onError); return false; }
        },
        isLocked: () => owner.current.locked ||
          ["creating", "configuring", "sending", "opening"].includes(controller.getSnapshot().status),
      });
    }, [inputActions, controller, textareaRef]);
    const validInput = typeof localActions?.captureInsertion === "function" &&
      typeof localActions?.insertText === "function";
    React.useEffect(() => { setNotice(""); }, [list]);
    const reason = voice.available && validInput ? null :
      voice.available ? "首页语音草稿接口未就绪，请重新打开首页。" : voice.reason;
    if (reason) {
      return h("span", { className: "cgpt-home-voice-unavailable " + className },
        h("button", {
          type: "button", title: reason, "aria-label": "语音输入不可用",
          disabled: locked,
          onClick: () => { setNotice(reason); report(reason, onError); },
        }, "语音"),
        notice ? h("span", { role: "status", className: "cgpt-home-control-error" }, notice) : null);
    }
    return h("span", { className: "cgpt-home-native-voice " + className },
      h(VoiceBoundary, { key: draftKey + ":" + voice.id, onError },
        h(voice.component, {
          ...voice.props,
          sessionId: undefined,
          inputActions: localActions,
          locked,
          onActiveChange,
        })));
  }

  /**
   * Textarea draft adapter with optimistic insertion protection.
   * setText(next) may return false to reject an update, e.g. during first send.
   * getRevision must increase on every owner text mutation, including clear.
   */
  function createTextareaInputActions({ textareaRef, getText, setText, getRevision,
      isLocked = () => false }) {
    const owner = Symbol("home-textarea");
    return {
      captureInsertion() {
        const text = String(getText() ?? "");
        const element = textareaRef?.current;
        return {
          start: element?.selectionStart ?? text.length,
          end: element?.selectionEnd ?? text.length,
          draftRev: getRevision(),
          owner,
        };
      },
      insertText(text, span) {
        if (isLocked() || !span || span.owner !== owner || span.draftRev !== getRevision()) return false;
        const before = String(getText() ?? "");
        if (!Number.isInteger(span.start) || !Number.isInteger(span.end) ||
            span.start < 0 || span.end < span.start || span.end > before.length) return false;
        const insertion = String(text);
        const next = before.slice(0, span.start) + insertion + before.slice(span.end);
        if (setText(next) === false) return false;
        const caret = span.start + insertion.length;
        queueMicrotask(() => {
          const element = textareaRef?.current;
          // Do not steal focus from another panel after asynchronous insertion.
          if (element?.isConnected && element.value === next) {
            element.focus();
            element.setSelectionRange(caret, caret);
          }
        });
        return true;
      },
    };
  }

  function getCapabilities() {
    const voice = resolveVoice(entries());
    return { voice: { available: voice.available, reason: voice.reason ?? null } };
  }

  /** Reuse the loaded brand contribution rather than copying logo markup. */
  function BrandMark({ size = 64, className = "" }) {
    const list = useSlotEntries("sidebar.brand.mark");
    const entry = list.find((candidate) => candidate.component?.name === "OfficialBrandMark" ||
      String(candidate.registrant ?? "").includes("ui-brand-official"));
    return h("span", { className: "cgpt-home-brand " + className, "aria-hidden": true },
      entry ? h(entry.component, { size }) : h("span", { style: { fontSize: size / 3 } }, "DeepSeek"));
  }

  return { VoiceControl, BrandMark, createTextareaInputActions, getCapabilities };
}
