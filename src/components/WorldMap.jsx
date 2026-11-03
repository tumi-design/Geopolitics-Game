import { useEffect, useState } from 'react';
import { CRS } from 'leaflet';
import { MapContainer, GeoJSON, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const WORLD_BOUNDS = [[-57, -180], [84, 180]];

function MapControls() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
      map.fitBounds(WORLD_BOUNDS, { animate: false });
    });
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return <button type="button" className="reset-map" onClick={() => map.fitBounds(WORLD_BOUNDS, { animate: false })}>Reset zoom ↗</button>;
}

export default function WorldMap({ countries, selectedId, onSelect, game }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/world-countries.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Map unavailable');
        return response.json();
      }).then((json) => {
        if (json.type !== 'FeatureCollection' || !Array.isArray(json.features)) throw new Error('Invalid map data');
        setData(json);
      }).catch((failure) => { if (failure.name !== 'AbortError') setError(true); });
    return () => controller.abort();
  }, [attempt]);

  const selectable = new Map(countries.map((country) => [country.id, country]));
  function countryStyle(feature) {
    const country = selectable.get(feature.id);
    const isHuman = game ? game.players.find((player) => player.id === country?.ownerId)?.isHuman : feature.id === selectedId;
    return {
      fillColor: feature.id === selectedId ? '#FFFFFF' : country ? isHuman ? '#FFFFFF' : game ? '#B8A58A' : '#46544D' : '#252E38',
      fillOpacity: 1,
      color: '#161B22',
      weight: feature.id === selectedId ? 2 : 0.7,
    };
  }
  function attachCountry(feature, layer) {
    const country = selectable.get(feature.id);
    if (!country) return;
    layer.on({
      add: () => {
        const element = layer.getElement();
        element?.setAttribute('data-country-id', country.id);
        element?.setAttribute('aria-label', `Inspect ${country.name}`);
        element?.setAttribute('role', 'button');
        element?.setAttribute('tabindex', '0');
        element?.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(country.id);
          }
        });
      },
      click: () => onSelect(country.id),
      mouseover: () => layer.setStyle(countryStyle(feature).fillColor === '#FFFFFF'
        ? countryStyle(feature) : { fillOpacity: 0.75, weight: 1.5 }),
      mouseout: () => layer.setStyle(countryStyle(feature)),
    });
    const tooltip = document.createElement('span');
    tooltip.textContent = `${country.name}${game ? ` · ${country.soldiers} soldiers` : ''}`;
    layer.bindTooltip(tooltip, { sticky: true, direction: 'top' });
  }
  return <section className="map-card" aria-labelledby="map-title">
    <div className="map-heading"><div><span className="eyebrow">02 / WORLD ATLAS</span><h2 id="map-title">The world, at a glance</h2></div><span className="map-status"><span />{game ? '10 participating countries' : 'Choose your perspective'}</span></div>
    <div className="map-frame">
      {!data && !error && <p className="map-feedback" role="status">Loading world map…</p>}
      {error && <div className="map-feedback" role="alert"><p>The map could not load. You can still use the country list.</p><button type="button" className="secondary-button" onClick={() => { setError(false); setAttempt(attempt + 1); }}>Retry map</button></div>}
      {data && !error && <MapContainer crs={CRS.EPSG4326} bounds={WORLD_BOUNDS} maxBounds={[[-85, -190], [88, 190]]}
        minZoom={-2} maxZoom={5} zoomSnap={0} zoomDelta={0.5} scrollWheelZoom={false}
        zoomAnimation={false} fadeAnimation={false} attributionControl={false}>
        <GeoJSON key={`${selectedId}-${countries.map((country) => `${country.id}:${country.ownerId ?? ''}:${country.soldiers ?? ''}`).join(',')}`}
          data={data} style={countryStyle} onEachFeature={attachCountry} />
        <MapControls />
      </MapContainer>}
    </div>
    <div className="map-footer"><div className="map-legend"><span><i className="legend-dot selected-dot" />{game ? 'You' : 'Selected'}</span><span><i className={`legend-dot ${game ? 'npc-dot' : 'available-dot'}`} />{game ? 'NPC' : 'Available'}</span><span><i className="legend-dot inactive-dot" />{game ? 'Outside this game' : 'Outside game catalogue'}</span></div><small>Use + / − to zoom</small></div>
    <p className="map-attribution">Boundaries: <a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth</a> / world-atlas</p>
  </section>;
}
