/**
 * PresentationMapper.gs
 * Responsabilidad única: traducir el JSON interno del presupuesto (claves
 * en inglés, tal como lo genera la IA) al JSON de presentación en español
 * que ve el usuario, en el orden acordado con el Product Owner.
 *
 * No es una capa de extracción ni de negocio: no inventa datos, no elimina
 * información, no duplica campos. Únicamente renombra y reordena.
 *
 * Cualquier campo técnico o interno (p. ej. "warnings", usado solo para
 * depuración) se descarta aquí y nunca llega al frontend ni al PDF.
 *
 * Si en el futuro la IA extrae campos nuevos que no tengan traducción
 * definida en este archivo, no se mostrarán (fail-safe): hay que añadirlos
 * aquí explícitamente antes de que sean visibles, nunca al revés.
 */

/**
 * Orden y traducción de los campos de cabecera del presupuesto.
 * Orden pensado para la lectura natural de quien revisa un presupuesto:
 * identificación → cliente → líneas de producto → importes → observaciones.
 */
const HEADER_FIELD_ORDER_ = [
  { key: 'budgetNumber', label: 'Presupuesto' },
  { key: 'budgetDate', label: 'Fecha' },
  { key: 'seller', label: 'Vendedor' },
  { key: 'store', label: 'Tienda' },
  { key: 'customerName', label: 'Cliente' },
  { key: 'customerPhone', label: 'Teléfono' },
  { key: 'customerEmail', label: 'Correo electrónico' },
  { key: 'customerAddress', label: 'Dirección' }
];

const TOTALS_FIELD_ORDER_ = [
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'discount', label: 'Descuento' },
  { key: 'tax', label: 'IVA' },
  { key: 'total', label: 'Total' }
];

const ITEMS_LABEL_ = 'Líneas del presupuesto';
const OBSERVATIONS_FIELD_ = { key: 'observations', label: 'Observaciones' };

/**
 * Orden y traducción exactos de cada línea de producto, fijado por el
 * Product Owner: Referencia, Designación, Cantidad, Precio €, %, Total, Línea.
 */
const ITEM_FIELD_ORDER_ = [
  { key: 'reference', label: 'Referencia' },
  { key: 'description', label: 'Designación' },
  { key: 'quantity', label: 'Cantidad' },
  { key: 'unitPrice', label: 'Precio €' },
  { key: 'discountPercent', label: '%' },
  { key: 'lineTotal', label: 'Total' },
  { key: 'lineNumber', label: 'Línea' }
];

/**
 * Traduce el JSON interno del presupuesto al JSON de presentación en
 * español. Los campos ausentes en el origen (p. ej. "budgetNumber", que
 * la IA todavía no extrae) simplemente no aparecen en el resultado.
 *
 * @param {Object} budget JSON interno (claves en inglés)
 * @return {Object} JSON de presentación (claves en español, orden fijado)
 */
function mapBudgetToSpanish(budget) {
  if (!budget || typeof budget !== 'object') return budget;

  const out = {};

  HEADER_FIELD_ORDER_.forEach(function (field) {
    copyIfPresent_(out, budget, field.key, field.label);
  });

  if (Array.isArray(budget.items)) {
    out[ITEMS_LABEL_] = budget.items.map(mapItemToSpanish_);
  }

  TOTALS_FIELD_ORDER_.forEach(function (field) {
    copyIfPresent_(out, budget, field.key, field.label);
  });

  copyIfPresent_(out, budget, OBSERVATIONS_FIELD_.key, OBSERVATIONS_FIELD_.label);

  // Deliberadamente NO se copia "warnings": es información técnica de
  // depuración, no forma parte del presupuesto y no debe llegar al usuario.

  return out;
}

/**
 * Traduce una línea de producto al orden y nombres exactos acordados.
 */
function mapItemToSpanish_(item) {
  const out = {};
  ITEM_FIELD_ORDER_.forEach(function (field) {
    out[field.label] = (item && Object.prototype.hasOwnProperty.call(item, field.key))
      ? item[field.key]
      : null;
  });
  return out;
}

/**
 * Copia budget[key] a out[label] solo si la clave existe en el origen
 * (aunque su valor sea null: un campo detectado pero vacío debe poder
 * seguir siendo editado por el usuario). Si la clave no existe en
 * absoluto, no se añade nada.
 */
function copyIfPresent_(out, budget, key, label) {
  if (Object.prototype.hasOwnProperty.call(budget, key)) {
    out[label] = budget[key];
  }
}
