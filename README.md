# GitHub Profile Card

<p align="left">
	<a href="https://card.shiina.xyz"><strong>Live Demo</strong></a>
	·
	<a href="#usage">Usage</a>
	·
	<a href="#parameters">Parameters</a>
	·
	<a href="#themes">Themes</a>
	·
	<a href="#local-development">Local Development</a>
</p>

Modern, lightweight GitHub profile cards built with Bun and Elysia. Data is sourced from GitHub GraphQL and cached via Upstash Redis for fast Vercel Functions.

<p align="left">
	<a href="https://bun.com"><img alt="Bun" src="./bun.svg" height="28"></a>
	<a href="https://elysiajs.com"><img alt="Elysia" src="./elysia.svg" height="28"></a>
</p>

---

## Usage

Base URL:

```
https://card.shiina.xyz/card/:username
```

Example:

```
https://card.shiina.xyz/card/ShiinaSaku
```

## Parameters

All parameters are optional.

| Param          | Type    | Description                 |
| -------------- | ------- | --------------------------- |
| `theme`        | string  | Theme name (see list below) |
| `title_color`  | string  | Hex color without `#`       |
| `text_color`   | string  | Hex color without `#`       |
| `icon_color`   | string  | Hex color without `#`       |
| `bg_color`     | string  | Hex color without `#`       |
| `border_color` | string  | Hex color without `#`       |
| `hide_border`  | boolean | `true` to hide border       |

Example with custom colors:

```
https://card.shiina.xyz/card/ShiinaSaku?bg_color=0d1117&text_color=c9d1d9&title_color=58a6ff&icon_color=1f6feb&border_color=21262d
```

## Themes

Built-in themes:

```
default
dark
radical
merko
gruvbox
tokyonight
onedark
cobalt
synthwave
highcontrast
dracula
monokai
nord
github_dark
pearl
slate
forest
rose
sand
```

## Examples (ShiinaSaku)

Default:

![Default](https://card.shiina.xyz/card/ShiinaSaku)

GitHub Dark:

![GitHub Dark](https://card.shiina.xyz/card/ShiinaSaku?theme=github_dark)

Tokyo Night:

![Tokyo Night](https://card.shiina.xyz/card/ShiinaSaku?theme=tokyonight)

Forest:

![Forest](https://card.shiina.xyz/card/ShiinaSaku?theme=forest)

Rose:

![Rose](https://card.shiina.xyz/card/ShiinaSaku?theme=rose)

## What it shows

The card renders:

- Total stars across owned repositories (excluding forks)
- Total commits for the current year
- Total issues (open + closed)
- Total owned repositories (excluding forks)
- Total pull requests (open + closed + merged)
- Top 5 programming languages

## Local Development

Install dependencies:

```
bun install
```

Run dev server:

```
bun run dev
```

Open:

```
http://localhost:3000/card/ShiinaSaku
```

## Deploy to Vercel

Environment variables:

```
GITHUB_TOKEN=your_token
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token
```

Vercel uses `vercel.json` in this repo. The app runs on Bun and Elysia automatically.

---

## Quick Links

- [Live Demo](https://card.shiina.xyz)
- [Themes](#themes)
- [Parameters](#parameters)
