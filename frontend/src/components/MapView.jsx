import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { getWasteType, getPaymentType } from '../data/wasteTypes.js';

/**
 * MapView - Interactive Leaflet map showing waste collection points.
 *
 * Uses plain Leaflet (not react-leaflet) for full control over marker
 * lifecycle, custom icons, popups, route drawing, and click handling.
 *
 * Props:
 *  points          - array of CollectionPoint objects to display
 *  selectedPoint   - currently selected point (gets highlighted marker)
 *  onSelectPoint   - callback when a marker is clicked
 *  route           - { geometry: GeoJSON, distanceKm, durationMin } or null
 *  userLocation    - { lat, lng } or null
 *  addMode         - boolean, when true map clicks set new point coords
 *  onMapClick      - callback(lat, lng) for map clicks
 *  newPointCoords  - { lat, lng } for the marker being added
 *  onMapMove       - callback(center, bbox) when the map pans/zooms
 *  center          - [lat, lng] initial map center
 */
export default function MapView({
  points,
  selectedPoint,
  onSelectPoint,
  route,
  userLocation,
  addMode,
  onMapClick,
  newPointCoords,
  onMapMove,
  center,
}) {
  const mapRef = useRef(null);
  const map = useRef(null);
  const markersLayer = useRef(null);
  const routeLayer = useRef(null);
  const userMarker = useRef(null);
  const newPointMarker = useRef(null);
  const hasCentered = useRef(false);

  // Refs to always call the latest callbacks (avoid stale closures)
  const onSelectPointRef = useRef(onSelectPoint);
  const onMapClickRef = useRef(onMapClick);
  const onMapMoveRef = useRef(onMapMove);

  useEffect(() => {
    onSelectPointRef.current = onSelectPoint;
    onMapClickRef.current = onMapClick;
    onMapMoveRef.current = onMapMove;
  });

  // --- Initialize map (once) ---
  useEffect(() => {
    if (map.current || !mapRef.current) return;

    map.current = L.map(mapRef.current, {
      center: center || [19.4326, -99.1332],
      zoom: 12,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map.current);

    markersLayer.current = L.layerGroup().addTo(map.current);
    routeLayer.current = L.layerGroup().addTo(map.current);

    // Map click handler (for add mode)
    map.current.on('click', (e) => {
      onMapClickRef.current?.(e.latlng.lat, e.latlng.lng);
    });

    // Map move handler (for OSM data fetching)
    map.current.on('moveend', () => {
      if (!map.current) return;
      const c = map.current.getCenter();
      const b = map.current.getBounds();
      onMapMoveRef.current?.(
        { lat: c.lat, lng: c.lng },
        { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }
      );
    });

    // Fix map size for flex containers
    setTimeout(() => map.current?.invalidateSize(), 100);

    // Fire initial moveend for OSM data
    setTimeout(() => {
      if (!map.current) return;
      const c = map.current.getCenter();
      const b = map.current.getBounds();
      onMapMoveRef.current?.(
        { lat: c.lat, lng: c.lng },
        { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }
      );
    }, 200);

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line

  // --- Center map when user location arrives ---
  useEffect(() => {
    if (map.current && center && !hasCentered.current) {
      map.current.setView(center, 13);
      hasCentered.current = true;
    }
  }, [center]);

  // --- Toggle crosshair cursor in add mode ---
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.classList.toggle('add-mode', addMode);
    }
  }, [addMode]);

  // --- Update markers when points change ---
  useEffect(() => {
    if (!markersLayer.current) return;
    markersLayer.current.clearLayers();

    points.forEach((point) => {
      if (point.lat == null || point.lng == null) return;

      const isSelected = selectedPoint?.pointId === point.pointId;
      const icon = createMarkerIcon(point, isSelected);
      const marker = L.marker([point.lat, point.lng], { icon, zIndexOffset: isSelected ? 1000 : 0 });

      marker.bindPopup(createPopupContent(point), { maxWidth: 280 });
      marker.on('click', () => onSelectPointRef.current?.(point));

      marker.addTo(markersLayer.current);
    });
  }, [points, selectedPoint]);

  // --- Pan to selected point ---
  useEffect(() => {
    if (selectedPoint && map.current) {
      map.current.panTo([selectedPoint.lat, selectedPoint.lng], { animate: true, duration: 0.5 });
    }
  }, [selectedPoint]);

  // --- Draw / clear route ---
  useEffect(() => {
    if (!routeLayer.current) return;
    routeLayer.current.clearLayers();

    if (route?.geometry) {
      L.geoJSON(route.geometry, {
        style: {
          color: '#16a34a',
          weight: 5,
          opacity: 0.85,
          lineJoin: 'round',
        },
      }).addTo(routeLayer.current);
    }
  }, [route]);

  // --- User location marker ---
  useEffect(() => {
    if (!map.current) return;

    if (userMarker.current) {
      userMarker.current.remove();
      userMarker.current = null;
    }

    if (userLocation) {
      userMarker.current = L.marker([userLocation.lat, userLocation.lng], {
        icon: L.divIcon({
          className: 'user-location-marker',
          html: '<div class="user-location-inner"></div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
        zIndexOffset: 500,
      }).addTo(map.current);
      userMarker.current.bindPopup('Tu ubicacion');
    }
  }, [userLocation]);

  // --- New point marker (during add mode) ---
  useEffect(() => {
    if (!map.current) return;

    if (newPointMarker.current) {
      newPointMarker.current.remove();
      newPointMarker.current = null;
    }

    if (newPointCoords) {
      newPointMarker.current = L.marker([newPointCoords.lat, newPointCoords.lng], {
        icon: L.divIcon({
          className: 'new-point-marker',
          html: '<div class="new-point-inner"><span>\u{1F4CD}</span></div>',
          iconSize: [36, 36],
          iconAnchor: [18, 36],
        }),
        zIndexOffset: 1500,
      }).addTo(map.current);
      map.current.panTo([newPointCoords.lat, newPointCoords.lng]);
    }
  }, [newPointCoords]);

  return <div ref={mapRef} className="map-container" />;
}

// ---------------------------------------------------------------------------
// Helper: create a custom Leaflet divIcon for a collection point
// ---------------------------------------------------------------------------
function createMarkerIcon(point, isSelected) {
  const wasteType = getWasteType(point.primaryType);
  const color = wasteType?.color || '#16a34a';
  const icon = wasteType?.icon || '\u{1F4CD}';
  const size = isSelected ? 44 : 36;

  return L.divIcon({
    className: `custom-marker${isSelected ? ' custom-marker-selected' : ''}`,
    html: `<div class="custom-marker-inner" style="background:${color}"><span>${icon}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [Math.round(size / 2), size],
    popupAnchor: [0, -size],
  });
}

// ---------------------------------------------------------------------------
// Helper: build popup HTML content for a collection point
// ---------------------------------------------------------------------------
function createPopupContent(point) {
  const types = (point.types || [])
    .map((t) => {
      const wt = getWasteType(t);
      return `<span class="popup-type-badge" style="background:${wt?.color || '#666'}">${wt?.icon || ''} ${wt?.label || t}</span>`;
    })
    .join('');

  const payment = getPaymentType(point.paymentType);
  let paymentHtml = '';
  if (point.paymentType && point.paymentType !== 'none') {
    let amount = '';
    if (point.paymentAmount) {
      amount = `: $${point.paymentAmount}/${point.paymentUnit || 'kg'}`;
    }
    paymentHtml = `<div class="popup-payment ${point.paymentType}">${payment.label}${amount}</div>`;
  }

  let metaHtml = '';
  if (point.address) metaHtml += `<div class="popup-meta">\u{1F4CD} ${point.address}</div>`;
  if (point.hours) metaHtml += `<div class="popup-meta">\u{1F551} ${point.hours}</div>`;
  if (point.phone) metaHtml += `<div class="popup-meta">\u{1F4DE} ${point.phone}</div>`;

  const sourceLabels = {
    osm: 'OpenStreetMap',
    user: 'Registro de usuario',
    google: 'Google Maps',
    government: 'Datos abiertos',
  };
  const sourceLabel = sourceLabels[point.source] || point.source;

  let descHtml = '';
  if (point.description) {
    descHtml = `<div class="popup-meta">${point.description}</div>`;
  }

  return `
    <div class="popup-content">
      <h4>${point.name}</h4>
      <div class="popup-types">${types}</div>
      ${paymentHtml}
      ${metaHtml}
      ${descHtml}
      <div class="popup-source">Fuente: ${sourceLabel}${point.verified ? ' \u2713' : ''}</div>
    </div>
  `;
}
