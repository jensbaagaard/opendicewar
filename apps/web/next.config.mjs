/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@opendicewar/core", "@opendicewar/ai", "@opendicewar/ui"],
};

export default nextConfig;
