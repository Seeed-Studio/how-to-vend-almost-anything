# Website analytics

This site uses the **How to Vend Almost Anything** GA4 property in the
`seeedstudio` account, with the **How to Vend Almost Anything — GitHub Pages**
web stream and measurement ID **G-KLLL5BL462** (stream ID `16084749562`,
property ID `558114631`).
Reporting uses China time (UTC+8).

Each published HTML page loads `analytics.js` once. That shared file loads the
Google tag only on `seeed-studio.github.io/how-to-vend-almost-anything/`.
Local previews, forks, and other projects on the same host are excluded.
Include this script on new HTML pages, adjusting the relative path if needed;
do not also add another GA4 snippet for this measurement ID.

GA4 enhanced measurement is enabled for page views, scrolls, outbound clicks,
and other supported interactions. This implementation adds no custom events,
key events, user IDs, or revenue data. Embedded native HTML videos are not
automatically covered by GA4's YouTube video measurement.

To check collection, open the published site and then this property's
Realtime report. Check the page title/path and `page_view` events. Normal
reports need processing time; GA4 does not recover visits from before the tag
was installed. Blocked Google scripts or visitor privacy choices can affect
collection.

Do not place personal information in page URLs or event parameters. Maintain
the site's visitor privacy disclosures and consent settings as its audience
and analytics use evolve.

GitHub Pages publishes `site/fab-vending-pages` from `/docs`. When replacing
the site or adding language directories, preserve the shared tag and update
each page's relative script path.
