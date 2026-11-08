import { defaultMessages } from '@/i18n/messages';
import type { MetadataRoute } from 'next';

/**
 * Generates the Web App Manifest for the application
 *
 * ref: https://github.com/amannn/next-intl/blob/main/examples/example-app-router/src/app/manifest.ts
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: defaultMessages.Metadata.name,
    short_name: defaultMessages.Metadata.name,
    description: defaultMessages.Metadata.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#0d0d0d',
    theme_color: '#ffcc00',
    icons: [
      {
        src: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
