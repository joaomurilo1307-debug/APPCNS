import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#00A99D",
          dark: "#00847a",
          light: "#e6f7f6",
        },
        accent: {
          DEFAULT: "#E63329",
          dark: "#c22921",
        },
        ink: "#1a1a2e",
      },
      backgroundImage: {
        "brand-texture":
          "radial-gradient(circle at 0% 0%, rgba(0,169,157,0.08), transparent 40%), radial-gradient(circle at 100% 0%, rgba(230,51,41,0.06), transparent 40%)",
      },
    },
  },
  plugins: [],
};
export default config;
