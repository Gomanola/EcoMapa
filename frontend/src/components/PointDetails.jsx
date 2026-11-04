import { getWasteType, getPaymentType } from '../data/wasteTypes.js';

/**
 * PointDetails - Floating panel showing detailed info about a selected
 * collection point, including route planning.
 */
export default function PointDetails({ point, onClose, onRoute, routeLoading, route }) {
  const payment = getPaymentType(point.paymentType);

  return (
    <div className="point-details">
      <div className="point-details-header">
        <h3>{point.name}</h3>
        <button className="point-details-close" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
      </div>

      <div className="point-details-body">
        {/* Waste types */}
        <div className="detail-types">
          {(point.types || []).map((t) => {
            const wt = getWasteType(t);
            return (
              <span
                key={t}
                className="detail-type-badge"
                style={{ background: wt?.color || '#666' }}
              >
                {wt?.icon} {wt?.label || t}
              </span>
            );
          })}
        </div>

        {/* Payment info */}
        {point.paymentType && point.paymentType !== 'none' && (
          <div className="detail-row">
            <span className="detail-icon">💰</span>
            <span className="detail-label">Pago:</span>
            <span className="detail-value">
              <span className={`payment-badge ${point.paymentType}`}>
                {payment.label}
                {point.paymentAmount
                  ? ` $${point.paymentAmount}/${point.paymentUnit || 'kg'}`
                  : ''}
              </span>
            </span>
          </div>
        )}

        {/* Address */}
        {point.address && (
          <div className="detail-row">
            <span className="detail-icon">📍</span>
            <span className="detail-label">Direccion:</span>
            <span className="detail-value">{point.address}</span>
          </div>
        )}

        {/* Hours */}
        {point.hours && (
          <div className="detail-row">
            <span className="detail-icon">🕐</span>
            <span className="detail-label">Horario:</span>
            <span className="detail-value">{point.hours}</span>
          </div>
        )}

        {/* Phone */}
        {point.phone && (
          <div className="detail-row">
            <span className="detail-icon">📞</span>
            <span className="detail-label">Telefono:</span>
            <span className="detail-value">
              <a href={`tel:${point.phone}`} style={{ color: 'var(--eco-primary)' }}>
                {point.phone}
              </a>
            </span>
          </div>
        )}

        {/* Website */}
        {point.website && (
          <div className="detail-row">
            <span className="detail-icon">🔗</span>
            <span className="detail-label">Sitio:</span>
            <span className="detail-value">
              <a
                href={point.website}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--eco-primary)', wordBreak: 'break-all' }}
              >
                {point.website}
              </a>
            </span>
          </div>
        )}

        {/* Description */}
        {point.description && (
          <div className="detail-row">
            <span className="detail-icon">📝</span>
            <span className="detail-label">Info:</span>
            <span className="detail-value">{point.description}</span>
          </div>
        )}

        {/* Source + verification */}
        <div className="detail-row">
          <span className="detail-icon">📊</span>
          <span className="detail-label">Fuente:</span>
          <span className="detail-value">
            {point.source === 'osm'
              ? 'OpenStreetMap'
              : point.source === 'user'
              ? 'Registro de usuario'
              : point.source === 'google'
              ? 'Google Maps'
              : point.source === 'government'
              ? 'Datos abiertos'
              : point.source}
            {point.verified && ' ✓ verificado'}
          </span>
        </div>

        {/* Distance (if available from nearby query) */}
        {point.distance != null && (
          <div className="detail-row">
            <span className="detail-icon">📏</span>
            <span className="detail-label">Distancia:</span>
            <span className="detail-value">{point.distance} km</span>
          </div>
        )}

        {/* Route info */}
        {route && (
          <div className="route-info">
            <div style={{ marginBottom: '4px' }}>🛣️ Ruta calculada</div>
            <div className="route-distance">{route.distanceKm} km</div>
            <div style={{ color: 'var(--eco-muted)' }}>
              Aprox. {route.durationMin} min en auto
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="detail-actions">
          <button className="btn btn-primary" onClick={onRoute} disabled={routeLoading}>
            {routeLoading ? (
              <>
                <span className="loading-spinner" /> Calculando...
              </>
            ) : (
              <>🛣️ Trazar ruta</>
            )}
          </button>
          <button className="btn btn-cancel" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
