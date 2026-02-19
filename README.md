# GitHub Profile Card

<div align="center">

<br/>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://card.shiina.xyz/card/ShiinaSaku?theme=github_dark" />
  <img src="https://card.shiina.xyz/card/ShiinaSaku" alt="GitHub Profile Card" width="500" />
</picture>

<br/><br/>

# github-card

**Beautiful GitHub stats cards for your README, site, or npm project.**

[![npm](https://img.shields.io/npm/v/github-card?style=flat&colorA=0b1220&colorB=58a6ff)](https://www.npmjs.com/package/github-card)
[![Built with Bun](https://img.shields.io/badge/Bun-000?style=flat&logo=bun&logoColor=ffd700)](https://bun.sh)
[![MIT](https://img.shields.io/badge/License-MIT-green?style=flat)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-21%20passed-34d399?style=flat)](#testing)

[Live Demo](https://card.shiina.xyz/card/ShiinaSaku) &#183;
[All Themes](https://card.shiina.xyz/ShiinaSaku/themes) &#183;
[API Docs](https://card.shiina.xyz/openapi) &#183;
[npm Package](#programmatic-usage-npm)

</div>

---

## Embed in 10 seconds

```markdown
![GitHub Stats](https://card.shiina.xyz/card/YOUR_USERNAME)
```

Replace `YOUR_USERNAME`. Done.

### Dark mode aware

```html
<picture>
  <source
    media="(prefers-color-scheme: dark)"
    srcset="https://card.shiina.xyz/card/YOUR_USERNAME?theme=github_dark"
  />
  <img src="https://card.shiina.xyz/card/YOUR_USERNAME" alt="GitHub Stats" />
</picture>
```

---

## Themes

20 built-in themes. Pass `?theme=name` to use one.

<table>
  <tr>
    <td align="center"><img src="https://card.shiina.xyz/card/ShiinaSaku?theme=default" width="400" alt="default" /><br/><code>default</code></td>
    <td align="center"><img src="https://card.shiina.xyz/card/ShiinaSaku?theme=github_dark" width="400" alt="github_dark" /><br/><code>github_dark</code></td>
  </tr>
  <tr>
    <td align="center"><img src="https://card.shiina.xyz/card/ShiinaSaku?theme=tokyonight" width="400" alt="tokyonight" /><br/><code>tokyonight</code></td>
    <td align="center"><img src="https://card.shiina.xyz/card/ShiinaSaku?theme=dracula" width="400" alt="dracula" /><br/><code>dracula</code></td>
  </tr>
  <tr>
    <td align="center"><img src="https://card.shiina.xyz/card/ShiinaSaku?theme=nord" width="400" alt="nord" /><br/><code>nord</code></td>
    <td align="center"><img src="https://card.shiina.xyz/card/ShiinaSaku?theme=radical" width="400" alt="radical" /><br/><code>radical</code></td>
  </tr>
  <tr>
    <td align="center"><img src="https://card.shiina.xyz/card/ShiinaSaku?theme=synthwave" width="400" alt="synthwave" /><br/><code>synthwave</code></td>
    <td align="center"><img src="https://card.shiina.xyz/card/ShiinaSaku?theme=rose" width="400" alt="rose" /><br/><code>rose</code></td>
  </tr>
</table>

<details>
<summary><strong>All 20 themes</strong></summary>
<br/>

`default` `dark` `radical` `merko` `gruvbox` `tokyonight` `onedark` `cobalt` `synthwave` `highcontrast` `dracula` `monokai` `nord` `github_dark` `pearl` `slate` `forest` `rose` `sand`

Preview every theme with your own data:

```
https://card.shiina.xyz/YOUR_USERNAME/themes
```

</details>

---

## Parameters

All parameters are optional query strings on `/card/:username`.

### Appearance

| Parameter     | Default   | Description                          |
| :------------ | :-------- | :----------------------------------- |
| `theme`       | `default` | One of the 20 built-in themes        |
| `compact`     | `false`   | Hides bio, pronouns, language labels |
| `hide_border` | `false`   | Removes the card border              |

### Custom Colors

Pass hex values **without** `#`.

| Parameter      | Description        |
| :------------- | :----------------- |
| `bg_color`     | Background         |
| `title_color`  | Name text          |
| `text_color`   | Body text & labels |
| `icon_color`   | Stat icons         |
| `border_color` | Card border        |

### Data Filtering

| Parameter    | Default    | Description                                                             |
| :----------- | :--------- | :---------------------------------------------------------------------- |
| `lang_count` | `5`        | Top languages shown (1--10)                                             |
| `hide`       | --         | Comma-separated: `stars,commits,issues,repos,prs`                       |
| `scope`      | `personal` | `personal` / `org` / `all` -- see [scope details](#what-the-card-shows) |
| `orgs`       | --         | Comma-separated org logins to include (filters contributed-to repos)    |

### Examples

```bash
# Compact with 3 languages
https://card.shiina.xyz/card/ShiinaSaku?compact=true&lang_count=3

# GitHub dark colors
https://card.shiina.xyz/card/ShiinaSaku?bg_color=0d1117&text_color=c9d1d9&title_color=58a6ff

# Organization stats
https://card.shiina.xyz/card/ShiinaSaku?scope=all&orgs=oven-sh,elysiajs

# Hide specific stats
https://card.shiina.xyz/card/ShiinaSaku?hide=issues,prs,stars
```

---

## Programmatic Usage (npm)

Install the package to render cards in your own server, CLI tool, or script:

```bash
bun add github-card    # or npm install github-card
```

### Render SVG from data

```typescript
import { renderCard, themes } from "github-card";

const svg = renderCard(
  {
    login: "octocat",
    name: "The Octocat",
    avatarUrl: "https://github.com/octocat.png",
    bio: "Open source enthusiast",
    pronouns: "they/them",
    twitter: "github",
  },
  { stars: 3200, commits: 1450, issues: 89, repos: 42, prs: 210 },
  [
    { name: "TypeScript", size: 120000, color: "#3178c6" },
    { name: "Go", size: 80000, color: "#00ADD8" },
    { name: "Rust", size: 40000, color: "#dea584" },
  ],
  { theme: "tokyonight", compact: false },
);

// svg is a self-contained SVG string with embedded font
```

### Available exports

```typescript
import {
  // Core renderer
  renderCard,
  type CardOpts,

  // Types
  type UserProfile,
  type UserStats,
  type LanguageStat,
  type ProfileData,
  type CardOptions,

  // Theming
  themes,
  resolveColors,
  type Theme,

  // Utilities
  kFormat, // 1500 -> "1.5k"
  escapeXml, // "<>" -> "&lt;&gt;"
  wrapText, // text wrapping with ellipsis
  icon, // SVG stat icons (star, commit, pr, issue, repo, x)
  icons, // raw SVG path data
  getLangColor, // language -> hex color (650+ languages)
  FONT_FACE, // base64 @font-face CSS rule
  FONT_FAMILY, // font-family declaration
} from "github-card";
```

### Use as Elysia plugin

The default export is an Elysia app. Mount it into your own server:

```typescript
import { Elysia } from "elysia";
import githubCard from "github-card/server";

new Elysia()
  .use(githubCard) // adds /card/:username, /:username/themes, etc.
  .get("/my-route", () => "hello")
  .listen(3000);
```

---

## Self-Hosting

### Vercel (recommended)

```bash
git clone https://github.com/ShiinaSaku/Github-Card.git
cd Github-Card
vercel deploy
```

Set environment variables:

```
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx          # required
UPSTASH_REDIS_REST_URL=https://...             # optional, L2 cache
UPSTASH_REDIS_REST_TOKEN=...                   # optional
```

### Local Development

```bash
bun install
echo "GITHUB_TOKEN=ghp_xxx" > .env
bun dev
# http://localhost:3000/card/ShiinaSaku
```

---

## API Reference

| Endpoint                | Returns                                     |
| :---------------------- | :------------------------------------------ |
| `GET /card/:username`   | SVG stats card                              |
| `GET /:username/themes` | SVG grid of all themes                      |
| `GET /health`           | JSON -- cache metrics, Redis status, uptime |
| `GET /openapi`          | Interactive API documentation               |

### Response Headers

| Header                        | Value                                                           |
| :---------------------------- | :-------------------------------------------------------------- |
| `Cache-Control`               | `public, max-age=0, s-maxage=1800, stale-while-revalidate=1800` |
| `ETag`                        | Enables 304 Not Modified                                        |
| `Server-Timing`               | Per-request timing telemetry                                    |
| `Access-Control-Allow-Origin` | `*`                                                             |

### Status Codes

| Code | Meaning             |
| :--- | :------------------ |
| 200  | SVG card            |
| 304  | Cached (ETag match) |
| 401  | Bad GitHub token    |
| 404  | User not found      |
| 422  | Invalid parameters  |
| 429  | GitHub rate limited |
| 502  | GitHub API down     |

---

## Architecture

```
Request -> Elysia (CORS, OpenAPI, Server-Timing)
  -> GitHub GraphQL API (parallel personal + org fetches)
  -> L1 In-Memory Cache (30m fresh / 30m stale SWR)
  -> L2 Upstash Redis (optional, 60m TTL)
  -> SVG Renderer (embedded Roboto WOFF2 font)
  -> ETag / 304 / Cache-Control
```

| Layer     | Tech                                      |
| :-------- | :---------------------------------------- |
| Runtime   | Bun                                       |
| Framework | Elysia                                    |
| Data      | GitHub GraphQL API                        |
| Cache L1  | In-memory Map with SWR                    |
| Cache L2  | Upstash Redis (serverless)                |
| Font      | Roboto (subsetted WOFF2, base64 embedded) |
| Deploy    | Vercel Functions                          |
| Tests     | bun:test -- 21 tests                      |
| Lint      | oxlint + oxfmt                            |

---

## Testing

```bash
bun test               # 21 tests
bun test --coverage    # with coverage
bun run typecheck      # tsc
bun run lint           # oxlint
```

---

## What the card shows

| Stat      | Source                                 |
| :-------- | :------------------------------------- |
| Stars     | Total across owned repos (excl. forks) |
| Commits   | Current calendar year                  |
| Issues    | Open + closed                          |
| Repos     | Owned, non-fork                        |
| PRs       | Open + closed + merged                 |
| Languages | Top N by code size                     |

### Scope

| Value      | Stars / Repos / Languages from                       | Speed                              |
| :--------- | :--------------------------------------------------- | :--------------------------------- |
| `personal` | Your own repos only                                  | Single query                       |
| `org`      | Org repos you actually contributed to (commits, PRs) | Parallel: metadata + contributions |
| `all`      | Your repos + org repos you contributed to            | Parallel: personal + contributions |

Org stats use GitHub's `repositoriesContributedTo` API -- only repos you actually touched are counted, not every repo in the organization. Filter to specific orgs with `orgs=org1,org2`.

---

## License

[MIT](LICENSE)

---

<div align="center">
<sub>Built with <a href="https://bun.sh">Bun</a> and <a href="https://elysiajs.com">Elysia</a>. Hosted on <a href="https://vercel.com">Vercel</a>.</sub>
</div>
