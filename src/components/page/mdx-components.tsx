import { cn } from '@/lib/utils';
import type { MDXComponents } from 'mdx/types';
import type { HTMLAttributes } from 'react';

/**
 * MDX components for legal pages (privacy / terms / cookie).
 * The template's fumadocs-based MDX component set is not shipped with
 * BRAWLVERSE, so only the pieces the legal content actually needs live here.
 */
export function Wrapper(props: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        'rounded-lg bg-black/20 p-4 border prose-no-margin',
        props.className
      )}
    >
      {props.children}
    </div>
  );
}

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    Wrapper,
    ...components,
  };
}
