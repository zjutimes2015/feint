'use client';

import type { ReactNode } from 'react';

/**
 * Legal pages render MDX through the fumadocs content pipeline but do not need
 * the Fumadocs UI runtime (search, TOC, code blocks). Keeping this wrapper
 * dependency-free avoids shipping fumadocs-ui on every legal page.
 */
export function DocsRootProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
