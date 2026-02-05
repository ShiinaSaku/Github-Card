import { Elysia, t } from "elysia";
import { html } from "@elysiajs/html";
import { staticPlugin } from "@elysiajs/static";
import { getProfileData } from "./github";
import { renderCard } from "./card";

// Read the landing page HTML
const landingHTML = await Bun.file("./src/landing.html").text();

const app = new Elysia()
  .use(html())
  .use(staticPlugin({
    assets: "./",
    prefix: "/",
  }))
  .get("/", ({ set }) => {
    set.headers["Content-Type"] = "text/html; charset=utf-8";
    return landingHTML;
  })
  .get(
    "/card/:username",
    async ({ params: { username }, query, set }) => {
      try {
        const fields = query.fields
          ? new Set(
              query.fields
                .split(",")
                .map((v) => v.trim().toLowerCase())
                .filter(Boolean),
            )
          : null;
        const includeLanguages =
          !fields || fields.has("all") || fields.has("languages") || fields.has("langs");
        const data = await getProfileData(username, { includeLanguages });
        const svg = renderCard(data.user, data.stats, data.languages, {
          theme: query.theme,
          title_color: query.title_color,
          text_color: query.text_color,
          icon_color: query.icon_color,
          bg_color: query.bg_color,
          border_color: query.border_color,
          hide_border: query.hide_border === "true",
          compact: query.compact === "true",
        });

        set.headers["Content-Type"] = "image/svg+xml";
        set.headers["Cache-Control"] =
          "public, max-age=0, s-maxage=1800, stale-while-revalidate=1800";
        return svg;
      } catch (err: any) {
        set.status = 404;
        return { error: err.message };
      }
    },
    {
      params: t.Object({ username: t.String() }),
      query: t.Object({
        theme: t.Optional(t.String()),
        title_color: t.Optional(t.String()),
        text_color: t.Optional(t.String()),
        icon_color: t.Optional(t.String()),
        bg_color: t.Optional(t.String()),
        border_color: t.Optional(t.String()),
        hide_border: t.Optional(t.String()),
        compact: t.Optional(t.String()),
        fields: t.Optional(t.String()),
      }),
    },
  );

if (import.meta.main) {
  const port = Number(Bun.env.PORT || 3000);
  app.listen(port);
  console.log(`Dev server running on http://localhost:${port}`);
}

export default app;
