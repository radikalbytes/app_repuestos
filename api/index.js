// api/index.js
// Punto de entrada para Vercel. Exporta la aplicación Express creada en server.js
// como función serverless.
//
// **Descripción de la función createServer (importada)**
// - Procede de server.js y devuelve una instancia de Express con:
//   - Rutas de análisis de imágenes (OpenAI y xAI).
//   - Rutas de traducción de descripciones.
//   - Ruta de generación de listado estándar.
//
// Este archivo:
// - No llama a app.listen, lo que lo hace compatible con el runtime serverless
//   de Vercel.
// - Simplemente exporta la app para que @vercel/node la envuelva.

const { createServer } = require('../server');

const app = createServer();

module.exports = app;

