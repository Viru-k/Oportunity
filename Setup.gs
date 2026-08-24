/**
 * Setup.gs
 * Responsabilidad unica: puesta en marcha y diagnostico desde la propia
 * hoja de calculo. No participa en el flujo normal de la aplicacion.
 *
 * Por que existe este archivo:
 * getSheet_() necesita saber en que hoja de calculo guardar, y ese dato
 * sale de la propiedad SPREADSHEET_ID (ver Config.gs). Resolverlo solo
 * con SpreadsheetApp.getActiveSpreadsheet() no vale: dentro de una web
 * app (doGet) NO hay hoja activa de forma fiable, ni aunque el script
 * este vinculado a una hoja. Esa llamada solo es de fiar cuando el codigo
 * se ejecuta DESDE la hoja: un menu, un activador o el editor.
 *
 * Justo eso es lo que hace este archivo: anade un menu a la hoja para que
 * puedas resolver el ID una sola vez, en el unico contexto donde se puede
 * resolver bien, y dejarlo guardado en Script Properties. A partir de ahi
 * la web app ya lo lee sin depender de ningun contexto.
 */

/**
 * Anade el menu "Oportunity" al abrir la hoja de calculo. Apps Script
 * llama a esta funcion sola; no hay que invocarla a mano.
 *
 * Solo aparece si el script esta vinculado a la hoja. Si no ves el menu
 * tras recargar, el script es independiente y hay que configurar
 * SPREADSHEET_ID a mano en Configuracion del proyecto > Propiedades del
 * script.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Oportunity')
    .addItem('Configurar esta hoja como base de datos', 'configurarHojaDeOportunidades')
    .addItem('Ver diagnostico', 'mostrarDiagnostico')
    .addToUi();
}

/**
 * Deja esta hoja de calculo como destino de las oportunidades: guarda su
 * ID en Script Properties y crea la pestaña de datos si no existe.
 *
 * Se ejecuta desde el menu de la hoja, que es donde
 * getActiveSpreadsheet() si devuelve la hoja correcta.
 *
 * Es idempotente: ejecutarlo dos veces no duplica ni borra nada.
 */
function configurarHojaDeOportunidades() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    ui.alert('Oportunity',
      'No se ha podido identificar la hoja de calculo.\n\n' +
      'Ejecuta esta opcion desde el menu de la hoja, no desde el editor.',
      ui.ButtonSet.OK);
    return;
  }

  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());

  // getSheet_() crea la pestaña con su fila de cabecera si no existe.
  const sheet = getSheet_();

  ui.alert('Oportunity',
    'Listo.\n\n' +
    'Hoja de calculo: ' + ss.getName() + '\n' +
    'ID guardado: ' + ss.getId() + '\n' +
    'Pestaña de datos: ' + sheet.getName() + '\n' +
    'Filas de datos: ' + Math.max(0, sheet.getLastRow() - 1) + '\n\n' +
    'Ahora vuelve a implementar la web app como version nueva para que ' +
    'sirva este cambio.',
    ui.ButtonSet.OK);
}

/**
 * Muestra en un dialogo el mismo diagnostico que la web app enseña en
 * letra pequeña, pero legible y sin tener que rebuscar en la pantalla.
 */
function mostrarDiagnostico() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  const idGuardado = props.getProperty('SPREADSHEET_ID');

  const lineas = [];
  lineas.push('SPREADSHEET_ID guardado: ' + (idGuardado || '(no configurado)'));
  lineas.push('OPENROUTER_API_KEY: ' + (props.getProperty('OPENROUTER_API_KEY') ? 'configurada' : '(no configurada)'));
  lineas.push('');

  try {
    const sheet = getSheet_();
    const ss = sheet.getParent();
    lineas.push('Hoja de calculo en uso: ' + ss.getName());
    lineas.push('ID en uso: ' + ss.getId());
    lineas.push('Pestaña de datos: ' + sheet.getName());
    lineas.push('Filas de datos: ' + Math.max(0, sheet.getLastRow() - 1));
    lineas.push('Oportunidades que devuelve la busqueda: ' + buscarOportunidadesPorTexto('').length);

    const activa = SpreadsheetApp.getActiveSpreadsheet();
    if (activa && activa.getId() !== ss.getId()) {
      lineas.push('');
      lineas.push('AVISO: esta guardando en una hoja DISTINTA de esta.');
      lineas.push('Usa "Configurar esta hoja como base de datos" para cambiarlo.');
    }
  } catch (e) {
    lineas.push('ERROR al acceder a la hoja:');
    lineas.push(String(e && e.message || e));
  }

  ui.alert('Diagnostico de Oportunity', lineas.join('\n'), ui.ButtonSet.OK);
}
