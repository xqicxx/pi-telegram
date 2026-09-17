# Telegram UI / interaction upgrade plan

Scope: **presentation and interaction only**. Bridge routing, session binding, queue, journal, workspace admission, delivery authorization, and turn semantics stay untouched.

Source of ideas: Bot API changelog Dec 2025 → Aug 2026 (Bot API 10.3) plus peer-plugin survey `(musichen/pi-telegram-multi, Ziphyrien/Pi-Telegram, badlogic/pi-telegram, johnlam1968/pi-voice-telegram)`.

## 1. Telegram capabilities we do not use yet

| Capability | API | Current state |
| --- | --- | --- |
| Ephemeral messages (per-user, editable, `replace_callback_query_message`) | Bot API 10.0/10.3, `EphemeralMessageParameters` | **0 references** |
| Draft `can_stop`, `keep_on_stop`, `MessageGenerationStopped` update | Bot API 10.3 | **0 references** |
| `force_reply` on inline/reply keyboard | Bot API 10.3 | **0 references** |
| Native `disabled` inline buttons | Bot API 10.3 | declared in `lib/keyboard.ts`, unused by features |
| Rich blocks: `Table` (+`is_compact`), `Details`, `ExpandableBlockQuotation`, `Thinking`, `Divider`, `SectionHeading`, `Preformatted`, `RichBlockDocument`, blocks with buttons | Bot API 10.0–10.3 | only `markdown` rich messages used |
| Private-chat topics | Dec 2025 / Feb 2026 | Threaded Mode uses message threads/instances instead |
| Button `icon_custom_emoji_id` | Feb 2026 | styles only |

Used already: `sendRichMessage` (53 refs), `sendMessageDraft`/`sendRichMessageDraft` (17 refs), button `style`.

## 2. What peers do better (and what we borrow)

- `pi-telegram-multi`: per-session bot identity, explicit target naming. Borrow only the **label clarity** idea — one-line target heading on every control card.
- `Ziphyrien/Pi-Telegram`: scheduled tasks, isolated session per chat, English/Chinese README parity. No UI ideas worth importing.
- `johnlam1968/pi-voice-telegram`: voice-note round trip and TTS echo on top of this bridge. Confirms the companion-extension surface works; no change needed here.
- `badlogic/pi-telegram` (original): plain send/edit polling loop; we already exceed it.

Conclusion: peers do not solve prettiness. The gain is in unshipped Telegram-native UI primitives.

## 3. Ranked changes

### P0 — Instant feedback and fewer taps

1. **Ephemeral acknowledgements.** Every callback answer and every "applied" notice becomes an ephemeral message instead of a second real message or an edit of the control card. Chat stays clean; acknowledges stop stacking.
2. **`force_reply` for option-less questions.** `ask_user` text prompts (and any prompt without a keyboard) set `force_reply: true` plus `input_field_placeholder`, so the client opens the reply box focused.
3. **Native `disabled` buttons.** First/last pagination rows, the currently selected model row, and completed confirmation rows stay visible but inert — no keyboard reflow between renders.

### P1 — Live turn control

1. **`can_stop` on drafts + `MessageGenerationStopped`.** The streaming preview carries the client's native stop affordance; the stop update routes into the existing abort path. No second control message needed to cancel.
2. **`keep_on_stop`** so the partial text remains readable after a stop instead of vanishing.

### P2 — Output readability (rich blocks)

1. **Tables** (`RichBlockTable`, `is_compact`) for `/status`, `/queue`, `/model` lists — replaces the ASCII-aligned code blocks the current renderer emits because GFM tables are unsupported in rich markdown.
2. **`Details` / `ExpandableBlockQuotation`** for tool output, diffs, and file lists: collapsed by default, tap to expand.
3. **`Thinking` block** for reasoning activity instead of quoted text.
4. **`RichBlockDocument`** for delivered files so attachments render as file cards.

### P3 — Structural (only if the operator wants it)

1. Private-chat topics as an alternative thread container for Threaded Mode.

## 4. Verification per change

- Unit: existing `tests/keyboard.test.ts`, `tests/rendering.test.ts`, `tests/outbound-markup.test.ts`, `tests/menu-*.test.ts` cover the payload builders; extend them rather than adding frameworks.
- Live smoke in the operator chat: button press → toast appears and keyboard state is stable; option-less question → reply box opens focused; long turn → stop button visible and effective.

## 5. Non-goals

Routing, ownership, admission, journaling, workspace lifecycle, session identity, queue semantics, and any change that alters who may talk to the bridge. UI changes must not become a second source of truth for turn state.
