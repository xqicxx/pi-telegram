/**
 * Bridge-owned Telegram activity verbosity projection
 * Zones: telegram activity, rich rendering, operational delivery
 * Owns persistent bounded thinking and tool disclosures; excludes activity normalization, assistant answer rendering, and transport authority policy
 */

import type {
  TelegramActivityEvent,
  TelegramActivityPublicationRuntime,
} from "./activity.ts";
import { escapeHtml } from "./rendering.ts";
import type {
  TelegramEditMessageTextBody,
  TelegramInputRichBlock,
  TelegramInputRichMessage,
  TelegramRichText,
  TelegramSendMessageBody,
  TelegramSendRichMessageBody,
  TelegramSentMessage,
} from "./telegram-api.ts";
import type { TelegramTarget } from "./target.ts";

export const TELEGRAM_ACTIVITY_DETAIL_MAX_CHARS = 1_200;
export const TELEGRAM_ACTIVITY_MESSAGE_MAX_CHARS = 3_900;
export const TELEGRAM_ACTIVITY_MESSAGE_MAX_TOOLS = 6;
export const TELEGRAM_REASONING_MESSAGE_MAX_FRAMES = 24;
export const TELEGRAM_REASONING_BUFFER_MAX_CHARS = 16_000;

/**
 * Rich messages carry 32768 chars, so the thinking card can ship the whole
 * reasoning instead of a 3900 char tail.
 */
const TELEGRAM_REASONING_MESSAGE_MAX_CHARS = 16_000;
export const TELEGRAM_REASONING_MIN_INTERVAL_MS = 1_200;
export const TELEGRAM_TOOL_UPDATE_MAX_ENTRIES = 4;

interface ToolActivity {
  id: string;
  name: string;
  args: string;
  updates: string[];
  droppedUpdates: number;
  result?: string;
  isError?: boolean;
  complete: boolean;
}

interface ToolMessage {
  messageId: number;
  tools: ToolActivity[];
  target: TelegramTarget;
  format: "rich" | "html";
}

interface ReasoningMessage {
  messageId: number;
  target: TelegramTarget;
}

function targetEquals(left: TelegramTarget, right: TelegramTarget): boolean {
  return left.chatId === right.chatId && left.threadId === right.threadId;
}

