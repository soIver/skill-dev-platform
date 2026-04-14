import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import svgr from "vite-plugin-svgr";

export default defineConfig({
  plugins: [
    tailwindcss(),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    svgr({
      include: "**/*.svg?react",
      svgrOptions: {
        exportType: "default",
        namedExport: "ReactComponent",
      },
    }),
  ],
});
