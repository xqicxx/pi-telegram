/**
 * Bridge-owned Telegram activity verbosity projection
 * Zones: telegram activity, rich rendering, operational delivery
 * Owns persistent bounded thinking and tool disclosures; excludes activity normalization, assistant answer rendering, and transport authority policy
 */
import type { TelegramActivityEvent, TelegramActivityPublicationRuntime } from "./activity.ts";
import { type TelegramTarget } from "./target.ts";
import type { TelegramEditMessageTextBody, TelegramInputRichBlock, TelegramInputRichMessage, TelegramSendMessageBody, TelegramSendRichMessageBody, TelegramSentMessage } from "./telegram-api.ts";
export declare const TELEGRAM_ACTIVITY_MESSAGE_MAX_TOOLS = 6;
export declare const TELEGRAM_REASONING_MESSAGE_MAX_FRAMES = 24;
export declare const TELEGRAM_REASONING_BUFFER_MAX_CHARS = 16000;
export declare const TELEGRAM_REASONING_MIN_INTERVAL_MS = 1200;
export declare const TELEGRAM_TOOL_UPDATE_MAX_ENTRIES = 4;
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
export declare function renderTelegramToolActivityHtml(tools: readonly ToolActivity[]): string;
export declare function renderTelegramToolActivityRichMessage(tools: readonly ToolActivity[]): TelegramInputRichMessage;
/** Chars of reasoning shown on the live thinking line. */
export declare const TELEGRAM_THINKING_PREVIEW_MAX_CHARS = 60;
/**
 * One line of the newest reasoning, so the collapsed card stays three rows tall
 * however long the model thinks. Newlines collapse: a preview that grows into a
 * wall of text defeats the point of folding the card.
 */
export declare function thinkingActivityPreview(text: string): string | undefined;
export interface TelegramThinkingCardState {
    chars?: number;
    tools?: number;
    durationMs?: number;
    finished?: boolean;
    /** When set, the card carries an in-bubble 收起 button for that message. */
    foldMessageId?: number;
    foldHighlighted?: boolean;
}
/**
 * Thinking message: a headline line, the newest reasoning while it streams, and
 * the full text behind a disclosure. The headline is what separates reasoning
 * from the tool card — tool rows are disclosures led by the tool name, so a
 * thinking row shaped the same way reads as one more tool call. When the turn
 * ends the headline becomes a digest (duration, size, tool count) and the
 * preview drops, leaving one calm line the reader never has to fold.
 */
export declare function renderTelegramThinkingRichBlocks(text: string, state?: TelegramThinkingCardState): TelegramInputRichBlock[];
export declare const TELEGRAM_THINKING_FOLD_CALLBACK_PREFIX = "think:fold:";
export declare const TELEGRAM_THINKING_FULL_CALLBACK_PREFIX = "think:full:";
/**
 * Full-width closer row for a thinking card. A rich-message `buttons` block
 * sizes to its label, while a keyboard row with a single button spans the whole
 * bubble width — the trade is that the row sits under the bubble, not inside it.
 * `alternate` adds a trailing space so a repeat tap is a *changed* payload:
 * Telegram rejects an identical edit as "message is not modified", and the
 * accepted edit is what drops the client's expanded state.
 */
export declare function thinkingFoldKeyboard(messageId: number, alternate?: boolean): {
    inline_keyboard: Array<Array<{
        text: string;
        callback_data: string;
    }>>;
};
export interface TelegramThinkingCardFold {
    messageId: number;
    target: TelegramTarget;
    text: string;
    chars: number;
    tools: number;
    durationMs: number;
}
type ThinkingFoldRequest = (chatId: number, messageId: number) => Promise<boolean>;
/** A live runtime answers with the unbounded text for one of its cards. */
type ThinkingFullTextRequest = (chatId: number, messageId: number) => Promise<string | undefined>;
/** `requestTelegramThinkingFullText` returns the first runtime that owns it. */
export declare function registerTelegramThinkingFullTextRequest(handler: ThinkingFullTextRequest): () => void;
/** Full text for a card; undefined once no live runtime still caches it. */
export declare function requestTelegramThinkingFullText(chatId: number, messageId: number): Promise<string | undefined>;
/** Bounded expanded body: the tail lives in the `.txt` document. */
export declare function clipTelegramThinkingBody(text: string): string;
export declare function registerTelegramThinkingFoldRequest(handler: ThinkingFoldRequest): () => void;
/** Fold the card behind a tap; false when no live runtime owns that message. */
export declare function requestTelegramThinkingFold(chatId: number, messageId: number): Promise<boolean>;
export interface TelegramActivityVerbosityRuntime {
    accept: (event: TelegramActivityEvent) => void;
    reset: () => void;
    stop: () => void;
    waitForIdle: () => Promise<void>;
}
export declare function createTelegramActivityVerbosityRuntime<TAuthority>(deps: {
    enqueue?: TelegramActivityPublicationRuntime["enqueue"];
    getActivityMode: () => "quiet" | "thinking" | "tools" | "verbose";
    refreshActivityMode?: () => Promise<void>;
    getNowMs?: () => number;
    resolveTarget: (event: TelegramActivityEvent) => TelegramTarget | undefined;
    captureAuthority: () => TAuthority;
    isAuthorityActive: (authority: TAuthority) => boolean;
    sendMessage: (body: TelegramSendMessageBody) => Promise<TelegramSentMessage>;
    /** 活动状态消息钉在聊天顶部；不提供就完全不 pin。 */
    pinMessage?: (chatId: number, messageId: number) => Promise<void>;
    unpinMessage?: (chatId: number, messageId: number) => Promise<void>;
    sendRichMessage: (body: TelegramSendRichMessageBody) => Promise<TelegramSentMessage>;
    editMessageText: (body: TelegramEditMessageTextBody) => Promise<"edited" | "unchanged">;
    recordFailure?: (operation: "config-refresh" | "reasoning-send" | "reasoning-edit" | "reasoning-fold" | "tool-send" | "tool-edit", event: TelegramActivityEvent, error: unknown) => void;
}): TelegramActivityVerbosityRuntime;
export {};