function redactActivityText(text: string): string {
  return text
    .replace(/\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g, "[REDACTED_BOT_TOKEN]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}\b/gi, "$1[REDACTED]")
    .replace(
      /(["']?(?:api[_-]?key|token|password|secret)["']?\s*[:=]\s*["']?)[^"',\s}]+/gi,
      "$1[REDACTED]",
    );
}

function formatActivityJson(value: unknown, depth = 0): string[] {
  const indent = "  ".repeat(depth);
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${indent}[]`];
    if (
      value.every(
        (entry) =>
          entry !== null && typeof entry === "object" && !Array.isArray(entry),
      )
    ) {
      const lines = [`${indent}[{`];
      value.forEach((entry, index) => {
        const fields = Object.entries(entry as Record<string, unknown>);
        fields.forEach(([key, nested], fieldIndex) => {
          const nestedLines = formatActivityJson(nested, depth + 1);
          const nestedIndent = "  ".repeat(depth + 1);
          lines.push(
            `${nestedIndent}${JSON.stringify(key)}: ${nestedLines[0]!.slice(nestedIndent.length)}`,
            ...nestedLines.slice(1),
          );
          if (fieldIndex < fields.length - 1) {
            lines[lines.length - 1] += ",";
          }
        });
        lines.push(index < value.length - 1 ? `${indent}}, {` : `${indent}}]`);
      });
      return lines;
    }
    const lines = [`${indent}[`];
    value.forEach((entry, index) => {
      const nestedLines = formatActivityJson(entry, depth + 1);
      if (index < value.length - 1) {
        nestedLines[nestedLines.length - 1] += ",";
      }
      lines.push(...nestedLines);
    });
    lines.push(`${indent}]`);
    return lines;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return [`${indent}{}`];
    const lines = [`${indent}{`];
    entries.forEach(([key, nested], index) => {
      const nestedLines = formatActivityJson(nested, depth + 1);
      const nestedIndent = "  ".repeat(depth + 1);
      lines.push(
        `${nestedIndent}${JSON.stringify(key)}: ${nestedLines[0]!.slice(nestedIndent.length)}`,
        ...nestedLines.slice(1),
      );
      if (index < entries.length - 1) lines[lines.length - 1] += ",";
    });
    lines.push(`${indent}}`);
    return lines;
  }
  return [`${indent}${JSON.stringify(value)}`];
}

function serializeActivityValue(value: unknown): string {
  const seen = new WeakSet<object>();
  let text: string;
  try {
    const normalized =
      JSON.stringify(value, (_key, nested) => {
        if (typeof nested === "bigint") return nested.toString();
        if (nested && typeof nested === "object") {
          if (seen.has(nested)) return "[Circular]";
          seen.add(nested);
        }
        return nested;
      }) ?? JSON.stringify(String(value));
    text = formatActivityJson(JSON.parse(normalized)).join("\n");
  } catch {
    text = JSON.stringify(String(value));
  }
  const redacted = redactActivityText(text);
  if (redacted.length <= TELEGRAM_ACTIVITY_DETAIL_MAX_CHARS) return redacted;
  const omitted = redacted.length - TELEGRAM_ACTIVITY_DETAIL_MAX_CHARS;
  return `${redacted.slice(0, TELEGRAM_ACTIVITY_DETAIL_MAX_CHARS)}\n… [${omitted} chars truncated]`;
}

function neutralizeActivityAutoLinks(text: string): string {
  return text.replace(/\b(https?:\/\/)(?=\S)/gi, "$1\u200b");
}

function escapeActivityEvidenceHtml(text: string): string {
  return escapeHtml(neutralizeActivityAutoLinks(text));
}

function formatToolActivityLabel(label: string): string {
  return label
    .split("_")
    .filter(Boolean)
    .map((word) => {
      const repeatedPrefix = word.match(/^([a-z])\1*/iu)?.[0] ?? "";
      if (repeatedPrefix.length === 2 || repeatedPrefix.length === 3) {
        return `${repeatedPrefix.toUpperCase()}${word.slice(repeatedPrefix.length)}`;
      }
      return `${word[0]!.toUpperCase()}${word.slice(1)}`;
    })
    .join(" ");
}

function renderToolActivityHtml(tool: ToolActivity): string {
  const evidence = [`"arguments": ${tool.args}`];
  if (tool.droppedUpdates > 0) {
    evidence.push(`… [${tool.droppedUpdates} earlier updates omitted]`);
  }
  tool.updates.forEach((update, index) => {
    evidence.push(`"update ${tool.droppedUpdates + index + 1}": ${update}`);
  });
  if (tool.complete && tool.result !== undefined) {
    evidence.push(`"${tool.isError ? "error" : "result"}": ${tool.result}`);
  }
  const status = tool.complete ? (tool.isError ? "failed" : "done") : "running";
  return [
    `<b>${escapeHtml(formatToolActivityLabel(tool.name))}:</b> <code>${status}</code>`,
    `<blockquote expandable>${escapeActivityEvidenceHtml(evidence.join("\n\n"))}</blockquote>`,
  ].join("\n");
}

export function renderTelegramToolActivityHtml(
  tools: readonly ToolActivity[],
): string {
  return tools.map(renderToolActivityHtml).join("\n\n");
}

/** One-line hint so a collapsed tool row still says what it acted on. */
function toolActivityArgumentHint(tool: ToolActivity): string | undefined {
  const raw = tool.args?.trim();
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }
  const value = Object.values(parsed as Record<string, unknown>).find(
    (candidate) => typeof candidate === "string" && candidate.trim() !== "",
  );
  if (typeof value !== "string") return undefined;
  const flat = value.replace(/\s+/gu, " ").trim();
  return flat.length > 48 ? `${flat.slice(0, 47)}…` : flat;
}

function createToolActivityDetail(
  summary: string,
  text: string,
  isOpen = false,
): TelegramInputRichBlock {
  return {
    type: "details",
    summary: { type: "code", text: summary },
    blocks: [{ type: "pre", text, language: "json" }],
    ...(isOpen ? { is_open: true as const } : {}),
  };
}

function renderToolActivityRichBlocks(
  tool: ToolActivity,
): TelegramInputRichBlock[] {
  const status = tool.complete ? (tool.isError ? "failed" : "done") : "running";
  // Arguments start collapsed: the row stays one line until the operator taps it.
  const evidenceBlocks: TelegramInputRichBlock[] = [
    createToolActivityDetail("arguments", tool.args),
  ];
  tool.updates.forEach((update, index) => {
    const number = tool.droppedUpdates + index + 1;
    const omitted =
      index === 0 && tool.droppedUpdates > 0
        ? ` (${tool.droppedUpdates} earlier omitted)`
        : "";
    evidenceBlocks.push(
      createToolActivityDetail(`update ${number}${omitted}`, update),
    );
  });
  if (tool.complete && tool.result !== undefined) {
    evidenceBlocks.push(
      createToolActivityDetail(tool.isError ? "error" : "result", tool.result),
    );
  }
  const hint = toolActivityArgumentHint(tool);
  return [
    {
      type: "details",
      summary: [
        {
          type: "bold",
          text: `${formatToolActivityLabel(tool.name)}:`,
        },
        " ",
        { type: "code", text: status },
        ...(hint
          ? ([" ", { type: "code" as const, text: hint }] as const)
          : []),
      ],
      blocks: evidenceBlocks,
    },
  ];
}

export function renderTelegramToolActivityRichMessage(
  tools: readonly ToolActivity[],
): TelegramInputRichMessage {
  return {
    blocks: tools.flatMap(renderToolActivityRichBlocks),
    skip_entity_detection: true,
  };
}

function toolMessageSize(tools: readonly ToolActivity[]): number {
  return renderTelegramToolActivityHtml(tools).length;
}

function isKnownSafeRichActivityRejection(error: unknown): boolean {
  return (
    error instanceof Error && /HTTP 400: Bad Request:/i.test(error.message)
  );
}

/** Chars of reasoning shown on the live thinking line. */
export const TELEGRAM_THINKING_PREVIEW_MAX_CHARS = 60;

/**
 * One line of the newest reasoning, so the collapsed card stays three rows tall
 * however long the model thinks. Newlines collapse: a preview that grows into a
 * wall of text defeats the point of folding the card.
 */
export function thinkingActivityPreview(text: string): string | undefined {
  const flat = text.replace(/\s+/gu, " ").trim();
  if (!flat) return undefined;
  return flat.length <= TELEGRAM_THINKING_PREVIEW_MAX_CHARS
    ? flat
    : `…${flat.slice(-TELEGRAM_THINKING_PREVIEW_MAX_CHARS)}`;
}

export interface TelegramThinkingCardState {
  chars?: number;
  tools?: number;
  durationMs?: number;
  finished?: boolean;
}

const formatThinkingChars = (chars: number): string =>
  `${chars.toLocaleString("en-US")} 字`;

/**
 * Thinking message: a headline line, the newest reasoning while it streams, and
 * the full text behind a disclosure. The headline is what separates reasoning
 * from the tool card — tool rows are disclosures led by the tool name, so a
 * thinking row shaped the same way reads as one more tool call. When the turn
 * ends the headline becomes a digest (duration, size, tool count) and the
 * preview drops, leaving one calm line the reader never has to fold.
 */
export function renderTelegramThinkingRichBlocks(
  text: string,
  state: TelegramThinkingCardState = {},
): TelegramInputRichBlock[] {
  const chars =
    state.chars && state.chars > 0
      ? formatThinkingChars(state.chars)
      : undefined;
  const head: TelegramRichText[] = [
    state.finished
      ? {
          type: "bold",
          text: `🧠 Thought for ${Math.max(
            1,
            Math.round((state.durationMs ?? 0) / 1000),
          )}s`,
        }
      : { type: "bold", text: "🧠 Thinking…" },
  ];
  if (chars) head.push(" ", { type: "code", text: chars });
  if (state.finished && state.tools && state.tools > 0) {
    head.push(" · ", `🛠 ${state.tools}`);
  }
  const blocks: TelegramInputRichBlock[] = [{ type: "paragraph", text: head }];
  const preview = state.finished ? undefined : thinkingActivityPreview(text);
  if (preview) blocks.push({ type: "paragraph", text: preview });
  blocks.push({
    type: "details",
    // Size lives on the headline only — repeating it here read as a duplicate.
    summary: "展开全文",
    blocks: [{ type: "paragraph", text }],
  });
  return blocks;
}

export const TELEGRAM_THINKING_FOLD_CALLBACK_PREFIX = "think:fold:";

/**
 * Full-width closer row for a thinking card. A rich-message `buttons` block
 * sizes to its label, while a keyboard row with a single button spans the whole
 * bubble width — the trade is that the row sits under the bubble, not inside it.
 * `alternate` adds a trailing space so a repeat tap is a *changed* payload:
 * Telegram rejects an identical edit as "message is not modified", and the
 * accepted edit is what drops the client's expanded state.
 */
export function thinkingFoldKeyboard(
  messageId: number,
  alternate = false,
): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
  return {
    inline_keyboard: [
      [
        {
          text: alternate ? "收起 " : "收起",
          callback_data: `${TELEGRAM_THINKING_FOLD_CALLBACK_PREFIX}${messageId}`,
        },
      ],
    ],
  };
}

/** Taps seen per card, so the fold payload can differ on every tap. */
const thinkingFoldTaps = new Map<number, number>();

/** Cards whose reader asked to fold: further stream frames are pointless. */
const thinkingFoldRequested = new Set<number>();

export interface TelegramThinkingCardFold {
  messageId: number;
  target: TelegramTarget;
  text: string;
  chars: number;
  tools: number;
  durationMs: number;
}

const TELEGRAM_THINKING_CARD_CACHE_LIMIT = 20;
const thinkingCards = new Map<number, TelegramThinkingCardFold>();
type ThinkingFoldRequest = (
  chatId: number,
  messageId: number,
) => Promise<boolean>;
const thinkingFoldRequests: ThinkingFoldRequest[] = [];

/** Keep the newest card text so a tap can still fold it after the turn ended. */
function rememberThinkingCard(fold: TelegramThinkingCardFold): void {
  thinkingCards.delete(fold.messageId);
  thinkingCards.set(fold.messageId, fold);
  while (thinkingCards.size > TELEGRAM_THINKING_CARD_CACHE_LIMIT) {
    const oldest = thinkingCards.keys().next();
    if (oldest.done) break;
    thinkingCards.delete(oldest.value);
  }
}

export function registerTelegramThinkingFoldRequest(
  handler: ThinkingFoldRequest,
): () => void {
  thinkingFoldRequests.push(handler);
  return () => {
    const index = thinkingFoldRequests.indexOf(handler);
    if (index >= 0) thinkingFoldRequests.splice(index, 1);
  };
}

/** Fold the card behind a tap; false when no live runtime owns that message. */
export async function requestTelegramThinkingFold(
  chatId: number,
  messageId: number,
): Promise<boolean> {
  // Newest runtime first: the card belongs to whichever runtime cached it last,
  // so walk the registrations backwards instead of reversing a copy.
  for (let index = thinkingFoldRequests.length - 1; index >= 0; index -= 1) {
    const handler = thinkingFoldRequests[index];
    if (!handler) continue;
    try {
      if (await handler(chatId, messageId)) return true;
    } catch {
      // Another runtime may own the card; keep offering the request down the chain.
    }
  }
  return false;
}

/** Reasoning body for one message: the whole buffer, or its bounded tail. */
function buildTelegramThinkingRichMessage(
  text: string,
  blocks: TelegramInputRichBlock[] = renderTelegramThinkingRichBlocks(text),
): TelegramInputRichMessage {
  return { blocks, skip_entity_detection: true };
}

export interface TelegramActivityVerbosityRuntime {
  accept: (event: TelegramActivityEvent) => void;
  reset: () => void;
  stop: () => void;
  waitForIdle: () => Promise<void>;
}

export interface TelegramActivityVerbosityBinding
  extends TelegramActivityVerbosityRuntime {
  bind: (runtime: TelegramActivityVerbosityRuntime) => void;
}

export function createTelegramActivityVerbosityBinding(): TelegramActivityVerbosityBinding {
  let runtime: TelegramActivityVerbosityRuntime | undefined;
  return {
    bind(next) {
      runtime = next;
    },
    accept(event) {
      runtime?.accept(event);
    },
    reset() {
      runtime?.reset();
    },
    stop() {
      runtime?.stop();
    },
    waitForIdle() {
      return runtime?.waitForIdle() ?? Promise.resolve();
    },
  };
}

export function createTelegramActivityVerbosityRuntime<TAuthority>(deps: {
  enqueue?: TelegramActivityPublicationRuntime["enqueue"];
  getActivityMode: () => "quiet" | "thinking" | "tools" | "verbose";
  refreshActivityMode?: () => Promise<void>;
  getNowMs?: () => number;
  resolveTarget: (event: TelegramActivityEvent) => TelegramTarget | undefined;
  captureAuthority: () => TAuthority;
  isAuthorityActive: (authority: TAuthority) => boolean;
  sendMessage: (body: TelegramSendMessageBody) => Promise<TelegramSentMessage>;
  sendRichMessage: (
    body: TelegramSendRichMessageBody,
  ) => Promise<TelegramSentMessage>;
  editMessageText: (
    body: TelegramEditMessageTextBody,
  ) => Promise<"edited" | "unchanged">;
  recordFailure?: (
    operation:
      | "config-refresh"
      | "reasoning-send"
      | "reasoning-edit"
      | "reasoning-fold"
      | "tool-send"
      | "tool-edit",
    event: TelegramActivityEvent,
    error: unknown,
  ) => void;
}): TelegramActivityVerbosityRuntime {
  let active = true;
  let generation = 0;
  let tail = Promise.resolve();
  const getNowMs = deps.getNowMs ?? Date.now;
  let activityId: string | undefined;
  let authority: TAuthority | undefined;
  let target: TelegramTarget | undefined;
  let reasoningBuffer = "";
  let reasoningChars = 0;
  let reasoningMessageFrames = 0;
  let lastReasoningMessageChars = 0;
  let reasoningMessage: ReasoningMessage | undefined;
  /**
   * Thinking cards published this turn that still owe a fold. One entry per
   * message: a turn can reason more than once, and every card has to fold, not
   * just the newest one.
   */
  let reasoningFolds: TelegramThinkingCardFold[] = [];
  /** Completed tool calls this turn, shown in the thinking digest. */
  let turnToolCount = 0;
  let reasoningStartedMs: number | undefined;
  let reasoningBlocked = false;
  let lastReasoningPublishMs = 0;
  let toolMessage: ToolMessage | undefined;
  const tools = new Map<string, ToolActivity>();
  const toolOrder: string[] = [];

  const clearActivity = () => {
    activityId = undefined;
    authority = undefined;
    target = undefined;
    reasoningBuffer = "";
    reasoningChars = 0;
    reasoningMessageFrames = 0;
    lastReasoningMessageChars = 0;
    reasoningMessage = undefined;
    reasoningFolds = [];
    thinkingFoldRequested.clear();
    turnToolCount = 0;
    reasoningStartedMs = undefined;
    reasoningBlocked = false;
    lastReasoningPublishMs = 0;
    toolMessage = undefined;
    tools.clear();
    toolOrder.length = 0;
  };
  const hasAuthority = (): boolean =>
    authority !== undefined && deps.isAuthorityActive(authority);
  const isCurrent = (
    acceptedGeneration: number,
    admittedAuthority: TAuthority | undefined,
  ): boolean =>
    active &&
    generation === acceptedGeneration &&
    admittedAuthority !== undefined &&
    deps.isAuthorityActive(admittedAuthority);
  const ensureActivity = (
    event: TelegramActivityEvent,
    admittedTarget: TelegramTarget | undefined,
    admittedAuthority: TAuthority,
  ): boolean => {
    if (deps.getActivityMode() === "quiet") return false;
    if (activityId === event.activityId) return hasAuthority();
    clearActivity();
    if (!admittedTarget) return false;
    activityId = event.activityId;
    target = admittedTarget;
    authority = admittedAuthority;
    return hasAuthority();
  };
  const closeToolBatch = () => {
    toolMessage = undefined;
  };
  const publishReasoning = async (
    event: TelegramActivityEvent,
    acceptedGeneration: number,
  ) => {
    const admittedAuthority = authority;
    if (
      !isCurrent(acceptedGeneration, admittedAuthority) ||
      !target ||
      reasoningBlocked
    ) {
      return;
    }
    if (
      reasoningMessage &&
      thinkingFoldRequested.has(reasoningMessage.messageId)
    ) {
      return;
    }
    let retained = reasoningBuffer;
    let publishedText = retained;
    let message = buildTelegramThinkingRichMessage(retained);
    do {
      const omitted = reasoningChars - retained.length;
      const text = redactActivityText(
        omitted > 0 ? `…\n${retained}` : retained,
      );
      publishedText = text;
      message = buildTelegramThinkingRichMessage(
        text,
        renderTelegramThinkingRichBlocks(text, { chars: reasoningChars }),
      );
      if (text.length <= TELEGRAM_REASONING_MESSAGE_MAX_CHARS) break;
      retained = retained.slice(
        -Math.max(1, Math.floor(retained.length * 0.75)),
      );
    } while (retained.length > 1);
    const canEdit =
      reasoningMessage && targetEquals(reasoningMessage.target, target);
    try {
      if (canEdit && reasoningMessage) {
        await deps.editMessageText({
          chat_id: target.chatId,
          message_id: reasoningMessage.messageId,
          rich_message: message,
          // The reader can close the card as soon as the button exists.
          reply_markup: thinkingFoldKeyboard(reasoningMessage.messageId),
        });
      } else {
        const sent = await deps.sendRichMessage({
          chat_id: target.chatId,
          ...(target.threadId === undefined
            ? {}
            : { message_thread_id: target.threadId }),
          rich_message: message,
          link_preview_options: { is_disabled: true },
        });
        if (!isCurrent(acceptedGeneration, admittedAuthority)) return;
        reasoningMessage = {
          messageId: sent.message_id,
          target: { ...target },
        };
      }
      if (!isCurrent(acceptedGeneration, admittedAuthority)) return;
      reasoningMessageFrames += 1;
      lastReasoningMessageChars = reasoningChars;
      lastReasoningPublishMs = getNowMs();
      if (reasoningMessage) {
        const entry: TelegramThinkingCardFold = {
          messageId: reasoningMessage.messageId,
          target: { ...reasoningMessage.target },
          text: publishedText,
          chars: reasoningChars,
          tools: turnToolCount,
          durationMs:
            reasoningStartedMs === undefined
              ? 0
              : getNowMs() - reasoningStartedMs,
        };
        rememberThinkingCard(entry);
        const index = reasoningFolds.findIndex(
          (item) => item.messageId === entry.messageId,
        );
        if (index >= 0) reasoningFolds[index] = entry;
        else reasoningFolds.push(entry);
      }
    } catch (error) {
      if (!isCurrent(acceptedGeneration, admittedAuthority)) return;
      reasoningBlocked = true;
      deps.recordFailure?.(
        canEdit ? "reasoning-edit" : "reasoning-send",
        event,
        error,
      );
    }
  };
  /** Rewrite a thinking card as its one-line digest, with the closer button. */
  const applyThinkingFold = async (
    entry: TelegramThinkingCardFold,
    highlighted = false,
  ) => {
    await deps.editMessageText({
      chat_id: entry.target.chatId,
      message_id: entry.messageId,
      rich_message: buildTelegramThinkingRichMessage(
        entry.text,
        renderTelegramThinkingRichBlocks(entry.text, {
          chars: entry.chars,
          tools: entry.tools,
          durationMs: entry.durationMs,
          finished: true,
        }),
      ),
      reply_markup: thinkingFoldKeyboard(entry.messageId, highlighted),
    });
  };

  const foldReasoningCard = async (
    entry: TelegramThinkingCardFold,
    event: TelegramActivityEvent,
    acceptedGeneration: number,
  ) => {
    try {
      await applyThinkingFold(entry);
    } catch (error) {
      if (!isCurrent(acceptedGeneration, authority)) return;
      deps.recordFailure?.("reasoning-fold", event, error);
    }
  };

  // The "收起" button under a card asks the owning runtime to fold it; the card
  // text is cached above because the tap can arrive long after the turn ended.
  const unregisterThinkingFoldRequest = registerTelegramThinkingFoldRequest(
    async (chatId, messageId) => {
      const entry = thinkingCards.get(messageId);
      if (!entry || entry.target.chatId !== chatId) return false;
      const taps = (thinkingFoldTaps.get(messageId) ?? 0) + 1;
      thinkingFoldTaps.set(messageId, taps);
      // Stop feeding the chat: at Telegram's per-chat edit throttle every new
      // frame queues in front of the fold the reader just asked for.
      thinkingFoldRequested.add(messageId);
      await applyThinkingFold(entry, taps % 2 === 1);
      return true;
    },
  );

  /** Take the newest card awaiting a fold, or one specific card by id. */
  const takeReasoningFold = (
    messageId?: number,
  ): TelegramThinkingCardFold | undefined => {
    const index =
      messageId === undefined
        ? reasoningFolds.length - 1
        : reasoningFolds.findIndex((item) => item.messageId === messageId);
    if (index < 0) return undefined;
    return reasoningFolds.splice(index, 1)[0];
  };

  const publishTool = async (
    event: TelegramActivityEvent,
    tool: ToolActivity,
    acceptedGeneration: number,
  ) => {
    const admittedAuthority = authority;
    if (!isCurrent(acceptedGeneration, admittedAuthority) || !target) {
      return;
    }
    const canAppend =
      toolMessage &&
      targetEquals(toolMessage.target, target) &&
      toolMessage.tools.length < TELEGRAM_ACTIVITY_MESSAGE_MAX_TOOLS &&
      toolMessageSize([...toolMessage.tools, tool]) <=
        TELEGRAM_ACTIVITY_MESSAGE_MAX_CHARS;
    try {
      if (canAppend && toolMessage) {
        const nextTools = [...toolMessage.tools, tool];
        try {
          await deps.editMessageText({
            chat_id: target.chatId,
            message_id: toolMessage.messageId,
            ...(toolMessage.format === "rich"
              ? {
                  rich_message:
                    renderTelegramToolActivityRichMessage(nextTools),
                }
              : {
                  text: renderTelegramToolActivityHtml(nextTools),
                  parse_mode: "HTML" as const,
                  link_preview_options: { is_disabled: true },
                }),
          });
        } catch (error) {
          if (!isCurrent(acceptedGeneration, admittedAuthority)) return;
          if (
            toolMessage.format !== "rich" ||
            !isKnownSafeRichActivityRejection(error)
          ) {
            throw error;
          }
          await deps.editMessageText({
            chat_id: target.chatId,
            message_id: toolMessage.messageId,
            text: renderTelegramToolActivityHtml(nextTools),
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
          });
          if (!isCurrent(acceptedGeneration, admittedAuthority)) return;
          toolMessage.format = "html";
        }
        if (!isCurrent(acceptedGeneration, admittedAuthority)) return;
        toolMessage.tools = nextTools;
        return;
      }
      const body = {
        chat_id: target.chatId,
        ...(target.threadId === undefined
          ? {}
          : { message_thread_id: target.threadId }),
      };
      let sent: TelegramSentMessage;
      let format: ToolMessage["format"] = "rich";
      try {
        sent = await deps.sendRichMessage({
          ...body,
          rich_message: renderTelegramToolActivityRichMessage([tool]),
        });
      } catch (error) {
        if (!isCurrent(acceptedGeneration, admittedAuthority)) return;
        if (!isKnownSafeRichActivityRejection(error)) throw error;
        sent = await deps.sendMessage({
          ...body,
          text: renderTelegramToolActivityHtml([tool]),
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        });
        format = "html";
      }
      if (!isCurrent(acceptedGeneration, admittedAuthority)) return;
      toolMessage = {
        messageId: sent.message_id,
        tools: [tool],
        target: { ...target },
        format,
      };
    } catch (error) {
      if (!isCurrent(acceptedGeneration, admittedAuthority)) return;
      closeToolBatch();
      deps.recordFailure?.(canAppend ? "tool-edit" : "tool-send", event, error);
    }
  };
  const process = async (
    event: TelegramActivityEvent,
    acceptedGeneration: number,
    admittedTarget: TelegramTarget | undefined,
    admittedAuthority: TAuthority,
  ) => {
    if (event.type === "agent-start" && deps.refreshActivityMode) {
      try {
        await deps.refreshActivityMode();
      } catch (error) {
        if (!isCurrent(acceptedGeneration, admittedAuthority)) return;
        clearActivity();
        activityId = event.activityId;
        deps.recordFailure?.("config-refresh", event, error);
        return;
      }
    }
    if (!isCurrent(acceptedGeneration, admittedAuthority)) return;
    if (!ensureActivity(event, admittedTarget, admittedAuthority)) {
      if (
        activityId === event.activityId &&
        deps.getActivityMode() === "quiet"
      ) {
        clearActivity();
      }
      return;
    }
    const mode = deps.getActivityMode();
    const showThinking = mode === "thinking" || mode === "verbose";
    const showTools = mode === "tools" || mode === "verbose";
    if (
      event.type === "assistant-text-delta" ||
      event.type === "assistant-segment" ||
      event.type === "reasoning-delta" ||
      event.type === "reasoning-end"
    ) {
      closeToolBatch();
    }
    if (event.type === "reasoning-delta") {
      if (!showThinking) return;
      reasoningStartedMs ??= getNowMs();
      reasoningChars += event.delta.length;
      reasoningBuffer = `${reasoningBuffer}${event.delta}`.slice(
        -TELEGRAM_REASONING_BUFFER_MAX_CHARS,
      );
      if (
        reasoningMessageFrames < TELEGRAM_REASONING_MESSAGE_MAX_FRAMES &&
        (reasoningMessageFrames === 0 ||
          (getNowMs() - lastReasoningPublishMs >=
            TELEGRAM_REASONING_MIN_INTERVAL_MS &&
            reasoningChars - lastReasoningMessageChars >= 160))
      ) {
        await publishReasoning(event, acceptedGeneration);
      }
      return;
    }
    if (event.type === "reasoning-end") {
      if (!showThinking) return;
      if (reasoningChars === 0 && event.text) {
        reasoningChars = event.text.length;
        reasoningBuffer = event.text.slice(
          -TELEGRAM_REASONING_BUFFER_MAX_CHARS,
        );
      }
      if (
        reasoningChars > 0 &&
        reasoningChars > lastReasoningMessageChars &&
        !reasoningBlocked
      ) {
        await publishReasoning(event, acceptedGeneration);
      }
      if (!isCurrent(acceptedGeneration, admittedAuthority)) return;
      // This reasoning segment is over: fold its card now, so the reader never
      // has to scroll back to the summary row to close a long wall of text.
      const finished = takeReasoningFold();
      if (finished) {
        await foldReasoningCard(finished, event, acceptedGeneration);
        if (!isCurrent(acceptedGeneration, admittedAuthority)) return;
      }
      reasoningBuffer = "";
      reasoningChars = 0;
      reasoningMessageFrames = 0;
      lastReasoningMessageChars = 0;
      lastReasoningPublishMs = 0;
      reasoningMessage = undefined;
      reasoningBlocked = false;
      return;
    }
    if (event.type === "tool-start") {
      if (!showTools) return;
      tools.set(event.toolCallId, {
        id: event.toolCallId,
        name: event.toolName,
        args: serializeActivityValue(event.args),
        updates: [],
        droppedUpdates: 0,
        complete: false,
      });
      toolOrder.push(event.toolCallId);
      return;
    }
    if (event.type === "tool-update") {
      if (!showTools) return;
      const tool = tools.get(event.toolCallId);
      if (!tool) return;
      tool.updates.push(serializeActivityValue(event.update));
      if (tool.updates.length > TELEGRAM_TOOL_UPDATE_MAX_ENTRIES) {
        tool.updates.shift();
        tool.droppedUpdates += 1;
      }
      return;
    }
    if (event.type === "tool-end") {
      turnToolCount += 1;
      if (!showTools) return;
      const tool = tools.get(event.toolCallId) ?? {
        id: event.toolCallId,
        name: event.toolName,
        args: serializeActivityValue(undefined),
        updates: [],
        droppedUpdates: 0,
        complete: false,
      };
      if (!tools.has(event.toolCallId)) toolOrder.push(event.toolCallId);
      tool.result = serializeActivityValue(event.result);
      tool.isError = event.isError;
      tool.complete = true;
      tools.set(event.toolCallId, tool);
      while (toolOrder.length > 0) {
        const next = tools.get(toolOrder[0]!);
        if (!next?.complete) break;
        toolOrder.shift();
        tools.delete(next.id);
        await publishTool(event, next, acceptedGeneration);
        if (!isCurrent(acceptedGeneration, admittedAuthority)) return;
      }
      return;
    }
    if (event.type === "agent-end" || event.type === "agent-settled") {
      if (
        reasoningMessage &&
        reasoningChars > lastReasoningMessageChars &&
        !reasoningBlocked
      ) {
        await publishReasoning(event, acceptedGeneration);
      }
      if (!isCurrent(acceptedGeneration, admittedAuthority)) return;
      const pendingFolds = reasoningFolds;
      reasoningFolds = [];
      for (const entry of pendingFolds) {
        await foldReasoningCard(entry, event, acceptedGeneration);
        if (!isCurrent(acceptedGeneration, admittedAuthority)) return;
      }
      clearActivity();
    }
  };
  return {
    accept(event) {
      if (!active) return;
      const acceptedGeneration = generation;
      const resolvedTarget = deps.resolveTarget(event);
      const admittedTarget = resolvedTarget ? { ...resolvedTarget } : undefined;
      const admittedAuthority = deps.captureAuthority();
      const enqueue =
        deps.enqueue ?? ((task: () => Promise<void>) => tail.then(task));
      tail = enqueue(async () => {
        if (
          !active ||
          generation !== acceptedGeneration ||
          !deps.isAuthorityActive(admittedAuthority)
        )
          return;
        await process(
          event,
          acceptedGeneration,
          admittedTarget,
          admittedAuthority,
        );
      }).catch((error) => {
        deps.recordFailure?.("tool-send", event, error);
      });
    },
    reset() {
      generation += 1;
      clearActivity();
      tail = Promise.resolve();
    },
    stop() {
      active = false;
      generation += 1;
      unregisterThinkingFoldRequest();
      clearActivity();
      tail = Promise.resolve();
    },
    waitForIdle() {
      return tail;
    },
  };
}
