# Country catalogue and source data

`countries.js` contains exactly **55 real-world countries**, keeping all previous
50 and adding Russia, Türkiye, Iran, Democratic Republic of the Congo, and Algeria.
The overall catalogue covers Africa, Europe, Asia, North America (including
Central America and the Caribbean), South America, and Oceania. Transcontinental
Russia is listed under Europe and Türkiye under Asia, following Worldometer's
regional grouping; this has no effect on gameplay or map placement.

Display names are Türkiye and Democratic Republic of the Congo. Search also
accepts Turkey, Turkiye, DRC, DR Congo, Congo-Kinshasa, and Democratic Republic of
Congo, plus ISO alpha-2 codes. Search ignores accents and handles Turkish casing.
The DRC uses CD / 180, not CG / 178 (Republic of the Congo). The map's older
labels Turkey and Dem. Rep. Congo are matched by numeric ID, not by display name.
The five new local flags come from the same flag-icons project and retain its
existing MIT attribution in `public/flags/LICENSE`.

## Population reference: 2026

All populations are exact integers from Worldometer's **Population 2026** country
table, checked on **2026-10-31**. These are mid-year (July 1) annual estimates,
not census counts or the changing live population clocks. Worldometer attributes
them to the United Nations Population Division, World Population Prospects 2024
revision (medium-fertility variant).

Primary source: https://www.worldometers.info/world-population/population-by-country/

`populations-2026.json` pins all 55 figures, their shared year, retrieval date,
table URL and each country's source-page URL. There is no rounding, interpolation
or mixture of years. When checking a country page, compare its **2026 annual row**,
not its live clock. Runtime population lookups use the local snapshot.

Country IDs are ISO 3166-1 numeric codes (leading zeroes preserved); `code` is the
ISO alpha-2 code used by local flags. Every ID matches the existing map.
Starting soldiers are calculated by `getStartingSoldiers(population)` in
`src/engine/gameRules.js`; the original UCT thresholds are unchanged. Soldier
values are not manually stored in the catalogue.

## Geography and flag assets

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

## Auditable country values

All rows use reference year **2026**. Sources link directly to Worldometer.

