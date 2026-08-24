/**
 * PdfService.gs
 * Responsabilidad única: construir el documento y generar el PDF.
 * No conoce Bitácora. No guarda nada en Drive: siempre devuelve el PDF
 * como Blob en memoria para que el frontend lo descargue directamente.
 *
 * Sprint 006: la plantilla deja de reproducir la identidad visual del
 * presupuesto oficial de la cadena de bricolaje sobre la que se basaban
 * las capturas y pasa a reproducir, campo a campo, la maqueta ya validada
 * en pdf_preview.html (fuente de verdad absoluta de este sprint). No se
 * reinterpreta el diseño: mismos bloques, mismo texto fijo (título,
 * mensaje de cortesía, aviso legal, "Firma:"), mismos tamaños y colores.
 * Lo único que cambia respecto a la maqueta es que los datos de ejemplo
 * (array ITEMS hardcodeado) se sustituyen por los campos reales del JSON
 * de presentación.
 *
 * El JSON que llega aquí ya ha pasado por PresentationMapper.gs: las claves
 * están en español (p. ej. "Cliente", "Referencia") y las líneas de
 * producto respetan el orden exacto acordado: Referencia, Designación,
 * Cantidad, Precio €, %, Total, Línea.
 *
 * Campos del JSON que la maqueta no muestra (Descuento, Observaciones,
 * Línea) no se imprimen: no existe hueco para ellos en pdf_preview.html y
 * este sprint no rediseña la maqueta para hacerles sitio.
 *
 * Sprint 007 (ajustes finos, validados por el Product Owner):
 * - Columna izquierda de la cabecera: deja de mostrar el campo "Tienda"
 *   extraído de la captura (dato variable según la tienda del cliente,
 *   p. ej. "A Coruña") y pasa a mostrar los datos fijos de la propia
 *   empresa (COMPANY, en Config.gs), igual que en pdf_preview.html.
 * - Tabla de líneas: se amplía el ancho útil reduciendo el margen
 *   horizontal de página (10mm en vez de 16mm).
 * - Importes: se elimina el símbolo "€" de todos los números (solo se
 *   imprime la cifra).
 * - Pie legal: se añade height:100% a html/body para que min-height:100%
 *   de .page funcione de forma fiable en el motor de conversión de Apps
 *   Script, garantizando que .bottom-block (con margin-top:auto) quede
 *   siempre anclado al final de la página.
 *
 * Sprint 008 (corrección de pie legal en documentos multi-folio):
 * - El anclaje anterior (.bottom-block con margin-top:auto dentro de un
 *   contenedor flex) solo funciona cuando todo el documento cabe en un
 *   único folio: el motor de conversión de Apps Script procesa el HTML
 *   como un flujo continuo y no reevalúa el flex en cada página impresa,
 *   así que el aviso legal terminaba apareciendo una sola vez al final
 *   del contenido en vez de al fondo de cada folio.
 * - Se sustituye ese anclaje por .legal-footer con position:fixed;
 *   bottom:0, que el motor de conversión sí repite en cada folio
 *   generado, ubicado siempre en la misma coordenada del folio físico.
 * - Se reserva espacio inferior en .content (padding-bottom) para que el
 *   contenido en flujo normal (tabla, totales, firma) nunca quede debajo
 *   del pie legal fijo.
 * - El bloque de firma deja de estar anclado junto al pie legal y pasa a
 *   fluir de forma normal justo después de los totales (aparece una sola
 *   vez, no debe repetirse en cada folio).
 *
 * Sprint 009 (cabecera repetible en cada folio + fondo gris de tabla):
 * - El bloque superior (Nº presupuesto, empresa/cliente, "atendido por"
 *   y el texto de agradecimiento) se saca de .content y se envuelve en
 *   .page-header con position:fixed;top:14mm (mismo mecanismo que
 *   .legal-footer), para que se repita en la parte superior de todos
 *   los folios, no solo en el primero.
 * - .content reserva padding-top:65mm para que la tabla nunca arranque
 *   debajo de la cabecera fija.
 * - Se añade -webkit-print-color-adjust/print-color-adjust:exact de
 *   forma global: por defecto los motores de impresión/conversión a PDF
 *   suprimen los fondos de color para ahorrar tinta, que era la causa de
 *   que el gris de las cabeceras de la tabla (--head-bg) saliera en
 *   blanco.
 *
 * Sprint 010 (intento fallido: @page en vez de padding manual):
 * - Se intentó mover la reserva de espacio de .page-header/.legal-footer
 *   del padding manual de .content al margen de @page (top:79mm,
 *   bottom:32mm), asumiendo que el margen de página se aplica de forma
 *   nativa en todos los folios.
 * - No fue suficiente: la tabla de líneas se repagina "por su cuenta" en
 *   el motor de conversión de Apps Script y, al saltar de folio, ignora
 *   el margen superior de @page — el folio 2+ seguía arrancando pegado
 *   al borde físico.
 *
 * Sprint 011 (intento fallido: cabecera/pie como thead/tfoot de la tabla):
 * - Se probó mover la cabecera y el aviso legal dentro de la propia
 *   tabla, como <thead>/<tfoot>, asumiendo que el motor los repetiría de
 *   forma nativa en cada folio (como "repetir fila de encabezado" en
 *   Google Docs).
 * - Confirmado por el usuario: NO funciona. El <thead> no se repite en
 *   el folio 2+, y el <tfoot> no se ancla al fondo del folio, sino que
 *   aparece pegado al final de la última fila de la tabla en esa página
 *   (esté a mitad de folio o no).
 *
 * Sprint 012 (paginación manual: nada de auto-salto de tabla ni de
 * repetición automática de thead/tfoot):
 * - Diagnóstico definitivo con los datos de los Sprints 010 y 011: lo
 *   único que el motor de conversión de Apps Script repite de forma
 *   fiable en TODOS los folios es un elemento con position:fixed (así
 *   ya funcionaban .page-header y .legal-footer desde el Sprint 009).
 *   Lo que nunca ha funcionado es dejar que sea el motor quien decida
 *   DÓNDE cortar una tabla larga: cuando lo hace él solo, ignora
 *   cualquier margen o padding reservado y dcounce el folio nuevo
 *   pegado al borde físico superior.
 * - Solución: dejar de generar una única tabla larga que el motor deba
 *   repaginar por su cuenta. En su lugar, PdfService calcula cuántas
 *   líneas caben por folio (ROWS_PER_PAGE_) y construye varios bloques
 *   ".content" ya troceados, cada uno con su propia tabla pequeña
 *   (colgroup + thead con los títulos de columna + un trozo de filas) y
 *   un salto de página forzado (page-break-before:always) entre ellos.
 *   Un salto de página forzado es CSS básico de toda la vida y SÍ se
 *   respeta; ya no dependemos de que el motor sepa repaginar una tabla
 *   larga por sí solo.
 * - Cada bloque ".content" reserva su propio padding-top/padding-bottom
 *   (para dejar sitio a .page-header/.legal-footer, que siguen siendo
 *   position:fixed y repitiéndose en cada folio, mecanismo que sí
 *   funciona). Al ser bloques SEPARADOS (no una sola caja con overflow),
 *   cada uno aplica su propio padding en su propio arranque, que ahora sí
 *   coincide con el arranque real de cada folio.
 * - Totales y firma se colocan en un último bloque ".content" propio,
 *   después de la última tabla de líneas, para no arriesgarnos a que el
 *   motor tenga que repaginar ese bloque también si no cupiera entero.
 * - ROWS_PER_PAGE_ es una estimación (líneas de una sola línea de texto,
 *   fuente 10.5px). Si en la práctica algún folio se queda corto o se
 *   pasa (p. ej. por Designaciones largas que ocupan 2 líneas), este es
 *   el único número a ajustar, arriba en la constante.
 *
 * Sprint 013 (totales integrados en último bloque de tabla):
 * - El bloque separado de totales seguía provocando salto de página
 *   en el motor de conversión de Apps Script, aunque no llevara
 *   page-break. Solución: integrar totales y firma DENTRO del último
 *   bloque .content (después de la última tabla), no en un bloque
 *   .content aparte. Así fluyen naturalmente tras la última fila.
 */

