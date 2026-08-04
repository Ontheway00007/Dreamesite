import { serialiseJsonLd, type JsonLd } from "@/lib/seo/structured-data";

/**
 * Renders one JSON-LD document.
 *
 * A Server Component, so the payload is in the HTML a crawler receives without
 * any JavaScript running. `dangerouslySetInnerHTML` is unavoidable for a
 * `<script>` body — React escapes text children, which would corrupt the JSON —
 * and it is safe here because the content is `JSON.stringify` output with `<`
 * escaped by `serialiseJsonLd`, never caller-supplied markup.
 */
export function JsonLd({ data }: { data: JsonLd }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialiseJsonLd(data) }}
    />
  );
}
