'use client';

import { useEffect } from 'react';

/**
 * Tawk.to 客服挂件。
 *
 * 两个环境变量都配了才注入 embed script：
 * - NEXT_PUBLIC_TAWK_PROPERTY_ID
 * - NEXT_PUBLIC_TAWK_WIDGET_ID
 * 没配就 render null：不报错、不阻塞页面。
 */
declare global {
  interface Window {
    Tawk_API?: Record<string, unknown>;
    Tawk_LoadStart?: Date;
  }
}

export function Tawk() {
  const propertyId = process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID;
  const widgetId = process.env.NEXT_PUBLIC_TAWK_WIDGET_ID;

  useEffect(() => {
    if (!propertyId || !widgetId) return;
    if (document.querySelector('script[data-tawk]')) return;

    window.Tawk_API = window.Tawk_API ?? {};
    window.Tawk_LoadStart = new Date();

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://embed.tawk.to/${propertyId}/${widgetId}`;
    script.charset = 'UTF-8';
    script.setAttribute('crossorigin', '*');
    script.setAttribute('data-tawk', '1');
    document.body.appendChild(script);
  }, [propertyId, widgetId]);

  return null;
}
