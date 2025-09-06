import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../..'),
  webpack: (config, { isServer }) => {
    // Fix for OpenTelemetry missing modules
    if (isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        '@opentelemetry/exporter-jaeger': false,
      };
    }
    
    // Fix for CodeSandbox SDK module resolution
    config.resolve.fallback = {
      ...config.resolve.fallback,
      module: false,
      fs: false,
      path: false,
      os: false,
    };
    
    // Add support for resolving .js extensions to .ts files in development
    config.resolve.extensionAlias = {
      '.js': ['.js', '.ts'],
      '.jsx': ['.jsx', '.tsx'],
    };
    
    return config;
  },
  experimental: {
    // Enable server actions for streaming
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
