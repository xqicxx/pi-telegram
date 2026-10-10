/**
 * Telegram rich-message block builders
 * Zones: telegram ui, shared structure
 * Owns the small validating builders feature domains use to describe structured
 * output. Block shapes themselves belong to the transport contract in
 * ./telegram-api.ts; this module only shapes, validates, and reports them.
 */
import type { TelegramInputRichBlock, TelegramInputRichTableCell, TelegramRichText } from "./telegram-api.ts";
export type { TelegramInputRichBlock, TelegramInputRichTableCell, TelegramRichText, };
/** The verified block shapes this module builds. */
export type TelegramTableBlock = Extract<TelegramInputRichBlock, {
    type: "table";
}>;
export type TelegramDetailsBlock = Extract<TelegramInputRichBlock, {
    type: "details";
}>;
export type TelegramParagraphBlock = Extract<TelegramInputRichBlock, {
    type: "paragraph";
}>;
/**
 * Raised when a caller asks for a block Telegram would render as garbage or
 * reject. Callers see a named error with the offending shape instead of a
 * silently dropped or mangled message.
 */
export declare class TelegramRichBlockError extends Error {
    constructor(message: string);
}
export interface TelegramTableBlockInput {
    /** Row-major cell text; the first row is the header row unless `header` is false. */
    rows: readonly (readonly TelegramRichText[])[];
    header?: boolean;
    bordered?: boolean;
    striped?: boolean;
    /** Tighter cell indents, for dense operator cards. */
    compact?: boolean;
    caption?: TelegramRichText;
    /** Per-column alignment; extra entries are ignored. */
    align?: readonly ("left" | "center" | "right")[];
}
/** Build a `table` block, rejecting shapes Telegram renders as garbage. */
export declare function buildTelegramTableBlock(input: TelegramTableBlockInput): TelegramTableBlock;
/** Build a collapsible `details` block. */
export declare function buildTelegramDetailsBlock(summary: TelegramRichText, blocks: readonly TelegramInputRichBlock[], options?: {
    open?: boolean;
}): TelegramDetailsBlock;
/** Build a plain `paragraph` block. */
export declare function buildTelegramParagraphBlock(text: TelegramRichText): TelegramParagraphBlock;
