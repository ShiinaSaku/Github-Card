<div align="center">

<img src="assets/logo.svg" alt="GitHub Card" width="480" />

# GitHub Card

**Beautiful, blazing-fast GitHub profile cards as dynamic SVGs.**
Drop one line in your README — get a live, auto-updating stats card.

[![Bun](https://img.shields.io/badge/Bun-1.x-f9f1e1?style=flat-square&logo=bun&logoColor=000)](assets/bun.svg)
[![Elysia](https://img.shields.io/badge/ElysiaJS-1.x-7c3aed?style=flat-square)](assets/elysia.svg)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=fff)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-34d399?style=flat-square)](LICENSE)
[![Deploy with Vercel](https://img.shields.io/badge/Deploy-Vercel-000?style=flat-square&logo=vercel)](https://vercel.com/new/clone?repository-url=https://github.com/ShiinaSaku/Github-Card)

<img src="https://card.shiina.xyz/card/shiinasaku?theme=shiina" alt="Live demo card" width="500" />

</div>

---

## Quickstart

Paste this into your profile README (replace `shiinasaku` with your username):

```md
[![GitHub Card](https://card.shiina.xyz/card/shiinasaku?theme=shiina)](https://github.com/shiinasaku)
```

That's it. No sign-up, no build step — the card updates itself as you code.

## Why GitHub Card?

- **One line, zero config** — an `<img>` tag is the entire integration.
- **Edge-fast** — two-tier cache (in-memory + Redis) with stale-while-revalidate, ETag/304 support, and CDN cache headers. Warm requests render in microseconds.
- **21 hand-tuned themes** — plus full per-slot color overrides with hex _or_ Tailwind palette tokens.
- **Retina avatars** — profile images inlined as Base64 at 2x resolution.
- **Adaptive layout** — width, text wrapping, and language legends are computed mathematically; nothing ever overlaps.
- **Users _and_ orgs** — works for organization accounts out of the box.
- **Glassmorphic depth** — layered ambient gradients track your accent color for volumetric light with zero runtime cost (pure SVG).
- **OpenAPI documented** — explore the API interactively at [`/openapi`](https://card.shiina.xyz/openapi).

## Themes

Preview **every** theme with your own data:

```md
![All themes](https://card.shiina.xyz/shiinasaku/themes)
```

| Dark favorites                                     | Light & accent                                   |
| -------------------------------------------------- | ------------------------------------------------ |
| `shiina` · `aurora` · `oled` · `slate`             | `default` · `pearl` · `sand`                     |
| `github_dark` · `dark` · `nord` · `dracula`        | `forest` · `rose` · `cobalt`                     |
| `tokyonight` · `synthwave` · `radical` · `monokai` | `gruvbox` · `merko` · `onedark` · `highcontrast` |

## Customization

Every visual slot is overridable. Colors accept hex (`ff79c6` or `#ff79c6`) and Tailwind tokens (`pink-400`).

| Parameter      | Type     | Description                                                        |
| -------------- | -------- | ------------------------------------------------------------------ |
| `theme`        | string   | Built-in theme name (see table above)                              |
| `bg_color`     | string   | Background fill                                                    |
| `title_color`  | string   | Name / title text                                                  |
| `text_color`   | string   | Stats, labels, and body text                                       |
| `icon_color`   | string   | Stat icons and ambient glow                                        |
| `border_color` | string   | Card outline stroke                                                |
| `hide_border`  | boolean  | Remove the card outline                                            |
| `compact`      | boolean  | Slim layout: hides bio, pronouns, Twitter, and the language legend |
| `animate`      | boolean  | Fade-in stats + animated language bar                              |
| `hide`         | string[] | Hide stats: `stars`, `commits`, `issues`, `repos`, `prs`           |
| `hide_langs`   | string[] | Exclude languages by name (`hide_langs=html,css`)                  |
| `show_langs`   | string[] | Include _only_ these languages                                     |
| `lang_count`   | 1–10     | Number of top languages (default `5`)                              |
| `scope`        | string   | `personal` (default), `org`, or `all` contribution scope           |
| `orgs`         | string[] | Restrict org-scope stats to these organizations                    |
| `affiliations` | string   | `affiliated` (default) or `owner` repositories                     |
| `fields`       | string[] | Fetch only what you need (e.g. `fields=stats`)                     |

### Examples

```md
<!-- Dracula, no border, animated -->

![card](https://card.shiina.xyz/card/shiinasaku?theme=dracula&hide_border=true&animate=true)

<!-- Fully custom colors -->

![card](https://card.shiina.xyz/card/shiinasaku?bg_color=0d1117&title_color=58a6ff&text_color=9da7b3&icon_color=58a6ff)

<!-- Compact, stats only, no languages -->

![card](https://card.shiina.xyz/card/shiinasaku?compact=true&hide=issues,prs&fields=stats)

<!-- Organization card -->

![card](https://card.shiina.xyz/card/elysiajs)
```

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ShiinaSaku/Github-Card)

1. Click the button above (or fork + import into Vercel).
2. Add environment variables:

   | Variable       | Required | Purpose                                   |
   | -------------- | -------- | ----------------------------------------- |
   | `GITHUB_TOKEN` | ✅       | GitHub PAT (read-only is enough)          |
   | `REDIS_URL`    | ➖       | Redis/Upstash URL for the shared L2 cache |

3. Done. Your instance serves `/card/:username` on Vercel's CDN with `s-maxage=1800, stale-while-revalidate=1800`.

> Redis is optional — without it, the in-memory cache still keeps each warm instance fast.

## API

| Endpoint                | Description                                 |
| ----------------------- | ------------------------------------------- |
| `GET /card/:username`   | SVG card (all query params above)           |
| `GET /:username/themes` | One SVG showing **all themes** for a user   |
| `GET /meta`             | Service metadata + theme list               |
| `GET /health`           | Uptime, cache telemetry, Redis reachability |
| `GET /openapi`          | Interactive OpenAPI docs                    |

Responses are `image/svg+xml` with `ETag`, CORS (`*`), and CDN cache headers. Conditional requests (`If-None-Match`) return `304`.

## Use as a library

```bash
bun add @shiinasaku/github-card     # Bun
npm install @shiinasaku/github-card # Node / Next.js / Vite
```

```ts
import { renderCard, themes } from "@shiinasaku/github-card";

const svg = renderCard(user, stats, languages, { theme: "tokyonight" });
```

Ships as a prebuilt ESM bundle with full `.d.ts` types (Bun resolves the raw TypeScript source automatically via the `bun` export condition). The renderer is pure — no server, no network, works in any JS runtime.

## Releasing

Releases are fully automated:

1. **Actions → Bump** → choose `patch` / `minor` / `major`.
2. The workflow bumps `package.json`, commits, and tags `vX.Y.Z`.
3. The tag triggers **Release**: format, lint, typecheck, tests, dist build, tag↔version guard, `npm pack` verification, then publish to npm with [provenance](https://docs.npmjs.com/generating-provenance-statements) and a GitHub Release with auto-generated notes.

## Local development

```bash
bun install
cp .env.example .env   # add your GITHUB_TOKEN
bun dev                # http://localhost:3000
```

| Command             | Action                |
| ------------------- | --------------------- |
| `bun test`          | Run the test suite    |
| `bun run typecheck` | Strict `tsc --noEmit` |
| `bun run lint`      | oxlint                |
| `bun run fmt`       | oxfmt                 |

## Architecture

```
GET /card/:username
      │
      ▼
Elysia (validation, CORS, OpenAPI, server-timing)
      │
      ▼
L1 in-memory cache ──hit──► render SVG ──► ETag/304 ──► CDN
      │miss                         ▲
      ▼                             │ stale-while-revalidate
L2 Redis (SWR) ──hit──► serve stale + background refresh
      │miss
      ▼
GitHub GraphQL (batched, paginated 100/page, 6s timeout)
      │
      ▼
Pure SVG renderer (zero-dependency, dynamic layout engine)
```

- **Bun + Elysia** — one of the fastest HTTP stacks available.
- **Two-tier SWR cache** — users never wait on GitHub's API.
- **Request coalescing** — concurrent misses share a single upstream fetch.
- **Defensive upstream** — timeouts, size caps, and typed errors (`401/404/429/502`).

## License

[MIT](LICENSE) © [saku shiina](https://www.shiina.xyz)
