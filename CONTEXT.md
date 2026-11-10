# Context Glossary

## Install

One deployment of the worker, serving exactly one site. A site gets
screenshots by adding an install, never by changing code.

## Site Profile

Everything an install knows about its site: origin, how a Slug maps to a page
URL and back, the Fallback Image location, viewport, and cache lifetimes.
Read from per-install configuration and validated before use.

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
between edge locations. Keys are scoped by site host, so installs can share
a namespace.

## Full Miss

A request where neither edge cache nor KV cache contains the image.

## Rendered Screenshot

A PNG image generated from a live browser session for a specific slug.

## Fallback Image

A pre-generated static PNG on the site, used when rendering fails.
Optional per install.

## Cache Warmup

A scheduled run inside the install that reads the site's sitemap and renders
every Slug missing from the KV Cache, so first user access is less likely to
hit a full miss.
