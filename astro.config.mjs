import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://portretnefilmy.sk",
  output: "static",
  integrations: [sitemap()],
});
