/**
 * Telegram rich-message block builders
 * Zones: telegram ui, shared structure
 * Owns the small validating builders feature domains use to describe structured
 * output. Block shapes themselves belong to the transport contract in
 * ./telegram-api.ts; this module only shapes, validates, and reports them.
 */

import type {
  TelegramInputRichBlock,
  TelegramInputRichTableCell,
  TelegramRichText,
} from "./telegram-api.ts";

export type {
  TelegramInputRichBlock,
  TelegramInputRichTableCell,
  TelegramRichText,
};

/** The verified block shapes this module builds. */
export type TelegramTableBlock = Extract<
  TelegramInputRichBlock,
  { type: "table" }
>;
export type TelegramDetailsBlock = Extract<
  TelegramInputRichBlock,
  { type: "details" }
>;
export type TelegramParagraphBlock = Extract<
  TelegramInputRichBlock,
  { type: "paragraph" }
>;

/**
 * Raised when a caller asks for a block Telegram would render as garbage or
 * reject. Callers see a named error with the offending shape instead of a
 * silently dropped or mangled message.
 */
export class TelegramRichBlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramRichBlockError";
  }
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
export function buildTelegramTableBlock(
  input: TelegramTableBlockInput,
): TelegramTableBlock {
  const { rows } = input;
  if (rows.length === 0) {
    throw new TelegramRichBlockError("Rich table needs at least one row.");
  }
  const columns = rows[0]?.length ?? 0;
  if (columns === 0) {
    throw new TelegramRichBlockError("Rich table needs at least one column.");
  }
  rows.forEach((row, index) => {
    if (row.length !== columns) {
      throw new TelegramRichBlockError(
        `Rich table row ${index + 1} has ${row.length} cells; expected ${columns}.`,
      );
    }
  });
  const header = input.header ?? true;
  const cells: TelegramInputRichTableCell[][] = rows.map((row, rowIndex) =>
    row.map((text, columnIndex) => {
      const align = input.align?.[columnIndex];
      return {
        text,
        ...(header && rowIndex === 0 ? { is_header: true as const } : {}),
        ...(align ? { align } : {}),
      };
    }),
  );
  return {
    type: "table",
    cells,
    ...(input.bordered ? { is_bordered: true as const } : {}),
    ...(input.striped ? { is_striped: true as const } : {}),
    ...(input.compact ? { is_compact: true as const } : {}),
    ...(input.caption === undefined ? {} : { caption: input.caption }),
  };
}

/** Build a collapsible `details` block. */
export function buildTelegramDetailsBlock(
  summary: TelegramRichText,
  blocks: readonly TelegramInputRichBlock[],
  options: { open?: boolean } = {},
): TelegramDetailsBlock {
  if (typeof summary === "string" && !summary.trim()) {
    throw new TelegramRichBlockError("Rich details block needs a summary.");
  }
  if (blocks.length === 0) {
    throw new TelegramRichBlockError(
      "Rich details block needs at least one child block.",
    );
  }
  return {
    type: "details",
    summary,
    blocks: [...blocks],
    ...(options.open ? { is_open: true as const } : {}),
  };
}

/** Build a plain `paragraph` block. */
export function buildTelegramParagraphBlock(
  text: TelegramRichText,
): TelegramParagraphBlock {
  return { type: "paragraph", text };
}
