# GitHub Profile Card

High-performance, beautifully designed GitHub profile statistics cards generated dynamically on the edge. Built natively with Bun and ElysiaJS, optimized strictly for Vercel Serverless and Edge configurations.

## Features

- Zero-Dependency SVG Engine: Renders absolutely beautiful layouts utilizing native Tailwind color primitives dynamically mapped inline inside the vectors.
- Ultra Fast Architecture: Relies on native Bun `RedisClient` utilizing advanced Stale-While-Revalidate caching architectures providing zero-latency reads.
- Retina-Ready Assets: Dynamically scales GitHub profile imagery into Base64 formats encoded cleanly with native 2x resolution matrix limits for ultimate sharpness on any device screen.
- Fluid Text Grids: The legend topology adapts its dimensional flows absolutely mathematically, preventing overlap and text clashes automatically across large rendering strings.
- Glassmorphism Layouts: Engineered deeply layered ambient radial overlays providing volumetric 3D lighting without computational drag tracking exactly to profile custom accents.

## Deployment on Vercel

This repository is built and styled natively to be executed out-of-the-box on the Vercel Edge network with deep Cache-Control synchronization.

1. Create a native Redis datastore (e.g., Upstash) and secure your URI.
2. Generate a standard GitHub Personal Access Token.
3. Hook this repository continuously inside Vercel.
4. Configure the environment parameters:

```bash
GITHUB_TOKEN=your_token_here
REDIS_URL=redis://your_redis_connection_string
```

## API Usage

Include the card instantly inside any raw markdown file, HTML page, or client component.

```html
<a href="https://github.com/shiinasaku">
  <img
    src="https://your-vercel-domain.com/card/shiinasaku?theme=shiina"
    alt="ShiinaSaku GitHub Stats"
  />
</a>
```

### Supported Query Parameters

| Parameter      | Type     | Description                                                   |
| -------------- | -------- | ------------------------------------------------------------- |
| `theme`        | string   | Applies a pre-packaged color layout (e.g. `shiina`, `aurora`) |
| `bg_color`     | string   | Custom Hex color replacing background fills                   |
| `title_color`  | string   | Custom Hex color replacing the title font fills               |
| `text_color`   | string   | Custom Hex color replacing numeric stats and text labels      |
| `icon_color`   | string   | Custom Hex color replacing metric icons and ambient halation  |
| `border_color` | string   | Custom Hex color replacing stroke borders                     |
| `hide_border`  | boolean  | Strips the outline wrapper from the card                      |
| `compact`      | boolean  | Shrinks the card geometry hiding extensive labels             |
| `hide`         | string[] | Hides specific stat nodes (e.g. `hide=issues,prs`)            |
| `hide_langs`   | string[] | Hides specific languages by name (e.g. `hide_langs=html,css`) |
| `show_langs`   | string[] | Shows only specific languages by name (e.g. `show_langs=rust`) |
| `lang_count`   | integer  | Adjusts the Top Language count to fetch (max 10, default 5)   |

### Premium Themes

The engine hosts dozens of native configurations. Specifying a theme overrides default styles seamlessly:

- `shiina` (OLED Dark Background mapping Fuchsia Titles and Sky Blue Accents)
- `aurora` (Midnight Navy layouts illuminated by Teal and Emerald typographical maps)
- `oled` (Perfect black levels with sharp Indigo Vector Accents)
- `github_dark` (Clean layout respecting the classic monochrome dark tones)

## Local Development

Launch the core Elysia TCP runtime locally:

```bash
bun install
bun dev
```

Run test evaluations:

```bash
bun test
```
