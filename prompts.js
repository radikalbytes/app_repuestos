// prompts.js
// Definición centralizada de todos los prompts usados por la API de OpenAI y xAI.
// Cada entrada incluye textos de sistema y de usuario, separados de la lógica.

module.exports = {
  openai: {
    // **Descripción de imageAnalysis**
    // Prompt para extraer tablas/listados de repuestos a partir de imágenes.
    imageAnalysis: {
      system:
        'Eres un asistente experto en visión por computador y extracción de datos estructurados de tablas.',
      user:
        'La imagen contiene un listado/tabulado de referencias de elementos electrónicos de una máquina. ' +
        'Extrae TODAS las filas y devuelve ÚNICAMENTE un JSON con esta forma exacta: ' +
        '{ "items": [ { "Columna1": "valor", "Columna2": "valor", ... } ] }. ' +
        'Las claves de cada objeto deben coincidir con los encabezados reales de la tabla en la imagen ' +
        '(por ejemplo: "Referencia", "Descripción", "Cantidad", etc.). No añadas texto fuera del JSON.',
    },

    // **Descripción de translateDescriptions**
    // Prompt para traducir descripciones al español de España, resolviendo posibles
    // duplicidades en dos idiomas y devolviendo sólo la versión española.
    translateDescriptions: {
      system:
        'Eres un traductor profesional al español de España. Devuelves siempre JSON válido.',
      user:
        'Traduce al español de España las descripciones que aparecen en el array JSON "descriptions". ' +
        'Si alguna descripción contiene la misma información en dos idiomas, tu salida debe incluir ' +
        'ÚNICAMENTE la versión en español de España y eliminar el resto. ' +
        'Devuelve únicamente un JSON con esta forma exacta: ' +
        '{ "translated": ["DESCRIPCION 1", "DESCRIPCION 2", ...] } conservando el mismo orden.',
    },
  },

  xai: {
    // **Descripción de imageAnalysis**
    // Prompt equivalente para xAI (modelo grok-4-1-fast-non-reasoning) para extraer
    // tablas/listados de repuestos a partir de imágenes.
    imageAnalysis: {
      system:
        'Eres una IA experta en lectura de tablas e inventarios de repuestos a partir de imágenes. ' +
        'Extraes datos de forma muy precisa y devuelves siempre JSON válido.',
      user:
        'Analiza la imagen que te proporciono. Contiene un listado/tabulado de referencias de elementos electrónicos de una máquina. ' +
        'Extrae TODAS las filas visibles y devuelve ÚNICAMENTE un JSON con esta forma exacta: ' +
        '{ "items": [ { "Columna1": "valor", "Columna2": "valor", ... } ] }. ' +
        'Las claves de cada objeto deben coincidir con los encabezados reales de la tabla en la imagen ' +
        '(por ejemplo: "Referencia", "Descripción", "Cantidad", etc.). No añadas texto fuera del JSON.',
    },

    // **Descripción de translateDescriptions**
    // Prompt para xAI para traducir descripciones al español de España y limpiar
    // duplicidad de idiomas.
    translateDescriptions: {
      system:
        'Eres un traductor profesional al español de España. Devuelves siempre JSON válido.',
      user:
        'Traduce al español de España las descripciones que aparecen en el array JSON "descriptions". ' +
        'Si alguna descripción contiene la misma información en dos idiomas, tu salida debe incluir ' +
        'ÚNICAMENTE la versión en español de España y eliminar el resto. ' +
        'Devuelve únicamente un JSON con esta forma exacta: ' +
        '{ "translated": ["DESCRIPCION 1", "DESCRIPCION 2", ...] } conservando el mismo orden.',
    },
  },
};

