/**
 * CLI for the Jev control-surface selection layer
 * Zones: telegram ui, tooling
 * Reads {state, candidates} on stdin and prints the projected surface judged by the CommandCode-hosted Jev endpoint
 */
import { readFileSync } from "node:fs";

let layer;
try {
  layer = await import("../dist/lib/jev-surface.js");
} catch (error) {
  throw new Error(`jev-surface: 需要先构建 ✗ → 在 pi-telegram 仓库跑 npm run build ✓（${error.message}）`);
}

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch (error) {
  throw new Error(`jev-surface: stdin 不是合法 JSON ✗（${error.message}）`);
}

const { state = {}, candidates = [], maxRows } = input;
if (!Array.isArray(candidates) || candidates.length < 2) throw new Error("jev-surface: 至少要两个候选 ✓");

const response = layer.callSystemOne(layer.buildSystemOneBody(state, candidates));
const surface = layer.projectSurface(response.answers, candidates, maxRows);
const markup = layer.renderTelegramSurface(surface.rows);
process.stdout.write(JSON.stringify({ ...surface, markup, usage: response.usage }, null, 2) + "\n");
