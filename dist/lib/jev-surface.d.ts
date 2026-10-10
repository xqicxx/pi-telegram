export type SurfaceCandidate = {
    id: string;
    label: string;
    prompt: string;
    readonly impact?: string;
    readonly row?: string;
};
export type SurfaceButton = {
    label: string;
    prompt: string;
};
export type SurfaceDecision = {
    choice: "keep" | "drop";
    keep: number;
    confidence: number;
};
export type SystemOneAnswer = {
    type?: string;
    choice?: string;
    confidence?: number;
    probabilities?: Record<string, number>;
};
export type SystemOneResponse = {
    answers?: Record<string, SystemOneAnswer>;
    usage?: Record<string, number>;
};
export type SystemOneQuestion = {
    type: "choice";
    criteria: Record<string, Record<string, unknown>>;
    instructions: {
        goal: string;
    };
};
export type SystemOneBody = {
    model: string;
    state: unknown;
    questions: Record<string, SystemOneQuestion>;
};
export type ProjectedSurface = {
    rows: SurfaceButton[][];
    decisions: Record<string, SurfaceDecision>;
    dropped: string[];
};
export declare function buildSystemOneBody(state: Record<string, unknown>, candidates: readonly SurfaceCandidate[], model?: string): SystemOneBody;
/** Strict validation: any suspicious shape, out-of-range value, or argmax mismatch throws instead of guessing. */
export declare function validateAnswer(id: string, answer: SystemOneAnswer | undefined): SurfaceDecision;
/** Judgment supplies membership and order; labels, prompts, and rows stay deterministic. */
export declare function projectSurface(answers: Record<string, SystemOneAnswer>, candidates: readonly SurfaceCandidate[], maxRows?: number): ProjectedSurface;
/** The judgment layer stays transport-neutral: each renderer serializes rows into the markup its own transport parses. */
export declare function renderTelegramSurface(rows: readonly (readonly SurfaceButton[])[]): string;
/** The endpoint sits behind Cloudflare, so a browser-fingerprinted curl is the transport that reaches it. */
export declare function callSystemOne(body: Record<string, unknown>): SystemOneResponse;
