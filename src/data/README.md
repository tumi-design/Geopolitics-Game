# Country catalogue and population data

I used a catalogue of **55 real-world countries** for the game, covering Africa, Europe, Asia, North and South America, and Oceania. Each new game uses the country selected by the player and nine randomly chosen opponents from this catalogue.

## Population data

The population figures come from [Worldometer's 2026 country population estimates](https://www.worldometers.info/world-population/population-by-country/), checked on **31 October 2026**. These are annual mid-year estimates, not live population counts.

I saved the figures in [`populations-2026.json`](populations-2026.json), together with the reference year, retrieval date and individual country source links. The game uses this saved data rather than requesting population figures from the website during play.

Starting soldiers are calculated from each country's population using `getStartingSoldiers(population)` in [`gameRules.js`](../engine/gameRules.js). This keeps the soldier allocations consistent with the examination's population thresholds.

## Country selection and identification

[`countries.js`](countries.js) defines the available countries, their names, regions and identifiers. I used ISO country codes to match the catalogue with the map and local flag images.

The search supports country names, alternative spellings and ISO alpha-2 codes. For example, players can search for **Türkiye** using “Turkey” or “Turkiye”, and for the **Democratic Republic of the Congo** using “DRC” or “DR Congo”.

## Map and flags

The world map is built from [world-atlas](https://github.com/topojson/world-atlas) data derived from [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/). The prepared map file is stored locally at [`public/data/world-countries.json`](../../public/data/world-countries.json), and can be regenerated with:

```powershell
node scripts/prepareMap.mjs
```

Antarctica is excluded from the map overview. Because some small countries may be difficult to select on a simplified world map, players can also use the searchable country list.

Country flags are local SVG assets from [flag-icons](https://github.com/lipis/flag-icons), with attribution in [`public/flags/LICENSE`](../../public/flags/LICENSE). The map and flags do not require external map or flag services while the game runs.

For the full game rules and instructions, see the [main README](../../README.md) and [gameplay guide](../game/README.md).
