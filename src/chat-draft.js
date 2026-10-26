(() => {
  window.DesktopPetDraft = {
    create(input, { autofocus = true } = {}) {
      input.disabled = true;
      let context = null;
      let composing = false;
      let edit = 0;
      let acknowledgedEdit = 0;
      let version = -1;
      let earlyUpdate = null;
      const api = window.desktopPet;
      const sameContext = (value) => context && value?.characterId === context.characterId
        && value.revision === context.revision;
      function publish() {
        if (context) api.setChatDraft({ ...context, text: input.value, edit: ++edit });
      }
      function replace(text) {
        if (input.value !== text) input.value = text;
      }
      function receive(draft) {
        if (!context) { earlyUpdate = draft; return; }
        if (!sameContext(draft)) return;
        if (draft.version < version) return;
        acknowledgedEdit = Math.max(acknowledgedEdit, draft.acknowledgedEdit || 0);
        // An older edit from the other window must not replace locally queued typing.
        if (composing || acknowledgedEdit < edit) return;
        version = draft.version;
        replace(draft.text);
      }
      input.addEventListener("input", () => {
        if (!composing) publish();
      });
      input.addEventListener("compositionstart", () => { composing = true; });
      input.addEventListener("compositionend", () => {
        composing = false;
        publish();
      });
      api.onChatDraftUpdated(receive);
      return {
        context: () => context && { ...context },
        applyState(state) {
          const draft = state.draft;
          if (!draft || sameContext(draft)) return;
          const initial = !context;
          if (composing) input.blur();
          context = { characterId: draft.characterId, revision: draft.revision };
          composing = false;
          edit = acknowledgedEdit = 0;
          version = draft.version ?? -1;
          replace(draft.text);
          if (earlyUpdate) { receive(earlyUpdate); earlyUpdate = null; }
          input.disabled = false;
          if (initial && autofocus && document.activeElement === document.body) input.focus();
        },
        clearIfMatches(text) {
          if (input.value.trim() !== text.trim()) return;
          replace("");
          publish();
        },
        restore(text, originalContext) {
          if (originalContext && !sameContext(originalContext)) return;
          if (!input.value) { replace(text); publish(); }
        },
      };
    },
  };
})();
