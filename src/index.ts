import { app } from "./eli";

export { app, type App } from "./eli";
export default app;

if (import.meta.main) {
  const port = Number(Bun.env.PORT || 3000);
  app.listen(port);
  console.log(`Dev server running on http://localhost:${port}`);
}
