# Context Glossary

## Screenshot Request

A request for a PNG Open Graph image at the OG host.
The request identifies one content page by slug.

## Slug

The canonical path-like identifier for a content page
(for example `about` or `plugins/wp-loupe`).

## Edge Cache

The Cloudflare colo-local cache layer used for fastest repeated reads
in the same region.

## KV Cache

The durable cross-region cache layer used to share screenshot results
between edge locations.

## Full Miss

A request where neither edge cache nor KV cache contains the image.

## Rendered Screenshot

A PNG image generated from a live browser session for a specific slug.

## Fallback Image

A pre-generated static PNG used when rendering fails.

## Cache Warmup

A proactive process that requests image URLs ahead of time so first user
access is less likely to hit a full miss.
