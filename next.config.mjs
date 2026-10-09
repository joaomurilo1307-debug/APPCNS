/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.APP_ENV === "homologacao" ? ".next-homologacao" : ".next",
};

export default nextConfig;
