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
    .addItem('Revisar pestaña suelta', 'revisarPestanaSuelta')
    .addItem('Revisar vendedores', 'revisarVendedores')
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
 * Nombre de la pestaña de la que se quiere rescatar filas sueltas. Se
 * quedaron ahi presupuestos guardados mientras la aplicacion apuntaba a
 * una pestaña distinta.
 */
const PESTANA_A_RESCATAR_ = 'Oportunidades v2';

/**
 * Dice que presupuestos de PESTANA_A_RESCATAR_ NO estan en la pestaña en
 * uso. Solo informa: no escribe nada.
 *
 * Importa porque Bitacora localiza cada presupuesto por su UUID en la
 * pestaña configurada. Un presupuesto que se quedo en otra pestaña existe,
 * pero es invisible para Bitacora y para el listado.
 *
 * Ejecutalo desde el editor y mira el registro.
 */
function revisarPestanaSuelta() {
  const lineas = [];
  const pendientes = calcularPendientes_(lineas);

  if (pendientes === null) return volcar_(lineas);

  if (pendientes.length === 0) {
    lineas.push('');
    lineas.push('Todos los presupuestos de "' + PESTANA_A_RESCATAR_ + '" ya estan');
    lineas.push('en la pestaña en uso. No hay nada que mover: puedes borrarla.');
  } else {
    lineas.push('');
    lineas.push('Faltan ' + pendientes.length + ' presupuesto(s) por mover:');
    pendientes.forEach(function (p) {
      lineas.push('  ' + p.op + '  ' + p.cliente + '  (uuid ' + p.uuid + ')');
    });
    lineas.push('');
    lineas.push('Ejecuta "moverPestanaSuelta" para pasarlos a la pestaña en uso.');
  }
  return volcar_(lineas);
}

/**
 * Copia a la pestaña en uso los presupuestos de PESTANA_A_RESCATAR_ que no
 * esten ya alli, identificandolos por UUID.
 *
 * No borra nada: la pestaña de origen se queda igual, para poder comprobar
 * el resultado antes de eliminarla. Es idempotente, asi que ejecutarlo dos
 * veces no duplica filas.
 */
function moverPestanaSuelta() {
  const lineas = [];
  const pendientes = calcularPendientes_(lineas);

  if (pendientes === null) return volcar_(lineas);

  if (pendientes.length === 0) {
    lineas.push('');
    lineas.push('No habia nada que mover.');
    return volcar_(lineas);
  }

  const destino = getSheet_();
  pendientes.forEach(function (p) {
    destino.appendRow(p.fila);
  });

  lineas.push('');
  lineas.push('Movidos ' + pendientes.length + ' presupuesto(s) a "' + destino.getName() + '".');
  lineas.push('La pestaña "' + PESTANA_A_RESCATAR_ + '" NO se ha tocado: comprueba el');
  lineas.push('listado y, si todo esta bien, ya puedes borrarla a mano.');
  return volcar_(lineas);
}

/**
 * Filas de PESTANA_A_RESCATAR_ cuyo UUID no existe en la pestaña en uso.
 * Devuelve null si la pestaña de origen no existe o esta vacia.
 */
function calcularPendientes_(lineas) {
  const destino = getSheet_();
  const ss = destino.getParent();
  const origen = ss.getSheetByName(PESTANA_A_RESCATAR_);

  lineas.push('===== PESTAÑA SUELTA =====');
  lineas.push('Origen : "' + PESTANA_A_RESCATAR_ + '"');
  lineas.push('Destino: "' + destino.getName() + '"  (' + Math.max(0, destino.getLastRow() - 1) + ' filas)');

  if (!origen) {
    lineas.push('');
    lineas.push('Esa pestaña no existe. Nada que hacer.');
    return null;
  }

  const filasOrigen = Math.max(0, origen.getLastRow() - 1);
  lineas.push('Filas en origen: ' + filasOrigen);

  if (filasOrigen === 0) {
    lineas.push('');
    lineas.push('Esta vacia. Puedes borrarla sin perder nada.');
    return null;
  }

  const datos = origen.getRange(2, 1, filasOrigen, SHEET_COLUMNS_.length).getValues();

  return datos.filter(function (fila) {
    const uuid = fila[COL_UUID_ - 1];
    return uuid && !buscarFilaPorUuid_(uuid);
  }).map(function (fila) {
    return {
      uuid: fila[COL_UUID_ - 1],
      op: fila[COL_OP_ - 1],
      cliente: fila[COL_CLIENTE_ - 1],
      fila: fila
    };
  });
}

