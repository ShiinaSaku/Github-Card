import { Elysia, t } from "elysia";
import { getProfileData } from "@/github";
import { renderCard } from "@/card";

const app = new Elysia()
  .get("/", () => ({
    message: "GitHub Profile Card API",
    usage: "GET /card/:username",
    themes:
      "dark, radical, merko, gruvbox, tokyonight, onedark, cobalt, synthwave, highcontrast, dracula",
  }))
  .get(
    "/card/:username",
    async ({ params: { username }, query, set }) => {
      try {
        const data = await getProfileData(username);
        const svg = renderCard(data.user, data.stats, data.languages, {
          theme: query.theme,
          title_color: query.title_color,
          text_color: query.text_color,
          icon_color: query.icon_color,
          bg_color: query.bg_color,
          border_color: query.border_color,
          hide_border: query.hide_border === "true",
        });

        set.headers["Content-Type"] = "image/svg+xml";
        set.headers["Cache-Control"] = "public, max-age=1800";
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
      }),
    },
  );
export default app
