# Map and development catalogue

`countries.js` is a deliberately limited, 31-country development catalogue.
Country names, numeric ISO IDs, regions, and flag codes identify real countries.
**All population values are synthetic placeholders of 10,000,000**, not estimates.
The interface labels these values. Replace this catalogue with verified demographic
data before releasing gameplay. Do not change engine thresholds to accommodate it.

The local `public/data/world-countries.json` is generated from world-atlas 2.0.2,
`countries-110m.json`, using topojson-client's `feature()` converter. The original
boundaries are Natural Earth 1:110m Admin 0, version 4.1.0, supplied by world-atlas.
Run `node scripts/prepareMap.mjs` to regenerate the local asset. The script also
normalises equivalent +180/-180 coordinates to prevent date-line rendering seams.
Antarctica is excluded from this overview. The remaining country geometry is not
hand-drawn. Small-scale boundaries are simplified and omit some tiny countries;
the accessible country list is the primary alternative to map clicks.

- Dataset: https://github.com/topojson/world-atlas
- Natural Earth public-domain terms: https://www.naturalearthdata.com/about/terms-of-use/
- Flags: https://github.com/lipis/flag-icons (local 4:3 SVGs, MIT license in `public/flags/LICENSE`)

`WorldMap.jsx` uses React Leaflet 5 / Leaflet 1.9.4 with an equirectangular
projection (`CRS.EPSG4326`). It fetches the local GeoJSON once, with loading,
failure and retry states. It does not fetch map tiles or use an API key.
All flags are also served locally. No runtime external requests are required.

Games run locally in React memory. Refreshing resets them. Opening New game
pauses NPC playback and retains the current game until a replacement is created;
Return to current game cancels setup. See `../game/README.md` for human controls,
NPC playback, and the presentation guide.
