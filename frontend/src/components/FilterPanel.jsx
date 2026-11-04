import { WASTE_TYPES, PAYMENT_TYPES } from '../data/wasteTypes.js';

/**
 * FilterPanel - Sidebar with waste type filters, payment/source filters,
 * OSM data toggle, and action buttons.
 */
export default function FilterPanel({
  isOpen,
  onClose,
  filters,
  onToggleType,
  onPaymentChange,
  onSourceChange,
  onClearFilters,
  onAddPoint,
  onImportOsm,
  importing,
  pointCount,
  showOsm,
  onToggleOsm,
  loading,
}) {
  const hasActiveFilters =
    filters.types.size > 0 || filters.payment !== 'all' || filters.source !== 'all';

  return (
    <aside className={`filter-panel ${isOpen ? 'open' : ''}`}>
      <button className="filter-close-btn" onClick={onClose} aria-label="Cerrar">
        ✕
      </button>
      <div className="filter-panel-header">
        <div className="logo">♻️</div>
        <h1>EcoMapa</h1>
        <p>Encuentra donde llevar tu basura</p>
      </div>

      {/* Point count */}
      <div className="point-count">
        <strong>{pointCount}</strong> puntos visibles
      </div>

      {/* Waste type filters */}
      <div className="filter-section">
        <h3>Tipos de residuo</h3>
        <div className="type-chips">
          {WASTE_TYPES.map((t) => (
            <button
              key={t.id}
              className={`type-chip ${filters.types.has(t.id) ? 'active' : ''}`}
              onClick={() => onToggleType(t.id)}
              title={t.label}
            >
              <span className="chip-icon">{t.icon}</span>
              <span className="chip-color" style={{ background: t.color }} />
              {t.label}
            </button>
          ))}
        </div>
        {hasActiveFilters && (
          <button className="clear-filters" onClick={onClearFilters}>
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Payment filter */}
      <div className="filter-section">
        <h3>Pago</h3>
        <select
          className="filter-select"
          value={filters.payment}
          onChange={(e) => onPaymentChange(e.target.value)}
        >
          <option value="all">Todos</option>
          {PAYMENT_TYPES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Source filter */}
      <div className="filter-section">
        <h3>Origen de los datos</h3>
        <select
          className="filter-select"
          value={filters.source}
          onChange={(e) => onSourceChange(e.target.value)}
        >
          <option value="all">Todas las fuentes</option>
          <option value="user">Registros de usuarios</option>
          <option value="osm">OpenStreetMap</option>
        </select>
      </div>

      {/* OSM real-time toggle */}
      <div className="filter-section">
        <h3>Datos en tiempo real</h3>
        <div className="toggle-row">
          <label htmlFor="osm-toggle">OpenStreetMap en vivo</label>
          <button
            id="osm-toggle"
            className={`toggle ${showOsm ? 'active' : ''}`}
            onClick={onToggleOsm}
            aria-label="Toggle OSM data"
          />
        </div>
        <p style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '4px' }}>
          Muestra centros de reciclaje de OpenStreetMap directamente en el mapa
        </p>
      </div>

      {/* Action buttons */}
      <div className="filter-section">
        <div className="btn-group">
          <button className="btn btn-primary" onClick={onAddPoint}>
            ➕ Agregar punto de recoleccion
          </button>
          <button
            className="btn btn-secondary"
            onClick={onImportOsm}
            disabled={importing}
          >
            {importing ? (
              <>
                <span className="loading-spinner" /> Importando...
              </>
            ) : (
              <>📥 Importar desde OpenStreetMap</>
            )}
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '12px', fontSize: '0.8rem', opacity: 0.7 }}>
          <span className="loading-spinner" style={{ borderTopColor: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.3)' }} />
          {' '}Cargando...
        </div>
      )}
    </aside>
  );
}
