/**
 * BudgetNormalizer.gs
 * Responsabilidad unica: dejar coherentes los importes de un presupuesto
 * antes de guardarlo.
 *
 * Por que existe:
 * La extraccion por IA no siempre devuelve los importes completos. Hay
 * presupuestos guardados cuyas lineas solo traen cantidad, precio y
 * descuento, sin el total de linea, y cuyo Subtotal y Total quedaron a
 * cero: generaban un PDF de 0,00 y volcaban 0 EUR a Bitacora. El calculo
 * existia solo en el navegador y solo se disparaba al editar una linea,
 * asi que un presupuesto guardado sin tocarlo se quedaba mal para
 * siempre.
 *
 * Este modulo mueve esa regla al servidor, al punto por el que pasan
 * TODOS los guardados (ver Code.gs). Da igual lo que devuelva la IA y da
 * igual si el usuario edita o no: lo que se escribe en la hoja siempre
 * cuadra consigo mismo.
 *
 * No es una capa de extraccion ni de presentacion: no inventa lineas, no
 * las reordena, no las elimina y no toca ningun campo que no sea un
 * importe. Solo rellena huecos y hace que las sumas cuadren.
 */

/**
 * Devuelve el presupuesto con sus importes coherentes.
 *
 * Reglas, en este orden:
 * 1. Total de cada linea: si no viene, se calcula como
 *    cantidad x precio x (1 - % / 100). Si viene, se respeta tal cual:
 *    puede haberlo escrito una persona a mano.
 * 2. Subtotal: suma de los totales de linea.
 * 3. IVA: Subtotal x CONFIG.IVA_RATE.
 * 4. Total: Subtotal + IVA.
 *
 * Los pasos 2 a 4 solo se aplican si el presupuesto tiene alguna linea
 * con importe. Si la extraccion no saco ninguna linea pero si un total,
 * ese total se respeta: seria peor machacarlo con un cero.
 *
 * @param {Object} budget JSON de presentacion (español)
 * @return {Object} el mismo presupuesto, con los importes cuadrados
 */
function normalizarImportes(budget) {
  if (!budget || typeof budget !== 'object') return budget;

  const lineas = budget['Líneas del presupuesto'];
  if (!Array.isArray(lineas) || lineas.length === 0) return budget;

  let subtotal = 0;
  let hayImportes = false;

  lineas.forEach(function (linea) {
    if (!linea || typeof linea !== 'object') return;

    const propio = linea['Total'];
    let total;

    if (propio === null || propio === undefined || propio === '') {
      total = calcularTotalLinea_(linea);
      linea['Total'] = total;
    } else {
      total = aNumeroImporte_(propio);
    }

    if (total !== 0) hayImportes = true;
    subtotal += total;
  });

  if (!hayImportes) return budget;

  subtotal = redondearImporte_(subtotal);
  const iva = redondearImporte_(subtotal * CONFIG.IVA_RATE);

  budget['Subtotal'] = subtotal;
  budget['IVA'] = iva;
  budget['Total'] = redondearImporte_(subtotal + iva);

  return budget;
}

/**
 * Total de una linea a partir de cantidad, precio y descuento.
 */
function calcularTotalLinea_(linea) {
  const cantidad = aNumeroImporte_(linea['Cantidad']);
  const precio = aNumeroImporte_(linea['Precio €']);
  const descuento = aNumeroImporte_(linea['%']);
  return redondearImporte_(cantidad * precio * (1 - descuento / 100));
}

/**
 * Convierte a numero tolerando texto y coma decimal. Lo que no sea un
 * numero cuenta como cero, nunca como NaN: un NaN contaminaria la suma
 * entera del presupuesto.
 */
function aNumeroImporte_(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = (typeof v === 'number') ? v : parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function redondearImporte_(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
