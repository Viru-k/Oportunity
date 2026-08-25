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
    .addItem('Ver diagnostico', 'diagnostico')
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
 * DIAGNOSTICO. Ejecutalo desde el editor de Apps Script: selecciona
 * "diagnostico" en el desplegable de funciones y pulsa Ejecutar. El
 * resultado sale en "Registro de ejecucion".
 *
 * No necesita desplegar nada. Esa es la gracia: el despliegue es
 * precisamente una de las cosas que puede estar fallando, asi que un
 * diagnostico que dependa de el no sirve para descartarlo.
 *
 * Responde de una vez a las tres preguntas que importan cuando el listado
 * sale vacio: que fichero esta usando, que pestañas tiene ese fichero con
 * cuantas filas cada una, y que devuelve de verdad la busqueda.
 */
function diagnostico() {
  const lineas = [];
  const anota = function (t) { lineas.push(t); };

  anota('===== DIAGNOSTICO DE OPORTUNITY =====');
  anota('');

  const props = PropertiesService.getScriptProperties();
  const idGuardado = props.getProperty('SPREADSHEET_ID');
  anota('SPREADSHEET_ID en propiedades : ' + (idGuardado || '(sin configurar)'));
  anota('CONFIG.SHEET_NAME             : "' + CONFIG.SHEET_NAME + '"');
  anota('OPENROUTER_API_KEY            : ' + (props.getProperty('OPENROUTER_API_KEY') ? 'configurada' : '(sin configurar)'));

  // Hoja a la que esta vinculado el script, si lo esta. Comparar este ID
  // con el guardado es lo que delata que la aplicacion escribe en un
  // fichero distinto del que se tiene abierto.
  let activa = null;
  try { activa = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { activa = null; }
  anota('Hoja vinculada al script      : ' + (activa ? activa.getName() + '  (ID ' + activa.getId() + ')' : '(ninguna)'));

  if (activa && idGuardado && activa.getId() !== idGuardado) {
    anota('');
    anota('*** ATENCION: la aplicacion NO usa la hoja a la que esta vinculado');
    anota('*** el script. Escribe en el fichero ' + idGuardado);
  }

  anota('');
  anota('--- Fichero que esta usando la aplicacion ---');

  let ss;
  try {
    ss = SpreadsheetApp.openById(getSpreadsheetId_());
  } catch (e) {
    anota('ERROR al abrir la hoja de calculo: ' + String(e && e.message || e));
    return volcar_(lineas);
  }

  anota('Nombre : ' + ss.getName());
  anota('ID     : ' + ss.getId());
  anota('URL    : ' + ss.getUrl());
  anota('');
  anota('--- Pestañas de ese fichero ---');
  ss.getSheets().forEach(function (h) {
    const filas = Math.max(0, h.getLastRow() - 1);
    const usada = (h.getName().trim().toLowerCase() === String(CONFIG.SHEET_NAME).trim().toLowerCase());
    anota('  "' + h.getName() + '"  ' + filas + ' filas' + (usada ? '   <== la que usa la aplicacion' : ''));
  });

  anota('');
  anota('--- Contenido de la pestaña en uso ---');
  try {
    const sheet = getSheet_();
    anota('Pestaña   : "' + sheet.getName() + '"');
    anota('Ultima fila: ' + sheet.getLastRow() + '  (fila 1 = cabecera)');

    if (sheet.getLastRow() >= 1 && sheet.getLastColumn() >= 1) {
      anota('Cabeceras esperadas: ' + SHEET_COLUMNS_.join(' | '));
      anota('Cabeceras reales   : ' + sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].join(' | '));
    }

    const muestra = Math.min(3, sheet.getLastRow() - 1);
    if (muestra > 0) {
      anota('');
      anota('Primeras ' + muestra + ' filas (UUID / OP / Cliente / Telefono):');
      sheet.getRange(2, 1, muestra, 4).getValues().forEach(function (f) {
        anota('  ' + f.join('  |  '));
      });
    }

    anota('');
    anota('--- Lo que devuelve la busqueda ---');
    const encontrados = buscarOportunidadesPorTexto('');
    anota('buscarOportunidadesPorTexto("") devuelve: ' + encontrados.length + ' presupuestos');
    if (encontrados.length) {
      anota('Primero: ' + encontrados[0].op + '  ' + encontrados[0].cliente);
      anota('');
      anota('CONCLUSION: la lectura funciona. Si la pantalla sigue vacia, lo que');
      anota('esta desactualizado es el DESPLIEGUE de la web app, no el codigo.');
      anota('Implementar > Gestionar implementaciones > editar > Version: Nueva version.');
    } else {
      anota('');
      anota('CONCLUSION: la pestaña en uso no tiene filas. Mira arriba que pestaña');
      anota('SI las tiene y ajusta CONFIG.SHEET_NAME, o corrige SPREADSHEET_ID si el');
      anota('fichero no es el que esperabas.');
    }
  } catch (e) {
    anota('ERROR al leer la pestaña: ' + String(e && e.message || e));
  }

  return volcar_(lineas);
}

/**
 * Escribe el informe en el registro y, si hay interfaz disponible (menu de
 * la hoja), lo muestra tambien en un dialogo.
 */
function volcar_(lineas) {
  const informe = lineas.join('\n');
  Logger.log(informe);
  try {
    SpreadsheetApp.getUi().alert('Diagnostico de Oportunity', informe, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    // Sin interfaz (ejecutado desde el editor): basta con el registro.
  }
  return informe;
}
