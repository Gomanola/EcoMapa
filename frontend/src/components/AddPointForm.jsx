import { useState } from 'react';
import { WASTE_TYPES, PAYMENT_TYPES } from '../data/wasteTypes.js';

/**
 * AddPointForm - Right-side panel form for submitting a new collection point.
 * The user clicks on the map to set the location, then fills in the details.
 *
 * Props:
 *  onClose        - callback to close the form
 *  onSubmit       - callback(pointData) to create the point
 *  addMode        - boolean, true when map clicks set coordinates
 *  setAddMode     - callback to toggle add mode
 *  newPointCoords - { lat, lng } selected on the map, or null
 *  defaultCoords  - [lat, lng] fallback if user hasn't clicked yet
 */
export default function AddPointForm({
  onClose,
  onSubmit,
  addMode,
  setAddMode,
  newPointCoords,
  defaultCoords,
}) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    types: [],
    paymentType: 'none',
    paymentAmount: '',
    paymentUnit: 'kg',
    phone: '',
    hours: '',
    website: '',
    submittedBy: '',
  });
  const [errors, setErrors] = useState({});

  const coords = newPointCoords || {
    lat: defaultCoords?.[0],
    lng: defaultCoords?.[1],
  };

  function updateField(field, value) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function toggleType(type) {
    setFormData((prev) => {
      const types = prev.types.includes(type)
        ? prev.types.filter((t) => t !== type)
        : [...prev.types, type];
      return { ...prev, types };
    });
  }

  function validate() {
    const errs = {};
    if (!formData.name.trim()) errs.name = 'El nombre es obligatorio';
    if (formData.types.length === 0) errs.types = 'Selecciona al menos un tipo de residuo';
    if (!newPointCoords) errs.location = 'Haz clic en el mapa para ubicar tu centro';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    const point = {
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      lat: coords.lat,
      lng: coords.lng,
      types: formData.types,
      paymentType: formData.paymentType,
      paymentAmount:
        formData.paymentType === 'charge' || formData.paymentType === 'pay'
          ? Number(formData.paymentAmount) || undefined
          : undefined,
      paymentUnit: formData.paymentAmount ? formData.paymentUnit : undefined,
      phone: formData.phone.trim() || undefined,
      hours: formData.hours.trim() || undefined,
      website: formData.website.trim() || undefined,
      source: 'user',
      submittedBy: formData.submittedBy.trim() || undefined,
    };

    onSubmit(point);
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>➕ Agregar punto de recoleccion</h3>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          {/* Location prompt */}
          <div className={`map-prompt ${newPointCoords ? 'success' : ''}`}>
            {newPointCoords ? (
              <>✅ Ubicacion seleccionada en el mapa</>
            ) : (
              <>👆 Haz clic en el mapa para ubicar tu centro de recoleccion</>
            )}
          </div>

          {coords && (
            <div className="coords-display">
              <span>
                <strong>Lat:</strong> {coords.lat?.toFixed(5)}
              </span>
              <span>
                <strong>Lng:</strong> {coords.lng?.toFixed(5)}
              </span>
            </div>
          )}
          {errors.location && (
            <div style={{ color: 'var(--eco-error)', fontSize: '0.8rem', marginTop: '4px' }}>
              {errors.location}
            </div>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: '10px', marginBottom: '16px' }}
            onClick={() => setAddMode(true)}
          >
            📍 {newPointCoords ? 'Cambiar ubicacion' : 'Seleccionar en el mapa'}
          </button>

          {/* Name */}
          <div className="form-group">
            <label htmlFor="name">
              Nombre del centro * <span style={{ color: 'var(--eco-error)' }}>{errors.name}</span>
            </label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="Ej: Centro de reciclaje Mi Barrio"
            />
          </div>

          {/* Description */}
          <div className="form-group">
            <label htmlFor="description">Descripcion</label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Informacion adicional sobre el centro"
            />
          </div>

          {/* Waste types */}
          <div className="form-group">
            <label>
              Tipos de residuo que aceptan *{' '}
              <span style={{ color: 'var(--eco-error)' }}>{errors.types}</span>
            </label>
            <div className="type-selector">
              {WASTE_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`type-option ${formData.types.includes(t.id) ? 'selected' : ''}`}
                  onClick={() => toggleType(t.id)}
                >
                  <span className="type-color" style={{ background: t.color }} />
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Payment type */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="paymentType">¿Cobran o pagan?</label>
              <select
                id="paymentType"
                value={formData.paymentType}
                onChange={(e) => updateField('paymentType', e.target.value)}
              >
                <option value="none">Sin informacion</option>
                <option value="free">Gratis</option>
                <option value="pay">Pagan por material</option>
                <option value="charge">Cobran por servicio</option>
              </select>
            </div>
          </div>

          {/* Payment amount (only for charge/pay) */}
          {(formData.paymentType === 'charge' || formData.paymentType === 'pay') && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="paymentAmount">
                  {formData.paymentType === 'pay' ? 'Cuanto pagan' : 'Cuanto cobran'}
                </label>
                <input
                  id="paymentAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.paymentAmount}
                  onChange={(e) => updateField('paymentAmount', e.target.value)}
                  placeholder="Ej: 5.00"
                />
              </div>
              <div className="form-group">
                <label htmlFor="paymentUnit">Unidad</label>
                <select
                  id="paymentUnit"
                  value={formData.paymentUnit}
                  onChange={(e) => updateField('paymentUnit', e.target.value)}
                >
                  <option value="kg">por kilo</option>
                  <option value="unit">por pieza</option>
                  <option value="load">por carga</option>
                </select>
              </div>
            </div>
          )}

          {/* Contact info */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="phone">Telefono</label>
              <input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                placeholder="55 1234 5678"
              />
            </div>
            <div className="form-group">
              <label htmlFor="hours">Horario</label>
              <input
                id="hours"
                type="text"
                value={formData.hours}
                onChange={(e) => updateField('hours', e.target.value)}
                placeholder="L-V 9-18, S 9-14"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="website">Sitio web</label>
            <input
              id="website"
              type="url"
              value={formData.website}
              onChange={(e) => updateField('website', e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="submittedBy">Tu nombre (opcional)</label>
            <input
              id="submittedBy"
              type="text"
              value={formData.submittedBy}
              onChange={(e) => updateField('submittedBy', e.target.value)}
              placeholder="Para dar credito al registro"
            />
          </div>

          <div style={{ padding: '0 20px 20px' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--eco-muted)', marginBottom: '12px' }}>
              Los puntos registrados por usuarios se marcan como no verificados.
              Un administrador puede verificarlos despues.
            </p>
            <div className="modal-footer" style={{ padding: 0, borderTop: 'none' }}>
              <button type="button" className="btn btn-cancel" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary">
                Guardar punto
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
