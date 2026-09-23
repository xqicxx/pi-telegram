/**
 * Jev control-surface selection layer
 * Zones: telegram ui, shared structure
 * Owns candidate-to-surface judgments: one System One choice per candidate, strict answer validation, and deterministic projection into ordered button rows
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type SurfaceCandidate = {
  id: string;
  label: string;
  prompt: string;
  readonly impact?: string;
  readonly row?: string;
};

export type SurfaceButton = { label: string; prompt: string };

export type SurfaceDecision = { choice: "keep" | "drop"; keep: number; confidence: number };

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
  instructions: { goal: string };
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

const DEFAULT_MODEL = "typesafe/jev";
/** Transport ceilings mirror lib/outbound-buttons.ts: the compact matrix parser takes at most four atoms per row. */
const MAX_BUTTONS_PER_ROW = 4;
/** A label must open with a semantic emoji followed by exactly one ASCII space; variation selectors and ZWJ sequences belong to the emoji. */
const LABEL_PREFIX = /^[^\p{L}\p{N}\p{P}\s](?:\uFE0E|\uFE0F|\u200D|\p{Extended_Pictographic}|\p{Emoji_Component})* /u;
/** Matrix atoms delimit on these, so a payload carrying one cannot be rendered. */
const UNSAFE_IN_ATOM = /[{}|\n\r]/u;
const MIN_KEEP = 2;
const DEFAULT_MAX_ROWS = 6;

function apiKey(): string {
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY;
  const file = join(homedir(), ".pi", "agent", "auth.json");
  try {
    const auth = JSON.parse(readFileSync(file, "utf8")) as { commandcode?: { key?: string } };
    const key = auth.commandcode?.key;
    if (!key) throw new Error("auth.json 里没有 commandcode.key");
    return key;
  } catch (error) {
    throw new Error(
      `jev-surface: 读不到 CC 的 key ✗ → 设 TYPESAFE_API_KEY 或检查 ${file}（${(error as Error).message}）`,
    );
  }
}

function baseUrl(): string {
  return (process.env.TYPESAFE_BASE_URL ?? "https://api.commandcode.ai/provider").replace(/\/+$/, "");
}

export function buildSystemOneBody(
  state: Record<string, unknown>,
  candidates: readonly SurfaceCandidate[],
  model = process.env.TYPESAFE_MODEL ?? DEFAULT_MODEL,
): SystemOneBody {
  return {
    model,
    state,
    questions: Object.fromEntries(
      candidates.map((candidate) => [
        `keep_${candidate.id}`,
        {
          type: "choice",
          criteria: {
            keep: { label: candidate.label, prompt: candidate.prompt, impact: candidate.impact ?? "ordinary" },
            drop: { reason: "这一面不需要它" },
          },
          instructions: { goal: "该动作是否进入本次控制面：能不能降低用户回复的成本或歧义" },
        },
      ]),
    ),
  };
}

/** Strict validation: any suspicious shape, out-of-range value, or argmax mismatch throws instead of guessing. */
export function validateAnswer(id: string, answer: SystemOneAnswer | undefined): SurfaceDecision {
  const probabilities = answer?.probabilities;
  const keep = probabilities?.keep;
  const drop = probabilities?.drop;
  if (answer?.type !== "choice" || typeof keep !== "number" || typeof drop !== "number") {
    throw new Error(`jev-surface: 回答形状非法（${id}）`);
  }
  const numbers = [keep, drop, answer.confidence ?? Number.NaN];
  if (!numbers.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new Error(`jev-surface: 概率越界（${id}）`);
  }
  if (Math.abs(keep + drop - 1) > 0.02) throw new Error(`jev-surface: 概率不归一（${id}）`);
  const argmax = keep >= drop ? "keep" : "drop";
  if (answer.choice !== argmax) throw new Error(`jev-surface: choice 与概率不一致（${id}）`);
  return { choice: argmax, keep, confidence: answer.confidence ?? keep };
}

