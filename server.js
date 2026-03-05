// server.js
// Servidor Express que expone el endpoint para analizar imágenes con la API de OpenAI
// y sirve la aplicación frontend basada en AngularJS.

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const fetch = require('node-fetch');
const prompts = require('./prompts');

// Carga de variables de entorno desde el archivo .env
dotenv.config();

// **Descripción de la función createServer**
// createServer inicializa y configura una instancia de servidor Express.
// - No recibe parámetros.
// - Devuelve un objeto de aplicación Express listo para ser usado o arrancado.
function createServer() {
  const app = express();

  // Middleware básicos
  app.use(cors());
  app.use(express.json({ limit: '15mb' })); // Soporta imágenes en base64 grandes

  // **Descripción de la función logBrokenJson**
  // logBrokenJson guarda en un archivo .log el contenido bruto devuelto por
  // un proveedor de IA cuando no se ha podido parsear como JSON.
  //
  // Parámetros:
  // - source: identificador corto del origen (por ejemplo 'openai-analysis' o 'xai-translation').
  // - content: cadena de texto devuelta por el modelo que no ha podido parsearse.
  function logBrokenJson(source, content) {
    try {
      const logPath = path.join(__dirname, 'broken-json.log');
      const snippet =
        typeof content === 'string' ? content.slice(0, 4000) : String(content);
      const line = `[${new Date().toISOString()}] [${source}] ${snippet}\n\n`;
      fs.appendFileSync(logPath, line, { encoding: 'utf8' });
    } catch (err) {
      console.error('No se pudo escribir en broken-json.log:', err);
    }
  }

  // **Descripción de la función salvageItemsFromPartialJson**
  // salvageItemsFromPartialJson intenta recuperar el array "items" de una
  // respuesta que debería ser JSON pero está truncada o contiene texto extra.
  //
  // Estrategia:
  // - Localizar el fragmento después de "items:[" y antes del último "}".
  // - Intentar parsear como un array JSON recortando posibles restos.
  //
  // Parámetros:
  // - content: cadena de texto devuelta por el modelo.
  //
  // Retorna:
  // - Array de objetos recuperados, o [] si no se pudo salvar nada.
  function salvageItemsFromPartialJson(content) {
    if (!content || typeof content !== 'string') {
      return [];
    }

    const match = content.match(/"items"\s*:\s*\[([\s\S]*)\]/);
    if (!match) {
      return [];
    }

    const inner = match[1];
    const lastBrace = inner.lastIndexOf('}');
    if (lastBrace === -1) {
      return [];
    }

    const arrayJson = '[' + inner.slice(0, lastBrace + 1) + ']';

    try {
      const arr = JSON.parse(arrayJson);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  // Servir archivos estáticos del frontend AngularJS desde la carpeta "public"
  app.use(express.static(path.join(__dirname, 'public')));
  // Servir los recursos del logo desde la carpeta "logo"
  app.use('/logo', express.static(path.join(__dirname, 'logo')));

  // **Descripción de la ruta POST /api/analyze-images**
  // Esta ruta recibe un lote de imágenes en base64 y devuelve un listado
  // de elementos extraído por la API de OpenAI.
  //
  // Implementa procesamiento en lotes con un máximo de 10 imágenes
  // analizadas en paralelo para acelerar el análisis.
  //
  // Parámetros (en el cuerpo JSON de la petición):
  // - images: array de strings. Cada string debe ser una data URL base64 con la imagen.
  app.post('/api/analyze-images', async (req, res) => {
    const { images } = req.body || {};

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error:
          'Falta la variable de entorno OPENAI_API_KEY. Defínela en el archivo .env.',
      });
    }

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        error: 'Debes enviar un array \"images\" con al menos una imagen en base64.',
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

    const allItems = [];
    const perImageItems = new Array(images.length).fill(null);

    // **Descripción de la función analyzeSingleImage**
    // analyzeSingleImage llama a la API de OpenAI para una única imagen
    // y devuelve un array de filas (items) extraídas de la tabla detectada.
    //
    // Parámetros:
    // - imageDataUrl: string con la data URL base64 de la imagen.
    //
    // Retorna:
    // - Array de objetos con las columnas detectadas para esa imagen.
    async function analyzeSingleImage(imageDataUrl) {
      const completionResponse = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: prompts.openai.imageAnalysis.system,
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: prompts.openai.imageAnalysis.user,
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: imageDataUrl,
                    },
                  },
                ],
              },
            ],
          }),
        }
      );

      if (!completionResponse.ok) {
        const errorText = await completionResponse.text();
        console.error('Error en respuesta de OpenAI:', errorText);
        return [];
      }

      const completionJson = await completionResponse.json();
      const content =
        completionJson.choices?.[0]?.message?.content?.trim() || '';

      try {
        const parsed = JSON.parse(content);
        if (parsed && Array.isArray(parsed.items)) {
          return parsed.items;
        }
      } catch (parseError) {
        console.error('No se pudo parsear el JSON devuelto por OpenAI:', parseError);
        logBrokenJson('openai-analysis', content);
        const salvaged = salvageItemsFromPartialJson(content);
        if (salvaged.length > 0) {
          return salvaged;
        }
      }

      return [];
    }

    // **Descripción del procesamiento en lotes**
    // Se divide el array de imágenes en bloques de tamaño máximo 10 y,
    // para cada bloque, se analizan todas las imágenes en paralelo con Promise.all.
    const batchSize = 10;
    for (let i = 0; i < images.length; i += batchSize) {
      const batch = images.slice(i, i + batchSize);

      // Analizar todas las imágenes del lote en paralelo
      const batchResults = await Promise.all(
        batch.map((imageDataUrl, idxInBatch) =>
          analyzeSingleImage(imageDataUrl)
            .then((items) => ({
              index: i + idxInBatch,
              items,
            }))
            .catch((error) => {
              console.error('Error llamando a OpenAI en lote:', error);
              return { index: i + idxInBatch, items: [] };
            })
        )
      );

      batchResults.forEach(({ index, items }) => {
        if (Array.isArray(items)) {
          perImageItems[index] = items;
          if (items.length > 0) {
            allItems.push(...items);
          }
        }
      });
    }

    return res.json({ items: allItems, perImageItems });
  });

  // **Descripción de la ruta POST /api/translate-descriptions**
  // Esta ruta recibe un array de descripciones de texto y devuelve el mismo
  // número de descripciones traducidas al español de España utilizando la API de OpenAI.
  //
  // Parámetros (en el cuerpo JSON de la petición):
  // - descriptions: array de strings con las descripciones originales.
  app.post('/api/translate-descriptions', async (req, res) => {
    const { descriptions } = req.body || {};

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error:
          'Falta la variable de entorno OPENAI_API_KEY. Defínela en el archivo .env.',
      });
    }

    if (!Array.isArray(descriptions)) {
      return res.status(400).json({
        error: 'Debes enviar un array "descriptions" con las descripciones a traducir.',
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

    try {
      const completionResponse = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: prompts.openai.translateDescriptions.system,
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: prompts.openai.translateDescriptions.user,
                  },
                  {
                    type: 'text',
                    text: JSON.stringify({ descriptions }),
                  },
                ],
              },
            ],
          }),
        }
      );

      if (!completionResponse.ok) {
        const errorText = await completionResponse.text();
        console.error('Error en respuesta de OpenAI (traducción):', errorText);
        return res.status(502).json({
          error:
            'Se produjo un error al comunicarse con el servicio de traducción de OpenAI.',
        });
      }

      const completionJson = await completionResponse.json();
      const content =
        completionJson.choices?.[0]?.message?.content?.trim() || '';

      let translated = descriptions;

      try {
        const parsed = JSON.parse(content);
        if (parsed && Array.isArray(parsed.translated)) {
          translated = parsed.translated;
        }
      } catch (parseError) {
        console.error(
          'No se pudo parsear el JSON devuelto por OpenAI (traducción):',
          parseError
        );
        logBrokenJson('openai-translation', content);
      }

      return res.json({ translated });
    } catch (error) {
      console.error('Error llamando a OpenAI (traducción):', error);
      return res.status(502).json({
        error:
          'Se produjo un error al intentar traducir las descripciones con OpenAI.',
      });
    }
  });

  // **Descripción de la ruta POST /api/analyze-images-xai**
  // Similar a /api/analyze-images pero utilizando la API de xAI (Grok) y el
  // modelo grok-4-1-fast-non-reasoning. El procesamiento se hace imagen a
  // imagen, con un máximo de 2 peticiones concurrentes para evitar excesos
  // de tokens, pero manteniendo listados independientes por imagen.
  //
  // Parámetros (en el cuerpo JSON de la petición):
  // - images: array de strings. Cada string debe ser una data URL base64 con la imagen.
  app.post('/api/analyze-images-xai', async (req, res) => {
    const { images } = req.body || {};

    if (!process.env.XAI_API_KEY) {
      return res.status(500).json({
        error:
          'Falta la variable de entorno XAI_API_KEY. Defínela en el archivo .env.',
      });
    }

    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        error: 'Debes enviar un array \"images\" con al menos una imagen en base64.',
      });
    }

    const apiKey = process.env.XAI_API_KEY;
    const model =
      process.env.XAI_MODEL_ANALYSIS || 'grok-4-1-fast-non-reasoning';
    const baseUrl = process.env.XAI_API_BASE || 'https://api.x.ai/v1';

    const allItems = [];
    const perImageItems = new Array(images.length).fill(null);

    // **Descripción de la función analyzeSingleImageXai**
    // analyzeSingleImageXai llama a la API de xAI para una única imagen y
    // devuelve un array de filas (items) extraídas de la tabla detectada.
    async function analyzeSingleImageXai(imageDataUrl) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: prompts.xai.imageAnalysis.system,
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: prompts.xai.imageAnalysis.user,
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageDataUrl,
                    detail: 'high',
                  },
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error en respuesta de xAI (análisis):', errorText);
        return [];
      }

      const json = await response.json();
      const content = json.choices?.[0]?.message?.content?.trim() || '';

      try {
        const parsed = JSON.parse(content);
        if (parsed && Array.isArray(parsed.items)) {
          return parsed.items;
        }
      } catch (parseError) {
        console.error(
          'No se pudo parsear el JSON devuelto por xAI (análisis):',
          parseError
        );
        logBrokenJson('xai-analysis', content);
        const salvaged = salvageItemsFromPartialJson(content);
        if (salvaged.length > 0) {
          return salvaged;
        }
      }

      return [];
    }

    // Procesar las imágenes SECÜENCIALMENTE, una por una.
    for (let i = 0; i < images.length; i += 1) {
      try {
        const items = await analyzeSingleImageXai(images[i]);
        if (Array.isArray(items)) {
          perImageItems[i] = items;
          if (items.length > 0) {
            allItems.push(...items);
          }
        }
      } catch (error) {
        console.error('Error llamando a xAI para la imagen', i, error);
      }
    }

    return res.json({ items: allItems, perImageItems });
  });

  // **Descripción de la ruta POST /api/translate-descriptions-xai**
  // Igual que /api/translate-descriptions pero utilizando la API de xAI.
  //
  // Parámetros (en el cuerpo JSON de la petición):
  // - descriptions: array de strings con las descripciones originales.
  app.post('/api/translate-descriptions-xai', async (req, res) => {
    const { descriptions } = req.body || {};

    if (!process.env.XAI_API_KEY) {
      return res.status(500).json({
        error:
          'Falta la variable de entorno XAI_API_KEY. Defínela en el archivo .env.',
      });
    }

    if (!Array.isArray(descriptions)) {
      return res.status(400).json({
        error: 'Debes enviar un array "descriptions" con las descripciones a traducir.',
      });
    }

    const apiKey = process.env.XAI_API_KEY;
    const model =
      process.env.XAI_MODEL_TRANSLATION || 'grok-4-1-fast-non-reasoning';
    const baseUrl = process.env.XAI_API_BASE || 'https://api.x.ai/v1';

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: prompts.xai.translateDescriptions.system,
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: prompts.xai.translateDescriptions.user,
                },
                {
                  type: 'text',
                  text: JSON.stringify({ descriptions }),
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error en respuesta de xAI (traducción):', errorText);
        return res.status(502).json({
          error:
            'Se produjo un error al comunicarse con el servicio de traducción de xAI.',
        });
      }

      const json = await response.json();
      const content = json.choices?.[0]?.message?.content?.trim() || '';

      let translated = descriptions;

      try {
        const parsed = JSON.parse(content);
        if (parsed && Array.isArray(parsed.translated)) {
          translated = parsed.translated;
        }
      } catch (parseError) {
        console.error(
          'No se pudo parsear el JSON devuelto por xAI (traducción):',
          parseError
        );
        logBrokenJson('xai-translation', content);
      }

      return res.json({ translated });
    } catch (error) {
      console.error('Error llamando a xAI (traducción):', error);
      return res.status(502).json({
        error:
          'Se produjo un error al intentar traducir las descripciones con xAI.',
      });
    }
  });

  // **Descripción de la ruta POST /api/standard-list**
  // Esta ruta recibe el listado final del Paso 3 (campo Referencia, Cantidad,
  // Descripcion, Fabricante) y genera un listado estándar con la misma
  // estructura que el fichero de referencia WQ2599/WQ2959, fusionándolo
  // con la base de componentes existente en BASE_COMPONENTES.csv si está
  // disponible.
  //
  // Parámetros (en el cuerpo JSON de la petición):
  // - items: array de objetos { Referencia, Cantidad, Descripcion, Fabricante }
  app.post('/api/standard-list', async (req, res) => {
    const { items } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error:
          'Debes enviar un array "items" con el listado final del Paso 3.',
      });
    }

    // Cabeceras estándar basadas en el archivo WQ2959.csv de referencia.
    const headers = [
      'NAME',
      'TYPE',
      'QUANTITY',
      'DESCRIPTION',
      'BRAND',
      'Workshop',
      'ADDITIONAL_INFO',
      'SUPPLIER',
      'BUY PRICE(€)',
      'REPAIR PRICE',
      'MIN STOCK',
      'ALTERNATIVE',
      'AVALIABILITY',
      'CRITICAL',
      'PICTURE',
    ];

    // Cargar base de componentes si existe.
    const baseComponentsPath = path.join(__dirname, 'BASE_COMPONENTES.csv');
    const baseMap = new Map();
    const baseTypesSet = new Set();

    if (fs.existsSync(baseComponentsPath)) {
      try {
        const raw = fs.readFileSync(baseComponentsPath, 'utf8');
        const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length > 1) {
          const headerLine = lines[0];
          const baseHeaders = headerLine.split(';');

          lines.slice(1).forEach((line) => {
            const cols = line.split(';');
            if (!cols[0]) return;
            const row = {};
            baseHeaders.forEach((h, idx) => {
              row[h] = cols[idx] || '';
            });
            baseMap.set(row.NAME, row);
            if (row.TYPE) {
              baseTypesSet.add(row.TYPE);
            }
          });
        }
      } catch (error) {
        console.error('Error leyendo BASE_COMPONENTES.csv:', error);
      }
    }

    // Función auxiliar para normalizar texto: mayúsculas y sin acentos.
    function normalizeText(value) {
      if (!value) return '';
      let s = value.toString().toUpperCase();
      s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return s;
    }

    // Agrupar los items entrantes por referencia para acumular cantidades.
    const aggregated = new Map();
    items.forEach((item) => {
      const ref = normalizeText(item.Referencia || '');
      if (!ref) return;
      const key = ref;
      const current = aggregated.get(key) || {
        Referencia: ref,
        Cantidad: 0,
        Descripcion: normalizeText(item.Descripcion || ''),
        Fabricante: normalizeText(item.Fabricante || ''),
      };
      const qty = Number(item.Cantidad || 0) || 0;
      current.Cantidad += qty;
      aggregated.set(key, current);
    });

    const rows = [];
    const baseTypes = Array.from(baseTypesSet);

    // Construir filas estándar combinando base de datos y nuevos datos.
    aggregated.forEach((item, ref) => {
      const baseRow = baseMap.get(ref);
      let row = {};

      if (baseRow) {
        // Si el artículo ya está en la base, usar sus datos y acumular cantidades.
        headers.forEach((h) => {
          row[h] = baseRow[h] || '';
        });

        const existingQty = Number(row['QUANTITY'] || 0) || 0;
        row['QUANTITY'] = String(existingQty + item.Cantidad);
      } else {
        // Si es un artículo nuevo, crear una fila estándar mínima.
        row.NAME = ref;
        // TYPE: usar solo valores ya existentes en BASE_COMPONENTES.csv
        row.TYPE = baseTypes.length > 0 ? baseTypes[0] : '';
        row.QUANTITY = String(item.Cantidad || 0);
        row.DESCRIPTION = item.Descripcion || '';
        row.BRAND = item.Fabricante || '';
        row.Workshop = 'E';
        row.ADDITIONAL_INFO = '';
        row.SUPPLIER = '';
        row['BUY PRICE(€)'] = '';
        row['REPAIR PRICE'] = '';
        row['MIN STOCK'] = '1';
        row.ALTERNATIVE = '';
        row.AVALIABILITY = 'TRUE';
        row.CRITICAL = '';
        row.PICTURE = '';
      }

      // Asegurar normalización de textos: mayúsculas y sin acentos en campos
      // de texto relevantes.
      row.NAME = normalizeText(row.NAME);
      row.DESCRIPTION = normalizeText(row.DESCRIPTION);
      row.BRAND = normalizeText(row.BRAND);
      row.TYPE = normalizeText(row.TYPE);
      row.SUPPLIER = normalizeText(row.SUPPLIER);
      row.ADDITIONAL_INFO = normalizeText(row.ADDITIONAL_INFO);
      row.ALTERNATIVE = normalizeText(row.ALTERNATIVE);

      // Determinar si es crítico: precio de compra > 1000€ marca crítico.
      const buyPrice = Number(
        (row['BUY PRICE(€)'] || '').toString().replace(',', '.')
      );
      if (!Number.isNaN(buyPrice) && buyPrice > 1000) {
        row.CRITICAL = 'TRUE';
      } else if (!row.CRITICAL) {
        row.CRITICAL = 'FALSE';
      }

      rows.push(row);
    });

    // Ordenar por nombre de referencia
    rows.sort((a, b) => (a.NAME > b.NAME ? 1 : a.NAME < b.NAME ? -1 : 0));

    // Generar CSV separado por ';'
    const csvLines = [];
    csvLines.push(headers.join(';'));
    rows.forEach((row) => {
      const cols = headers.map((h) => (row[h] !== undefined ? row[h] : ''));
      csvLines.push(cols.join(';'));
    });
    const csvText = csvLines.join('\n');

    return res.json({ headers, rows, csvText });
  });

  return app;
}

// **Descripción de la función startServer**
// startServer arranca el servidor HTTP escuchando en el puerto configurado.
// - Parámetros:
//   - app: instancia de Express devuelta por createServer.
//   - port: número de puerto en el que se levantará el servidor.
function startServer(app, port) {
  app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
  });
}

// Punto de entrada principal cuando se ejecuta `node server.js`
if (require.main === module) {
  const app = createServer();
  const port = process.env.PORT || 3000;
  startServer(app, port);
}

module.exports = { createServer, startServer };

