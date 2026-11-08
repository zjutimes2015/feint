import { expect, type Page } from '@playwright/test';

export type LocaleMode = 'en' | 'zh';

export interface PageHealthMonitor {
  reset: () => void;
  expectNoErrors: (context: string) => void;
}

function isUncontrolledAdResourceError(message: string, locationUrl: string) {
  if (!locationUrl) {
    return false;
  }

  try {
    const hostname = new URL(locationUrl).hostname;
    if (
      hostname === 'www.youtube.com' &&
      message.startsWith('Permissions policy violation: compute-pressure')
    ) {
      return true;
    }

    if (!message.startsWith('Failed to load resource:')) {
      return false;
    }

    return (
      hostname === 'googleads.g.doubleclick.net' ||
      hostname === 'static.doubleclick.net'
    );
  } catch {
    return false;
  }
}

export function installPageHealthMonitor(page: Page): PageHealthMonitor {
  const errors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      const location = message.location();
      if (isUncontrolledAdResourceError(message.text(), location.url)) {
        return;
      }

      const source = location.url
        ? ` (${location.url}:${location.lineNumber}:${location.columnNumber})`
        : '';
      errors.push(`[console.error] ${message.text()}${source}`);
    }
  });

  page.on('pageerror', (error) => {
    errors.push(`[pageerror] ${error.message}`);
  });

  return {
    reset: () => {
      errors.length = 0;
    },
    expectNoErrors: (context) => {
      expect(errors, `${context} should not log browser errors`).toEqual([]);
    },
  };
}

export function localizedPath(path: string, locale: LocaleMode) {
  if (locale === 'en') return path;
  return path === '/' ? '/zh' : `/zh${path}`;
}

export async function expectHealthyPage(
  page: Page,
  monitor: PageHealthMonitor,
  path: string,
  options: {
    expectedPath?: RegExp;
  } = {}
) {
  monitor.reset();

  const response = await page.goto(path);
  expect(response?.ok(), `${path} should return 2xx`).toBeTruthy();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('body')).toBeVisible();

  if (options.expectedPath) {
    await expect(page).toHaveURL(options.expectedPath);
  }

  await page.waitForTimeout(100);
  monitor.expectNoErrors(path);
}