/** Judgment supplies membership and order; labels, prompts, and rows stay deterministic. */
export function projectSurface(
  answers: Record<string, SystemOneAnswer>,
  candidates: readonly SurfaceCandidate[],
  maxRows = DEFAULT_MAX_ROWS,
): ProjectedSurface {
  const decisions: Record<string, SurfaceDecision> = {};
  const kept: Array<SurfaceCandidate & { keep: number }> = [];
  for (const candidate of candidates) {
    const decision = validateAnswer(candidate.id, answers[`keep_${candidate.id}`]);
    decisions[candidate.id] = decision;
    if (decision.choice === "keep") kept.push({ ...candidate, keep: decision.keep });
  }
  if (kept.length < MIN_KEEP) {
    const ranked = [...candidates].sort((a, b) => decisions[b.id].keep - decisions[a.id].keep);
    kept.length = 0;
    for (const candidate of ranked.slice(0, MIN_KEEP)) {
      kept.push({ ...candidate, keep: decisions[candidate.id].keep });
    }
  }
  kept.sort((a, b) => b.keep - a.keep);
  const chosen = kept.slice(0, Math.max(MIN_KEEP, Math.min(maxRows, kept.length)));
  const rows: Array<{ key: string; buttons: SurfaceButton[] }> = [];
  for (const candidate of chosen) {
    const key = candidate.row ?? candidate.id;
    const last = rows.at(-1);
    if (last && last.key === key) last.buttons.push({ label: candidate.label, prompt: candidate.prompt });
    else rows.push({ key, buttons: [{ label: candidate.label, prompt: candidate.prompt }] });
  }
  const chosenIds = new Set(chosen.map((candidate) => candidate.id));
  return {
    rows: rows.map((row) => row.buttons),
    decisions,
    dropped: candidates.filter((candidate) => !chosenIds.has(candidate.id)).map((candidate) => candidate.id),
  };
}

/** The judgment layer stays transport-neutral: each renderer serializes rows into the markup its own transport parses. */
export function renderTelegramSurface(rows: readonly (readonly SurfaceButton[])[]): string {
  if (rows.length === 0) throw new Error("jev-surface: 空面 ✗ 至少要一行 ✓");
  return rows
    .map((row) => {
      if (row.length === 0) throw new Error("jev-surface: 空行 ✗");
      if (row.length > MAX_BUTTONS_PER_ROW) {
        throw new Error(`jev-surface: 一行最多 ${MAX_BUTTONS_PER_ROW} 个按钮 ✗（收到 ${row.length}）`);
      }
      const atoms = row.map((button) => {
        if (!LABEL_PREFIX.test(button.label)) {
          throw new Error(`jev-surface: 标签必须以语义 emoji + 一个 ASCII 空格开头 ✗（${button.label}）`);
        }
        const proof = button.prompt.trim();
        if (!proof) throw new Error(`jev-surface: 提示不能为空 ✗（${button.label}）`);
        for (const [field, value] of [["label", button.label], ["prompt", proof]] as const) {
          if (UNSAFE_IN_ATOM.test(value)) {
            throw new Error(`jev-surface: ${field} 含 { } | 或换行 ✗ 会把矩阵拆坏（${button.label}）`);
          }
        }
        return `{${button.label}|${proof}}`;
      });
      return `<!-- telegram_button [${atoms.join("")}] -->`;
    })
    .join("\n");
}

/** The endpoint sits behind Cloudflare, so a browser-fingerprinted curl is the transport that reaches it. */
export function callSystemOne(body: Record<string, unknown>): SystemOneResponse {
  let output: string;
  try {
    output = execFileSync(
      "curl",
      [
        "-sS", "--max-time", "120", "-X", "POST", `${baseUrl()}/v1/systemone`,
        "-H", `Authorization: Bearer ${apiKey()}`,
        "-H", "Content-Type: application/json",
        "-H", "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        "--data-binary", "@-",
      ],
      { input: JSON.stringify(body), encoding: "utf8", maxBuffer: 8 << 20 },
    );
  } catch (error) {
    throw new Error(`jev-surface: 调 CC 的 systemone 失败 ✗（${(error as Error).message}）`);
  }
  let parsed: SystemOneResponse;
  try {
    parsed = JSON.parse(output) as SystemOneResponse;
  } catch {
    throw new Error(`jev-surface: 返回不是 JSON ✗（${output.slice(0, 200)}）`);
  }
  if (!parsed.answers) throw new Error(`jev-surface: 无 answers ✗（${output.slice(0, 200)}）`);
  return parsed;
}
