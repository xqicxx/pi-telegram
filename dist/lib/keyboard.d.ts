/**
 * Telegram inline-keyboard structural contracts
 * Zones: telegram ui, shared structure
 * Owns the shared Bot API reply-markup shape while feature domains own their button semantics
 */
export type TelegramInlineKeyboardButtonStyle = "danger" | "success" | "primary";
export type TelegramInlineKeyboardButton = {
    text: string;
    style?: TelegramInlineKeyboardButtonStyle;
} & ({
    callback_data: string;
    disabled?: never;
} | {
    disabled: Record<string, never>;
    callback_data?: never;
});
export interface TelegramInlineKeyboardMarkup {
    inline_keyboard: TelegramInlineKeyboardButton[][];
    /** Bot API 10.3: also open the client reply box aimed at this message. */
    force_reply?: boolean;
}
/** Reply markup that opens the client reply box without showing buttons. */
export interface TelegramForceReplyMarkup {
    force_reply: true;
    input_field_placeholder?: string;
}
/** Any reply markup the bridge may attach to an outbound message. */
export type TelegramReplyMarkup = TelegramInlineKeyboardMarkup | TelegramForceReplyMarkup;
export declare function assertTelegramCallbackData(callbackData: string, context?: string): string;
export declare function assertTelegramInlineKeyboardCallbackData(replyMarkup: unknown, context?: string): void;
