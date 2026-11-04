import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import MapView from './components/MapView.jsx';
import FilterPanel from './components/FilterPanel.jsx';
import PointDetails from './components/PointDetails.jsx';
import AddPointForm from './components/AddPointForm.jsx';
import {
  getPoints,
  createPoint,
  importFromOsm,
  getOsmPoints,
  getRoute,
} from './services/api.js';

const DEFAULT_CENTER = [19.4326, -99.1332]; // Mexico City

export default function App() {
  // --- Data state ---
  const [apiPoints, setApiPoints] = useState([]);
  const [osmPoints, setOsmPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);

  // --- UI state ---
  const [filters, setFilters] = useState({
    types: new Set(),
    payment: 'all',
    source: 'all',
  });
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [newPointCoords, setNewPointCoords] = useState(null);
  const [route, setRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [showOsm, setShowOsm] = useState(false);
  const [mapBbox, setMapBbox] = useState(null);

  const osmRequestRef = useRef(0);

  // --- Fetch points from backend ---
  const fetchPoints = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const points = await getPoints();
      setApiPoints(points);
    } catch (err) {
      console.error('Error fetching points:', err);
      setError(
        'No se pudieron cargar los puntos del servidor. Asegurate de haber desplegado el backend con CDK. Puedes usar los datos de OpenStreetMap mientras tanto.'
      );
      // Auto-enable OSM data when API is unavailable
      setShowOsm(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // --- Get user's geolocation on mount ---
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        (err) => console.log('Geolocation denied:', err.message),
        { timeout: 10000, enableHighAccuracy: false }
      );
    }
  }, []);

  // --- Initial data fetch ---
  useEffect(() => {
    fetchPoints();
  }, [fetchPoints]);

  // --- Fetch OSM points when toggle is on or map moves ---
  const fetchOsmForBbox = useCallback(
    async (bbox) => {
      if (!bbox || !showOsm) return;
      const reqId = ++osmRequestRef.current;
      try {
        const points = await getOsmPoints(bbox);
        // Ignore stale responses
        if (reqId === osmRequestRef.current) {
          setOsmPoints(points);
        }
      } catch (err) {
        console.error('OSM fetch error:', err);
      }
    },
    [showOsm]
  );

  // Re-fetch OSM when toggled on
  useEffect(() => {
    if (showOsm && mapBbox) {
      fetchOsmForBbox(mapBbox);
    }
  }, [showOsm]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Filtered + deduplicated points ---
  const filteredPoints = useMemo(() => {
    const all = showOsm ? [...apiPoints, ...osmPoints] : apiPoints;

    // Deduplicate by rounded coordinates
    const seen = new Set();
    const deduped = all.filter((p) => {
      const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return deduped.filter((p) => {
      // Waste type filter (OR logic: show if point accepts ANY selected type)
      if (filters.types.size > 0) {
        if (!p.types?.some((t) => filters.types.has(t))) return false;
      }
      // Payment filter
      if (filters.payment !== 'all' && p.paymentType !== filters.payment) return false;
      // Source filter
      if (filters.source !== 'all' && p.source !== filters.source) return false;
      return true;
    });
  }, [apiPoints, osmPoints, showOsm, filters]);

  // --- Handlers ---
  const handleAddPoint = async (pointData) => {
    try {
      await createPoint(pointData);
      await fetchPoints();
      setShowAddForm(false);
      setAddMode(false);
      setNewPointCoords(null);
    } catch (err) {
      alert(`Error al crear punto: ${err.message}`);
    }
  };

  const handleImportOsm = async () => {
    const center = userLocation || { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] };
    setImporting(true);
    try {
      const result = await importFromOsm(center.lat, center.lng, 50000);
      alert(
        `Importacion completada:\n` +
          `${result.imported} puntos importados\n` +
          `${result.skipped} omitidos (duplicados)\n` +
          `${result.totalFound} encontrados en OpenStreetMap`
      );
      await fetchPoints();
    } catch (err) {
      alert(`Error al importar: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleRoute = async (point) => {
    if (!userLocation) {
      alert(
        'Necesitamos tu ubicacion para trazar la ruta. Por favor permite el acceso a tu ubicacion en el navegador.'
      );
      return;
    }
    setRouteLoading(true);
    try {
      const r = await getRoute(userLocation.lat, userLocation.lng, point.lat, point.lng);
      if (r) {
        setRoute(r);
      } else {
        alert('No se encontro una ruta entre tu ubicacion y este punto.');
      }
    } catch (err) {
      alert(`Error al calcular la ruta: ${err.message}`);
    } finally {
      setRouteLoading(false);
    }
  };

  const handleMapClick = useCallback(
    (lat, lng) => {
      if (addMode) {
        setNewPointCoords({ lat, lng });
      }
    },
    [addMode]
  );

  const handleMapMove = useCallback(
    (center, bbox) => {
      setMapBbox(bbox);
      if (showOsm) {
        fetchOsmForBbox(bbox);
      }
    },
    [showOsm, fetchOsmForBbox]
  );

  const toggleTypeFilter = (type) => {
    setFilters((prev) => {
      const types = new Set(prev.types);
      if (types.has(type)) types.delete(type);
      else types.add(type);
      return { ...prev, types };
    });
  };

  const clearFilters = () => {
    setFilters({ types: new Set(), payment: 'all', source: 'all' });
  };

  return (
    <div className="app">
      <FilterPanel
        filters={filters}
        onToggleType={toggleTypeFilter}
        onPaymentChange={(payment) => setFilters((p) => ({ ...p, payment }))}
        onSourceChange={(source) => setFilters((p) => ({ ...p, source }))}
        onClearFilters={clearFilters}
        onAddPoint={() => {
          setShowAddForm(true);
          setAddMode(true);
        }}
        onImportOsm={handleImportOsm}
        importing={importing}
        pointCount={filteredPoints.length}
        showOsm={showOsm}
        onToggleOsm={() => setShowOsm(!showOsm)}
        loading={loading}
      />

      <MapView
        points={filteredPoints}
        selectedPoint={selectedPoint}
        onSelectPoint={setSelectedPoint}
        route={route}
        userLocation={userLocation}
        addMode={addMode}
        onMapClick={handleMapClick}
        newPointCoords={newPointCoords}
        onMapMove={handleMapMove}
        center={userLocation ? [userLocation.lat, userLocation.lng] : DEFAULT_CENTER}
      />

      {selectedPoint && (
        <PointDetails
          point={selectedPoint}
          onClose={() => {
            setSelectedPoint(null);
            setRoute(null);
          }}
          onRoute={() => handleRoute(selectedPoint)}
          routeLoading={routeLoading}
          route={route}
        />
      )}

      {showAddForm && (
        <AddPointForm
          onClose={() => {
            setShowAddForm(false);
            setAddMode(false);
            setNewPointCoords(null);
          }}
          onSubmit={handleAddPoint}
          addMode={addMode}
          setAddMode={setAddMode}
          newPointCoords={newPointCoords}
          defaultCoords={
            userLocation
              ? [userLocation.lat, userLocation.lng]
              : DEFAULT_CENTER
          }
        />
      )}

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => fetchPoints()}>Reintentar</button>
        </div>
      )}
    </div>
  );
}