/**
 * Nº de líneas de producto que se estima que caben en un folio, dejando
 * sitio a la cabecera fija (arriba) y al pie legal fijo (abajo). Es una
 * estimación, no un cálculo exacto: si ves que algún folio se queda con
 * hueco de sobra, sube este número; si ves que una fila se corta o
 * invade la cabecera/pie del folio siguiente, bájalo.
 */
var ROWS_PER_PAGE_ = 20;

/**
 * Genera el PDF del presupuesto a partir del JSON editado en memoria.
 *
 * @param {Object} budget JSON de presentación (español) revisado por el usuario
 * @return {{base64: string, filename: string}} PDF listo para descargar
 */
function generarPdfPresupuesto(budget) {
  if (!budget || typeof budget !== 'object') {
    throw new Error('No hay datos de presupuesto para generar el PDF.');
  }

  const html = buildBudgetHtml_(budget);
  const pdfBlob = htmlToPdfBlob_(html, 'presupuesto');

  return {
    base64: Utilities.base64Encode(pdfBlob.getBytes()),
    filename: pdfBlob.getName()
  };
}

/**
 * Convierte un HTML a un Blob PDF sin escribir nada en Drive.
 */
function htmlToPdfBlob_(html, baseName) {
  const htmlBlob = Utilities.newBlob(html, 'text/html', baseName + '.html');
  const pdfBlob = htmlBlob.getAs('application/pdf');
  pdfBlob.setName(baseName + '.pdf');
  return pdfBlob;
}

