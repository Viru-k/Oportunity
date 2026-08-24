/**
 * OpenRouterService.gs
 * Responsabilidad única: comunicación con OpenRouter.
 * Nunca modifica datos, nunca guarda, nunca genera PDF.
 */

/**
 * Envía una o varias imágenes (Base64) a OpenRouter y devuelve el JSON
 * estructurado extraído del presupuesto.
 *
 * @param {Array<{data: string, mimeType: string}>} images
 * @return {Object} JSON estructurado ya parseado y validado
 */
function extractBudgetFromImages(images) {
  if (!images || images.length === 0) {
    throw new Error('No se ha recibido ninguna captura para procesar.');
  }

  try {
    return extractBudgetFromImages_impl_(images);
  } catch (e) {
    // --- DEBUG: error técnico completo (no altera el mensaje al usuario) ---
    debugLog_('Error completo (stack)', e && e.stack ? e.stack : String(e));
    debugLog_('Error completo (mensaje)', e && e.message ? e.message : String(e));
    throw e; // se relanza sin modificar: el mensaje amigable ya se decide donde corresponda
  }
}

function extractBudgetFromImages_impl_(images) {
  // --- DEBUG: trazabilidad al inicio, antes de cualquier operación que
  // pueda lanzar excepción (p. ej. API key ausente), para garantizar que
  // modelo/URL/tamaño de imagen siempre queden registrados. ---
  debugLog_('Modelo utilizado', CONFIG.MODEL);
  debugLog_('URL de destino', CONFIG.OPENROUTER_API_URL);
  debugLog_('Tamaño de imágenes enviadas (bytes aprox. Base64)', images.map(function (img, i) {
    return 'imagen[' + i + '] mimeType=' + img.mimeType + ' bytes=' + approxBase64Bytes_(img.data);
  }));

  const content = [
    { type: 'text', text: 'Analiza estas capturas del mismo presupuesto y extrae los datos según el formato indicado.' }
  ];

  images.forEach(function (img) {
    content.push({
      type: 'image_url',
      image_url: { url: 'data:' + img.mimeType + ';base64,' + img.data }
    });
  });

  const payload = {
    model: CONFIG.MODEL,
    temperature: CONFIG.TEMPERATURE,
    messages: [
      { role: 'system', content: PROMPT.SYSTEM_PROMPT },
      { role: 'user', content: content }
    ]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + getOpenRouterApiKey_(),
      // Cabeceras opcionales recomendadas por OpenRouter para atribución/
      // ranking; algunos modelos gratuitos con alta demanda son más
      // permisivos cuando se incluyen. No afectan al comportamiento del
      // resto del flujo.
      'HTTP-Referer': 'https://oportunity.leroymerlin.internal',
      'X-Title': 'Oportunity'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(CONFIG.OPENROUTER_API_URL, options);
  const statusCode = response.getResponseCode();

  // --- DEBUG: trazabilidad de la respuesta (no afecta al comportamiento) ---
  debugLog_('Código HTTP de la respuesta', statusCode);
  debugLog_('Cuerpo completo de la respuesta', response.getContentText());

  if (statusCode !== 200) {
    throw new Error('OpenRouter ha devuelto un error (' + statusCode + ').');
  }

  const raw = JSON.parse(response.getContentText());
  const messageContent = extractMessageContent_(raw);
  const parsedJson = parseModelJson_(messageContent);
  validateBudgetJson_(parsedJson);

  return parsedJson;
}

/**
 * ⚠️ MODO DEBUG TEMPORAL ⚠️
 * Registra información técnica en Logger.log() únicamente si la constante
 * global DEBUG (Config.gs) está activa. No modifica ningún dato ni
 * comportamiento: es solo trazabilidad para depuración. Eliminar junto con
 * la constante DEBUG cuando termine la depuración.
 */
function debugLog_(label, value) {
  if (typeof DEBUG === 'undefined' || !DEBUG) return;
  try {
    const printable = (typeof value === 'string') ? value : JSON.stringify(value);
    Logger.log('[DEBUG] ' + label + ': ' + printable);
  } catch (e) {
    Logger.log('[DEBUG] ' + label + ': (no se ha podido serializar el valor)');
  }
}

/**
 * ⚠️ MODO DEBUG TEMPORAL ⚠️
 * Tamaño aproximado en bytes de una cadena Base64 (sin prefijo data:URL),
 * solo para trazabilidad. Fórmula estándar de Base64 -> bytes.
 */
function approxBase64Bytes_(base64) {
  if (!base64) return 0;
  const len = base64.length;
  const padding = (base64.slice(-2) === '==') ? 2 : (base64.slice(-1) === '=') ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

/**
 * Extrae el texto del primer mensaje de la respuesta de OpenRouter.
 */
function extractMessageContent_(raw) {
  if (!raw || !raw.choices || raw.choices.length === 0) {
    throw new Error('Respuesta de OpenRouter no válida.');
  }
  return raw.choices[0].message.content;
}

/**
 * Limpia y parsea el JSON devuelto por el modelo.
 * No asume que el modelo respeta el formato exacto solicitado: elimina
 * bloques de markdown si existen y, si aún así el contenido trae texto
 * adicional antes o después, extrae el primer bloque { ... } válido.
 */
function parseModelJson_(text) {
  const withoutFences = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();

  try {
    return JSON.parse(withoutFences);
  } catch (e) {
    // El modelo puede haber añadido texto antes/después del JSON pese a las
    // instrucciones del prompt. Se extrae el primer objeto JSON completo
    // buscando desde la primera '{' hasta su '}' de cierre correspondiente.
    const extracted = extractFirstJsonObject_(withoutFences);
    if (extracted === null) {
      throw new Error('No se ha podido interpretar correctamente la captura.');
    }
    try {
      return JSON.parse(extracted);
    } catch (e2) {
      throw new Error('No se ha podido interpretar correctamente la captura.');
    }
  }
}

/**
 * Busca el primer objeto JSON completo dentro de un texto, contando llaves
 * para localizar el cierre correspondiente a la primera apertura. Devuelve
 * null si no encuentra un bloque balanceado.
 */
function extractFirstJsonObject_(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') depth--;
    if (depth === 0) {
      return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Valida que el JSON tenga una estructura mínima aceptable antes de
 * devolverlo al frontend. Deliberadamente genérica: no asume todavía el
 * esquema definitivo del presupuesto (eso se define en 03_DATA_MODEL.md y
 * se validará con más detalle en un sprint posterior).
 */
function validateBudgetJson_(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('No se ha podido interpretar correctamente la captura.');
  }

  if (Object.keys(json).length === 0) {
    throw new Error('No se ha podido interpretar correctamente la captura.');
  }
}
