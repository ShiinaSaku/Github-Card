import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { lib: "./src/lib.ts" },
  format: "esm",
  platform: "node",
  target: "es2022",
  dts: true,
  tsconfig: "./tsconfig.build.json",
  outDir: "./dist",
  clean: true,
});
