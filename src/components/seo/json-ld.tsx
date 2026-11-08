import { serializeStructuredData } from '@/lib/structured-data';

export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: serializer escapes script-closing HTML before embedding JSON-LD.
      dangerouslySetInnerHTML={{ __html: serializeStructuredData(data) }}
    />
  );
}
