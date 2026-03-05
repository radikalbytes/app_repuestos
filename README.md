# Analizador de repuestos electrónicos (AngularJS + Node/Express)

Aplicación sencilla para subir un lote de imágenes con listados de referencias de elementos electrónicos de una máquina, analizarlos con la API de ChatGPT (OpenAI) y mostrar en pantalla el listado estructurado de elementos (Paso 1 del programa).

## Estructura del proyecto

- `server.js`: servidor Node/Express que:
  - Expone el endpoint `POST /api/analyze-images` que llama a la API de OpenAI con visión.
  - Sirve el frontend estático desde la carpeta `public`.
- `public/index.html`: vista principal con AngularJS (angular.js) y maquetación básica.
- `public/app.js`: lógica AngularJS para:
  - Cargar múltiples imágenes.
  - Enviar las imágenes al backend.
  - Mostrar el listado de elementos devuelto.
- `public/styles.css`: estilos y diseño de la interfaz.
- `.env`: variables de entorno (API key de OpenAI y configuración).
- `.gitignore`: excluye `.env`, `node_modules`, etc.

## Variables de entorno (.env)

En la raíz del proyecto tienes un archivo `.env` de ejemplo. Debes editarlo y establecer tu clave real de OpenAI:

```env
OPENAI_API_KEY=TU_API_KEY_DE_OPENAI_AQUI
OPENAI_MODEL=gpt-4.1-mini
PORT=3000
```

- **OPENAI_API_KEY**: tu API key de OpenAI (no la compartas ni la subas a GitHub).
- **OPENAI_MODEL**: modelo de ChatGPT a usar (por defecto `gpt-4.1-mini`).
- **PORT**: puerto en el que se levantará el servidor Express.

## Instalación de dependencias

Desde la carpeta raíz del proyecto (`/Volumes/SSD_1Tb2/App_repuestos`), ejecuta:

```bash
npm install
```

Esto instalará las dependencias declaradas en `package.json` (Express, CORS, dotenv, node-fetch, etc.).

## Arrancar el servidor en local

1. Asegúrate de tener una versión de Node.js relativamente reciente (>= 18 recomendado).
2. Configura tu archivo `.env` con tu `OPENAI_API_KEY`.
3. Desde la raíz del proyecto, ejecuta:

```bash
npm start
```

El servidor se levantará (por defecto) en `http://localhost:3000`.

## Probar la aplicación

1. Abre en tu navegador `http://localhost:3000`.
2. En la pantalla principal:
   - Paso 1: pulsa en **“Seleccionar imágenes”** y escoge una o varias imágenes que contengan el listado de referencias de repuestos.
   - Revisa las miniaturas de las imágenes seleccionadas.
   - Pulsa en **“Analizar imágenes con ChatGPT”**.
3. El backend llamará a la API de OpenAI para cada imagen y devolverá un JSON con los elementos detectados.
4. El frontend mostrará el **listado consolidado** en forma de tabla (Paso 1 del programa).

## Notas

- El archivo `.env` ya está incluido en `.gitignore` para evitar que tus claves se suban a GitHub.
- Cada función en el código incluye comentarios en español describiendo su responsabilidad y parámetros, para facilitar la comprensión.