/**
 * Trocea un array en sub-arrays de tamaño máximo size. Si el array de
 * entrada está vacío, devuelve un único trozo vacío (para que siempre
 * se genere al menos un folio con la tabla, aunque no tenga líneas).
 */
function chunkArray_(arr, size) {
  if (!arr.length) return [[]];
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Construye el HTML del PDF reproduciendo, bloque a bloque, la maqueta
 * pdf_preview.html. Cada línea de dato es opcional y se omite si el campo
 * correspondiente no está presente en el JSON; los textos fijos de la
 * maqueta (título, mensaje de cortesía, aviso legal, "Firma:") se
 * mantienen siempre, tal como están en la maqueta.
 *
 * Sprint 012: en vez de una única tabla larga, se generan varios
 * bloques de folio ya troceados a mano (ver nota de cabecera).
 *
 * Sprint 013: totales y firma integrados en el último bloque de tabla.
 */
function buildBudgetHtml_(b) {
  const esc = escapeHtml_;
  const money = formatMoney_;
  const num = formatNumber_;

  // ---- Cabecera ------------------------------------------------------
  const docNumber = b['Presupuesto']
    ? '<div class="doc-number">' + esc(b['Presupuesto']) + '</div>'
    : '';
  const docDate = b['Fecha']
    ? '<div class="doc-date">Fecha: ' + esc(b['Fecha']) + '</div>'
    : '';

  // ---- Bloque de partes ------------------------------------------------
  const tiendaLines = [
    COMPANY.NAME ? '<div class="party-name">' + esc(COMPANY.NAME) + '</div>' : '',
    COMPANY.ADDRESS_LINE_1 ? '<div class="party-line">' + esc(COMPANY.ADDRESS_LINE_1) + '</div>' : '',
    COMPANY.ADDRESS_LINE_2 ? '<div class="party-line">' + esc(COMPANY.ADDRESS_LINE_2) + '</div>' : '',
    COMPANY.PHONE ? '<div class="party-line">Tel.: ' + esc(COMPANY.PHONE) + '</div>' : ''
  ].filter(Boolean).join('');

  const clienteLines = [
    b['Cliente'] ? '<div class="party-name upper">' + esc(b['Cliente']) + '</div>' : '',
    b['Dirección'] ? '<div class="party-line">' + esc(b['Dirección']) + '</div>' : '',
    b['Teléfono'] ? '<div class="party-line">Teléfono: ' + esc(b['Teléfono']) + '</div>' : '',
    b['Correo electrónico'] ? '<div class="party-line">Email: ' + esc(b['Correo electrónico']) + '</div>' : ''
  ].filter(Boolean).join('');

  const atendidoPor = b['Vendedor']
    ? 'Ha sido atendido por: <span class="upper">' + esc(b['Vendedor']) + '</span>'
    : '';

  // ---- Totales -----------------------------------------------------
  const subtotal = b['Subtotal'];
  const total = b['Total'];
  const hasIva = subtotal !== null && subtotal !== undefined && subtotal !== '' &&
    total !== null && total !== undefined && total !== '' &&
    !isNaN(Number(subtotal)) && !isNaN(Number(total));
  const ivaAmount = hasIva ? Number(total) - Number(subtotal) : null;

  // ---- Cabecera repetible (position:fixed, arriba de cada folio) ------
  const pageHeaderHtml = '' +
    '<div class="page-header">' +
    '<div class="doc-header">' +
    '<div class="side"></div>' +
    '<div class="doc-title-block">' +
    '<div class="doc-type">LISTA DE COMPRA</div>' +
    docNumber +
    docDate +
    '</div>' +
    '<div class="side"></div>' +
    '</div>' +
    '<div class="parties">' +
    '<div>' + tiendaLines + '</div>' +
    '<div>' + clienteLines + '</div>' +
    '</div>' +
    '<div class="attended-row">' +
    '<div class="party-line">' + atendidoPor + '</div>' +
    '<div></div>' +
    '</div>' +
    '<div class="courtesy">' +
    '<div>GRACIAS POR SU CONFIANZA EN ESTE PROYECTO.</div>' +
    '<div>DOCUMENTO ELABORADO PARA FACILITAR LA COMPRA DE LOS MATERIALES.</div>' +
    '</div>' +
    '</div>';

  // ---- Pie legal repetible (position:fixed, anclado al fondo de cada folio)
  const legalFooterHtml = '' +
    '<div class="legal-footer">' +
    '<div class="legal">' +
    '<p><strong>Aviso:</strong> los precios indicados son orientativos y están sujetos a disponibilidad en tienda. ' +
    '<strong>Validez:</strong> esta lista de compra no constituye un presupuesto vinculante ni una oferta comercial. ' +
    '<strong>Uso:</strong> documento de uso interno, sin validez como factura ni como justificante de compra. ' +
    '<strong>Recomendación:</strong> confirme precios y stock antes de realizar la compra definitiva.</p>' +
    '</div>' +
    '</div>';

  // ---- Tabla de líneas, troceada a mano en bloques de folio -----------
  const items = Array.isArray(b['Líneas del presupuesto']) ? b['Líneas del presupuesto'] : [];
  const pages = chunkArray_(items, ROWS_PER_PAGE_);

  const colgroupHtml = '<colgroup><col class="desc"><col class="ref"><col class="qty"><col class="disc"><col class="price"><col class="total"></colgroup>';
  const theadHtml = '<thead><tr>' +
    '<th>Designación</th><th>Referencia</th><th>Ctd</th><th>Tipo IVA</th><th>Precio Unitario</th><th>Importe con IVA</th>' +
    '</tr></thead>';

  // HTML de totales + firma (se inyecta solo en el último bloque)
  const totalsHtml = '' +
    '<div class="totals-signature">' +
    '<div class="totals-wrap">' +
    '<div class="totals">' +
    '<div class="totals-row bold"><span>Total sin IVA</span><span class="num">' + money(subtotal) + '</span></div>' +
    '<div class="totals-row"><span>Montante IVA 21</span><span class="num">' + (hasIva ? money(ivaAmount) : '') + '</span></div>' +
    '<div class="totals-row final"><span>Total con IVA</span><span class="num">' + money(total) + '</span></div>' +
    '</div>' +
    '</div>' +
    '<div class="signature-wrap"><div class="signature">Firma:</div></div>' +
    '</div>';

  const lastIndex = pages.length - 1;

  const pagesHtml = pages.map(function (pageItems, pageIndex) {
    const rows = pageItems.map(function (item) {
      return '<tr>' +
        '<td class="desc">' + esc(item['Designación'] || '') + '</td>' +
        '<td>' + esc(item['Referencia'] || '') + '</td>' +
        '<td class="num">' + num(item['Cantidad']) + '</td>' +
        '<td class="num">' + num(item['%']) + '</td>' +
        '<td class="num">' + money(item['Precio €']) + '</td>' +
        '<td class="num">' + money(item['Total']) + '</td>' +
        '</tr>';
    }).join('');

    // page-break-before:always en todos los bloques MENOS el primero
    const breakClass = pageIndex === 0 ? '' : ' page-break';

    // Solo en el ÚLTIMO bloque añadimos totales y firma dentro del mismo .content
    const extras = (pageIndex === lastIndex) ? totalsHtml : '';

    return '<div class="content' + breakClass + '">' +
      '<table class="items">' + colgroupHtml + theadHtml + '<tbody>' + rows + '</tbody></table>' +
      extras +
      '</div>';
  }).join('');

  // ---- Documento HTML -------------------------------------------------
  return '' +
    '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
    '<title>Lista de compra' + (b['Presupuesto'] ? ' — ' + esc(b['Presupuesto']) : '') + '</title>' +
    '<style>' +
    '  :root{' +
    '    --ink:#000000; --ink-soft:#333333; --ink-muted:#6a6a6a;' +
    '    --line:#000000; --line-soft:#999999; --head-bg:#dcdcdc;' +
    '    --font: Arial, Helvetica, \'Liberation Sans\', sans-serif;' +
    '  }' +
    '  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}' +
    '  html{height:100%;}' +
    '  body{margin:0;font-family:var(--font);color:var(--ink);font-size:11px;line-height:1.45;height:100%;}' +
    '  @page{size:A4;margin:10mm 14mm 10mm 14mm;}' +
    '  .page-break{page-break-before:always;break-before:page;}' +
    '  .page-header{position:fixed;top:8mm;left:14mm;right:14mm;}' +
    '  .legal-footer{position:fixed;left:14mm;right:14mm;bottom:0;}' +
    '  .content{padding-top:80mm;padding-bottom:28mm;}' +
    '  .doc-header{display:grid;grid-template-columns:1fr 2fr 1fr;align-items:start;margin-bottom:14px;}' +
    '  .doc-header .side{min-height:1px;}' +
    '  .doc-title-block{text-align:center;}' +
    '  .doc-title-block .doc-type{font-size:22px;font-weight:700;letter-spacing:0.02em;}' +
    '  .doc-title-block .doc-number{font-size:16px;font-weight:700;margin-top:3px;}' +
    '  .doc-title-block .doc-date{font-size:13px;color:var(--ink-soft);margin-top:3px;}' +
    '  .parties{display:grid;grid-template-columns:1fr 1fr;column-gap:140px;margin-bottom:10px;}' +
    '  .upper{text-transform:uppercase;}' +
    '  .party-name{font-size:13px;font-weight:700;}' +
    '  .party-line{color:var(--ink-soft);margin-top:2px;}' +
    '  .attended-row{display:grid;grid-template-columns:1fr 1fr;column-gap:60px;margin-bottom:18px;}' +
    '  .courtesy{text-align:center;font-weight:700;text-transform:uppercase;letter-spacing:0.01em;margin-bottom:20px;}' +
    '  .courtesy div + div{margin-top:2px;}' +
    '  table.items{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:16px;}' +
    '  table.items col.desc{width:39%;} table.items col.ref{width:13%;} table.items col.qty{width:8%;}' +
    '  table.items col.disc{width:10%;} table.items col.price{width:13%;} table.items col.total{width:17%;}' +
    '  table.items th, table.items td{border:1px solid var(--line);padding:5px 6px;vertical-align:top;text-align:center;}' +
    '  table.items thead th{background:var(--head-bg);font-size:9px;font-weight:700;text-align:center;white-space:nowrap;}' +
    '  table.items td.desc{text-align:left;text-transform:uppercase;}' +
    '  table.items tbody td{font-size:10.5px;overflow-wrap:break-word;}' +
    '  table.items td.num{font-variant-numeric:tabular-nums;}' +
    '  .totals-wrap{display:flex;justify-content:flex-end;margin-bottom:30px;}' +
    '  .totals{width:72mm;}' +
    '  .totals-row{display:flex;justify-content:space-between;padding:2px 0;}' +
    '  .totals-row.bold{font-weight:700;}' +
    '  .totals-row.final{font-weight:700;font-size:13px;margin-top:5px;}' +
    '  .totals-row.final .num{display:inline-block;border-top:1px solid var(--line);padding-top:4px;}' +
    '  .signature-wrap{display:flex;justify-content:flex-end;margin-bottom:22px;}' +
    '  .signature{width:62mm;border:1px solid var(--line);padding:30px 10px 8px;font-size:10.5px;}' +
    '  .totals-signature{page-break-inside:avoid;break-inside:avoid;}' +
    '  .legal{border-top:1px solid var(--line-soft);padding-top:7px;font-size:8px;color:var(--ink-muted);line-height:1.55;text-align:justify;}' +
    '  .legal p{margin:0 0 6px;}' +
    '  .legal strong{color:var(--ink-soft);font-weight:700;}' +
    '</style></head><body>' +
    '<div class="page">' +
    pageHeaderHtml +
    legalFooterHtml +
    pagesHtml +
    '</div>' +
    '</body></html>';
}

/**
 * Formatea un importe numérico como cifra sin símbolo de moneda.
 */
function formatMoney_(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (isNaN(num)) return escapeHtml_(String(value));
  return num.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Formatea un número sin símbolo de moneda.
 */
function formatNumber_(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (isNaN(num)) return escapeHtml_(String(value));
  return num.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Escapa HTML básico para evitar romper la plantilla con datos del cliente.
 */
function escapeHtml_(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