/**
 * Cuenta que presupuestos guardados tienen vendedor y cuales no, y con que
 * nombres. Solo informa: no escribe nada.
 *
 * Existe porque el filtro de vendedor de la pantalla se construye con los
 * nombres que hay en los datos. Si sale todo como "sin vendedor", la
 * pregunta a responder es si el fallo esta en el filtro o en que el campo
 * viene vacio de la extraccion, y eso solo se sabe mirando lo guardado.
 *
 * Ejecutalo desde el editor y mira el registro.
 */
function revisarVendedores() {
  const lineas = [];
  const sheet = getSheet_();
  const ultima = sheet.getLastRow();

  lineas.push('===== VENDEDORES EN LO GUARDADO =====');
  lineas.push('Pestaña: "' + sheet.getName() + '"');

  if (ultima < 2) {
    lineas.push('No hay presupuestos guardados.');
    return volcar_(lineas);
  }

  const filas = sheet.getRange(2, 1, ultima - 1, SHEET_COLUMNS_.length).getValues();
  const cuenta = {};
  const sinVendedor = [];
  let ilegibles = 0;

  filas.forEach(function (fila) {
    let v = '';
    try {
      v = String(JSON.parse(fila[COL_JSON_ - 1])['Vendedor'] || '').trim();
    } catch (e) {
      ilegibles++;
      return;
    }
    if (v) {
      cuenta[v] = (cuenta[v] || 0) + 1;
    } else {
      sinVendedor.push(String(fila[COL_OP_ - 1]));
    }
  });

  const nombres = Object.keys(cuenta).sort(function (a, b) { return cuenta[b] - cuenta[a]; });
  const conVendedor = nombres.reduce(function (t, n) { return t + cuenta[n]; }, 0);

  lineas.push('Presupuestos: ' + filas.length);
  lineas.push('  con vendedor : ' + conVendedor);
  lineas.push('  sin vendedor : ' + sinVendedor.length);
  if (ilegibles) lineas.push('  ilegibles    : ' + ilegibles);
  lineas.push('');

  if (nombres.length) {
    lineas.push('--- Nombres encontrados ---');
    nombres.forEach(function (n) {
      lineas.push('  ' + n + '  (' + cuenta[n] + ')');
    });
  } else {
    lineas.push('--- No hay ni un solo vendedor guardado ---');
  }

  if (sinVendedor.length) {
    lineas.push('');
    lineas.push('--- Sin vendedor (primeros 15) ---');
    lineas.push('  ' + sinVendedor.slice(0, 15).join(', '));
  }

  lineas.push('');
  if (!nombres.length) {
    lineas.push('CONCLUSION: el campo viene vacio en TODOS. El filtro no tiene');
    lineas.push('nombres que ofrecer porque no hay ninguno guardado. Hay que');
    lineas.push('rellenarlos: los nuevos ya los extrae el prompt, y los ' + filas.length);
    lineas.push('anteriores necesitan una pasada de relleno.');
  } else if (sinVendedor.length) {
    lineas.push('CONCLUSION: hay ' + nombres.length + ' nombre(s) guardados, asi que el filtro');
    lineas.push('SI los muestra. Los ' + sinVendedor.length + ' sin vendedor son presupuestos');
    lineas.push('anteriores al cambio del prompt.');
  } else {
    lineas.push('CONCLUSION: todos tienen vendedor. Si aun asi el filtro los muestra');
    lineas.push('como "sin vendedor", el despliegue de la web app es antiguo.');
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