| Country | ISO alpha-2 | ISO numeric | Population | Starting soldiers | Source |
| --- | --- | --- | ---: | ---: | --- |
| Algeria | DZ | 012 | 48,028,334 | 4 | [Worldometer](https://www.worldometers.info/world-population/algeria-population/) |
| Argentina | AR | 032 | 46,003,734 | 4 | [Worldometer](https://www.worldometers.info/world-population/argentina-population/) |
| Australia | AU | 036 | 27,227,096 | 4 | [Worldometer](https://www.worldometers.info/world-population/australia-population/) |
| Botswana | BW | 072 | 2,603,388 | 1 | [Worldometer](https://www.worldometers.info/world-population/botswana-population/) |
| Brazil | BR | 076 | 213,562,666 | 9 | [Worldometer](https://www.worldometers.info/world-population/brazil-population/) |
| Canada | CA | 124 | 40,467,728 | 4 | [Worldometer](https://www.worldometers.info/world-population/canada-population/) |
| Chile | CL | 152 | 19,945,850 | 3 | [Worldometer](https://www.worldometers.info/world-population/chile-population/) |
| China | CN | 156 | 1,412,914,089 | 9 | [Worldometer](https://www.worldometers.info/world-population/china-population/) |
| Colombia | CO | 170 | 53,936,226 | 5 | [Worldometer](https://www.worldometers.info/world-population/colombia-population/) |
| Costa Rica | CR | 188 | 5,174,789 | 2 | [Worldometer](https://www.worldometers.info/world-population/costa-rica-population/) |
| Cuba | CU | 192 | 10,892,659 | 3 | [Worldometer](https://www.worldometers.info/world-population/cuba-population/) |
| Democratic Republic of the Congo | CD | 180 | 116,452,162 | 7 | [Worldometer](https://www.worldometers.info/world-population/democratic-republic-of-the-congo-population/) |
| Denmark | DK | 208 | 6,023,520 | 2 | [Worldometer](https://www.worldometers.info/world-population/denmark-population/) |
| Ecuador | EC | 218 | 18,444,506 | 3 | [Worldometer](https://www.worldometers.info/world-population/ecuador-population/) |
| Egypt | EG | 818 | 120,101,175 | 7 | [Worldometer](https://www.worldometers.info/world-population/egypt-population/) |
| Ethiopia | ET | 231 | 138,902,185 | 8 | [Worldometer](https://www.worldometers.info/world-population/ethiopia-population/) |
| Finland | FI | 246 | 5,621,739 | 2 | [Worldometer](https://www.worldometers.info/world-population/finland-population/) |
| France | FR | 250 | 66,746,401 | 5 | [Worldometer](https://www.worldometers.info/world-population/france-population/) |
| Germany | DE | 276 | 83,644,258 | 6 | [Worldometer](https://www.worldometers.info/world-population/germany-population/) |
| Ghana | GH | 288 | 35,697,557 | 4 | [Worldometer](https://www.worldometers.info/world-population/ghana-population/) |
| Greece | GR | 300 | 9,897,115 | 2 | [Worldometer](https://www.worldometers.info/world-population/greece-population/) |
| India | IN | 356 | 1,476,625,576 | 9 | [Worldometer](https://www.worldometers.info/world-population/india-population/) |
| Indonesia | ID | 360 | 287,886,782 | 9 | [Worldometer](https://www.worldometers.info/world-population/indonesia-population/) |
| Iran | IR | 364 | 93,168,497 | 6 | [Worldometer](https://www.worldometers.info/world-population/iran-population/) |
| Ireland | IE | 372 | 5,356,950 | 2 | [Worldometer](https://www.worldometers.info/world-population/ireland-population/) |
| Italy | IT | 380 | 58,926,166 | 5 | [Worldometer](https://www.worldometers.info/world-population/italy-population/) |
| Japan | JP | 392 | 122,427,731 | 7 | [Worldometer](https://www.worldometers.info/world-population/japan-population/) |
| Kenya | KE | 404 | 58,636,412 | 5 | [Worldometer](https://www.worldometers.info/world-population/kenya-population/) |
| Mexico | MX | 484 | 132,997,658 | 8 | [Worldometer](https://www.worldometers.info/world-population/mexico-population/) |
| Morocco | MA | 504 | 38,762,441 | 4 | [Worldometer](https://www.worldometers.info/world-population/morocco-population/) |
| Namibia | NA | 516 | 3,153,246 | 1 | [Worldometer](https://www.worldometers.info/world-population/namibia-population/) |
| Netherlands | NL | 528 | 18,448,775 | 3 | [Worldometer](https://www.worldometers.info/world-population/netherlands-population/) |
| New Zealand | NZ | 554 | 5,287,479 | 2 | [Worldometer](https://www.worldometers.info/world-population/new-zealand-population/) |
| Nigeria | NG | 566 | 242,431,832 | 9 | [Worldometer](https://www.worldometers.info/world-population/nigeria-population/) |
| Norway | NO | 578 | 5,652,989 | 2 | [Worldometer](https://www.worldometers.info/world-population/norway-population/) |
| Pakistan | PK | 586 | 259,299,791 | 9 | [Worldometer](https://www.worldometers.info/world-population/pakistan-population/) |
| Papua New Guinea | PG | 598 | 10,947,848 | 3 | [Worldometer](https://www.worldometers.info/world-population/papua-new-guinea-population/) |
| Peru | PE | 604 | 34,922,148 | 4 | [Worldometer](https://www.worldometers.info/world-population/peru-population/) |
| Poland | PL | 616 | 37,843,188 | 4 | [Worldometer](https://www.worldometers.info/world-population/poland-population/) |
| Portugal | PT | 620 | 10,395,362 | 3 | [Worldometer](https://www.worldometers.info/world-population/portugal-population/) |
| Russia | RU | 643 | 143,394,458 | 8 | [Worldometer](https://www.worldometers.info/world-population/russia-population/) |
| Saudi Arabia | SA | 682 | 35,165,787 | 4 | [Worldometer](https://www.worldometers.info/world-population/saudi-arabia-population/) |
| Senegal | SN | 686 | 19,366,548 | 3 | [Worldometer](https://www.worldometers.info/world-population/senegal-population/) |
| South Africa | ZA | 710 | 65,453,084 | 5 | [Worldometer](https://www.worldometers.info/world-population/south-africa-population/) |
| South Korea | KR | 410 | 51,600,388 | 5 | [Worldometer](https://www.worldometers.info/world-population/south-korea-population/) |
| Spain | ES | 724 | 47,850,793 | 4 | [Worldometer](https://www.worldometers.info/world-population/spain-population/) |
| Sweden | SE | 752 | 10,701,047 | 3 | [Worldometer](https://www.worldometers.info/world-population/sweden-population/) |
| Switzerland | CH | 756 | 9,007,798 | 2 | [Worldometer](https://www.worldometers.info/world-population/switzerland-population/) |
| Tanzania | TZ | 834 | 72,563,780 | 5 | [Worldometer](https://www.worldometers.info/world-population/tanzania-population/) |
| Thailand | TH | 764 | 71,559,614 | 5 | [Worldometer](https://www.worldometers.info/world-population/thailand-population/) |
| Türkiye | TR | 792 | 87,926,082 | 6 | [Worldometer](https://www.worldometers.info/world-population/turkey-population/) |
| United Kingdom | GB | 826 | 69,931,528 | 5 | [Worldometer](https://www.worldometers.info/world-population/uk-population/) |
| United States | US | 840 | 349,035,494 | 9 | [Worldometer](https://www.worldometers.info/world-population/us-population/) |
| Vietnam | VN | 704 | 102,177,431 | 7 | [Worldometer](https://www.worldometers.info/world-population/vietnam-population/) |
| Zambia | ZM | 894 | 22,521,915 | 3 | [Worldometer](https://www.worldometers.info/world-population/zambia-population/) |
