import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://portretnefilmy.sk",
  integrations: [
    sitemap({
      filter: (page) => !page.includes("/404"),
    }),
  ],
  output: "static",
});
