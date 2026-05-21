import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.56.1", "10.214.102.101", "localhost", "127.0.0.1"],
  webpack: (config, { isServer }) => {
    // Prevent Next/Webpack from attempting to parse native .node binaries
    // shipped by `@napi-rs/canvas`. We keep the module available at runtime
    // on the server but avoid bundling it during the build step.
    try {
      if (isServer) {
        config.externals = config.externals || [];
        // Add the native canvas module as an external so webpack leaves the
        // require call alone and does not try to process the .node file.
        (config.externals as any).push('@napi-rs/canvas');
      } else {
        // On the client, alias the module to `false` so imports fail fast
        // if accidentally imported in client code.
        config.resolve = config.resolve || {};
        config.resolve.alias = {
          ...(config.resolve.alias || {}),
          '@napi-rs/canvas': false,
        };
      }
    } catch (e) {
      // ignore and continue with default config
    }

    return config;
  },
};

export default nextConfig;
