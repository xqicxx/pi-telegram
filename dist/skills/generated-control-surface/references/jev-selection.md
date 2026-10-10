# Jev Selection Reference

When more plausible actions survive than the surface can show, settle membership and order through the Jev selection layer instead of guessing.

```bash
echo '{"state":{…truth mode + fresh evidence…},"candidates":[{"id":"…","label":"🔍 …","prompt":"…","impact":"read-only","row":"r1"}]}' \
  | node ~/.local/share/pi-bin/jev-surface
```

`state` carries the truth mode from the Skill; `Live` candidates must come from a fresh inspection. Each candidate is a configured action the platform already owns—component-style candidates never invent capabilities.

Returns:

- `rows` — ordered button rows, already capped at six and grouped by `row` when supplied.
- `decisions` — per candidate: `choice`, `keep` probability, `confidence`.
- `dropped` — candidates left off this surface.

Boundaries (mirrored from json-render's composer): the decision layer never writes labels, prompts, or data, never invents prose, and never executes an action. The platform owns the candidate catalog and the design system. Labels and prompts are yours; only membership and order come from the judgment.

Fail closed: missing endpoint, missing key, malformed probabilities, inconsistent `choice`—all raise. Then fall back to direct generation: a surface must always ship. Under two kept candidates the layer promotes the two highest probabilities, because a prompt-button transport always shows at least one button.

The layer needs a Jev endpoint: `TYPESAFE_BASE_URL` plus `TYPESAFE_API_KEY`, defaulting to the CommandCode-hosted Jev and the local `~/.pi/agent/auth.json` key. It runs `curl` because the endpoint sits behind Cloudflare and non-browser fingerprints are rejected.
