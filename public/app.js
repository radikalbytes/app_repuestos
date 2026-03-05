// app.js
// Definición del módulo AngularJS y del controlador principal para gestionar
// la carga de imágenes, el envío al backend y la visualización del listado resultante.

(function () {
  'use strict';

  // **Descripción del módulo imageAnalyzerApp**
  // imageAnalyzerApp es el módulo raíz de la aplicación AngularJS.
  // - No recibe parámetros.
  // - Se utiliza para registrar controladores y otros componentes de AngularJS.
  angular.module('imageAnalyzerApp', []).controller('ImageUploadController', [
    '$scope',
    '$http',
    function ImageUploadController($scope, $http) {
      var vm = this;

      // Estado de la vista
      vm.images = [];
      vm.items = []; // ya no se usa para el listado detectado, pero se mantiene por compatibilidad
      vm.columns = []; // idem
      vm.rows = [];
      vm.columnIndices = [];
      vm.isAnalyzing = false;
      vm.errorMessage = '';
      vm.selectedImage = null;
      vm.isPreviewOpen = false;
      vm.step2Active = false;
      vm.step3Active = false;
      vm.isGenerating = false;
      vm.finalItems = [];
      vm.analysisCurrentIndex = 0;
      vm.analysisTotal = 0;
      vm.analysisPhase = null;
      vm.usingXai = false;
      vm.standardHeaders = [];
      vm.standardRows = [];
      vm.standardCsv = '';

      // Configuración de mapeo de campos para el Paso 2
      // **Descripción de la propiedad targetFields**
      // targetFields define los 4 campos de salida fijos que el usuario debe rellenar
      // a partir de los campos detectados: Referencia, Cantidad, Descripción y Fabricante.
      // Cada entrada incluye:
      // - key: nombre interno del campo de salida.
      // - label: etiqueta legible que se muestra en la interfaz.
      vm.targetFields = [
        { key: 'Referencia', label: 'Referencia' },
        { key: 'Cantidad', label: 'Cantidad' },
        { key: 'Descripcion', label: 'Descripción' },
        { key: 'Fabricante', label: 'Fabricante' },
      ];

      // **Descripción de la propiedad mappingConfig**
      // mappingConfig guarda, para cada campo de salida, qué campos de entrada
      // se usan para rellenarlo (campo principal y campo opcional para concatenar).
      // Estructura:
      // - field1: nombre del campo de entrada principal.
      // - field2: nombre del campo de entrada adicional a concatenar (opcional).
      vm.mappingConfig = {
        Referencia: { field1: null, field2: null },
        Cantidad: { field1: null, field2: null },
        Descripcion: { field1: null, field2: null },
        Fabricante: { field1: null, field2: null },
      };

      // **Descripción de la función onFilesSelected**
      // onFilesSelected procesa los archivos de imagen seleccionados por el usuario
      // y los convierte a data URLs base64 para poder enviarlos al backend.
      //
      // Parámetros:
      // - fileList: objeto FileList que contiene todos los archivos seleccionados.
      vm.onFilesSelected = function onFilesSelected(fileList) {
        vm.images = [];
        vm.items = [];
        vm.columns = [];
        vm.rows = [];
        vm.columnIndices = [];
        vm.errorMessage = '';
        vm.selectedImage = null;
        vm.isPreviewOpen = false;
        vm.step2Active = false;
        vm.step3Active = false;
        vm.finalItems = [];
        vm.standardHeaders = [];
        vm.standardRows = [];
        vm.standardCsv = [];
        vm.usingXai = false;

        if (!fileList || fileList.length === 0) {
          $scope.$applyAsync();
          return;
        }

        var filesArray = Array.prototype.slice.call(fileList);
        var pending = filesArray.length;

        filesArray.forEach(function (file) {
          var reader = new FileReader();

          // **Descripción de la función onload del FileReader**
          // Esta función se ejecuta cuando el FileReader ha terminado de leer un archivo.
          // - Parámetros:
          //   - loadEvent: evento de carga que contiene el resultado en loadEvent.target.result.
          reader.onload = function (loadEvent) {
            var imageObject = {
              name: file.name,
              dataUrl: loadEvent.target.result,
            };

            vm.images.push(imageObject);

            pending -= 1;
            if (pending === 0) {
              $scope.$applyAsync();
            }
          };

          reader.readAsDataURL(file);
        });
      };

      // **Descripción de la función selectImage**
      // selectImage permite marcar una imagen como seleccionada y abrir
      // la ventana emergente de vista previa.
      //
      // Parámetros:
      // - image: objeto que representa la imagen (con al menos propiedades name y dataUrl).
      vm.selectImage = function selectImage(image) {
        vm.selectedImage = image;
        vm.isPreviewOpen = true;
      };

      // **Descripción de la función closePreview**
      // closePreview cierra la ventana emergente de vista previa sin perder
      // la referencia a la imagen seleccionada.
      //
      // No recibe parámetros.
      vm.closePreview = function closePreview() {
        vm.isPreviewOpen = false;
      };

      // **Descripción de la función openStep2**
      // openStep2 activa el Paso 2 de selección de campos para que el usuario
      // pueda asignar los campos detectados a los 4 campos de salida.
      //
      // No recibe parámetros.
      vm.openStep2 = function openStep2() {
        vm.step2Active = true;
        vm.step3Active = false;
        vm.finalItems = [];
      };

      // **Descripción de la función analyzeImages**
      // analyzeImages envía todas las imágenes cargadas al backend para que
      // éste llame a la API de OpenAI y devuelva el listado de elementos.
      //
      // No recibe parámetros; utiliza vm.images como fuente de datos.
      // El análisis se realiza imagen a imagen para garantizar resultados
      // correctos y poder mostrar el progreso en pantalla.
      vm.analyzeImages = function analyzeImages() {
        if (!vm.images || vm.images.length === 0) {
          vm.errorMessage = 'Debes seleccionar al menos una imagen.';
          return;
        }

        vm.usingXai = false;
        vm.isAnalyzing = true;
        vm.errorMessage = '';
        vm.items = [];
        vm.columns = [];
        vm.rows = [];
        vm.columnIndices = [];
        vm.analysisCurrentIndex = 0;
        vm.analysisTotal = vm.images.length;
        vm.analysisPhase = 'analizando';

        var mergedRows = [];
        var globalColumnCount = 0;

        // **Descripción de la función processNextImage**
        // processNextImage analiza secuencialmente cada imagen, normaliza su listado
        // y lo fusiona con el resto, actualizando el indicador de progreso.
        //
        // Parámetros:
        // - index: índice (0-based) de la imagen actual a procesar.
        function processNextImage(index) {
          if (index >= vm.images.length) {
            // Todas las imágenes procesadas
            vm.rows = mergedRows;
            vm.columnIndices = [];
            for (var c = 0; c < globalColumnCount; c += 1) {
              vm.columnIndices.push(c);
            }
            vm.isAnalyzing = false;
            vm.analysisPhase = null;
            return;
          }

          vm.analysisCurrentIndex = index + 1;
          vm.analysisPhase = 'analizando';

          var payload = {
            images: [vm.images[index].dataUrl],
          };

          $http
            .post('/api/analyze-images', payload)
            .then(function (response) {
              vm.analysisPhase = 'listado';

              var data = response.data || {};
              // Para una sola imagen, usamos perImageItems[0] si existe; si no, items.
              var perImageItems = Array.isArray(data.perImageItems)
                ? data.perImageItems[0]
                : data.items || [];

              var normalized = normalizeItems(perImageItems || []);

              (normalized.rows || []).forEach(function (row) {
                mergedRows.push(row);
              });

              if (normalized.columnCount > globalColumnCount) {
                globalColumnCount = normalized.columnCount;
              }
            })
            .catch(function (error) {
              console.error('Error al analizar imagen individual:', error);
              // Continuamos con el resto de imágenes aunque una falle.
            })
            .finally(function () {
              // Pasar a la siguiente imagen
              processNextImage(index + 1);
            });
        }

        // Iniciar procesamiento secuencial
        processNextImage(0);
      };

      // **Descripción de la función analyzeImagesWithXai**
      // analyzeImagesWithXai envía todas las imágenes cargadas al backend para que
      // éste llame a la API de xAI (Grok) y devuelva el listado de elementos.
      // El análisis se hace imagen a imagen (como con OpenAI) pero el backend
      // limita la concurrencia a lotes de 2 para evitar excesos de tokens.
      //
      // No recibe parámetros; utiliza vm.images como fuente de datos.
      vm.analyzeImagesWithXai = function analyzeImagesWithXai() {
        if (!vm.images || vm.images.length === 0) {
          vm.errorMessage = 'Debes seleccionar al menos una imagen.';
          return;
        }

        vm.usingXai = true;
        vm.isAnalyzing = true;
        vm.errorMessage = '';
        vm.items = [];
        vm.columns = [];
        vm.rows = [];
        vm.columnIndices = [];
        vm.analysisCurrentIndex = 0;
        vm.analysisTotal = vm.images.length;
        vm.analysisPhase = 'analizando';

        var mergedRows = [];
        var globalColumnCount = 0;

        function processNextImage(index) {
          if (index >= vm.images.length) {
            vm.rows = mergedRows;
            vm.columnIndices = [];
            for (var c = 0; c < globalColumnCount; c += 1) {
              vm.columnIndices.push(c);
            }
            vm.isAnalyzing = false;
            vm.analysisPhase = null;
            return;
          }

          vm.analysisCurrentIndex = index + 1;
          vm.analysisPhase = 'analizando';

          var payload = {
            images: [vm.images[index].dataUrl],
          };

          $http
            .post('/api/analyze-images-xai', payload)
            .then(function (response) {
              vm.analysisPhase = 'listado';

              var data = response.data || {};
              var perImageItems = Array.isArray(data.perImageItems)
                ? data.perImageItems[0]
                : data.items || [];

              var normalized = normalizeItems(perImageItems || []);

              (normalized.rows || []).forEach(function (row) {
                mergedRows.push(row);
              });

              if (normalized.columnCount > globalColumnCount) {
                globalColumnCount = normalized.columnCount;
              }
            })
            .catch(function (error) {
              console.error('Error al analizar imagen individual con xAI:', error);
            })
            .finally(function () {
              processNextImage(index + 1);
            });
        }

        processNextImage(0);
      };

      // **Descripción de la función buildFieldValue**
      // buildFieldValue construye el valor de un campo de salida a partir de la
      // configuración de mapeo y de una fila de entrada.
      //
      // Parámetros:
      // - row: objeto que representa una fila original del listado detectado.
      // - config: objeto con la configuración { field1, field2 } para el campo actual.
      //
      // Retorna:
      // - String con el valor resultante (concatenando si hay dos campos) o cadena vacía.
      function buildFieldValue(row, config) {
        if (
          !config ||
          ((config.field1 === null || config.field1 === undefined) &&
            (config.field2 === null || config.field2 === undefined))
        ) {
          return '';
        }

        var part1 =
          config.field1 !== null && config.field1 !== undefined
            ? row[config.field1] || ''
            : '';
        var part2 =
          config.field2 !== null && config.field2 !== undefined
            ? row[config.field2] || ''
            : '';

        if (part1 && part2) {
          return (part1 + ' ' + part2).trim();
        }

        return (part1 || part2 || '').toString();
      }

      // **Descripción de la función generateFinalList**
      // generateFinalList aplica el mapeo de campos definido en el Paso 2,
      // traduce las descripciones al español de España, transforma los datos
      // (mayúsculas, normalización de referencias Siemens) y agrupa por referencia.
      //
      // No recibe parámetros; utiliza vm.items, vm.mappingConfig y vm.targetFields.
      vm.generateFinalList = function generateFinalList() {
        if (!vm.rows || vm.rows.length === 0) {
          vm.errorMessage =
            'No hay elementos detectados. Primero debes completar el Paso 1.';
          return;
        }

        vm.errorMessage = '';

        // Construir mapeo preliminar para todas las filas
        var preliminary = vm.rows.map(function (row) {
          var refConfig = vm.mappingConfig.Referencia || {};
          var qtyConfig = vm.mappingConfig.Cantidad || {};
          var descConfig = vm.mappingConfig.Descripcion || {};
          var fabConfig = vm.mappingConfig.Fabricante || {};

          return {
            // Permitimos concatenación en Referencia y Descripción.
            // En Cantidad y Fabricante se usa únicamente el campo principal (field1).
            Referencia: buildFieldValue(row, refConfig),
            Cantidad: buildFieldValue(row, {
              field1: qtyConfig.field1,
              field2: null,
            }),
            Descripcion: buildFieldValue(row, descConfig),
            Fabricante: buildFieldValue(row, {
              field1: fabConfig.field1,
              field2: null,
            }),
          };
        });

        // Extraer las descripciones a traducir
        var descriptions = preliminary.map(function (item) {
          return item.Descripcion || '';
        });

        vm.isGenerating = true;
        vm.finalItems = [];

        // Llamar al backend para traducir todas las descripciones a español de España.
        // Si el análisis se ha hecho con xAI, usamos también la API de xAI.
        var translateUrl = vm.usingXai
          ? '/api/translate-descriptions-xai'
          : '/api/translate-descriptions';
        $http
          .post(translateUrl, { descriptions: descriptions })
          .then(function (response) {
            var translated =
              (response.data && response.data.translated) || descriptions;

            // Construir listado final con traducciones
            vm.finalItems = buildFinalItems(preliminary, translated);
            vm.step3Active = true;
            vm.step2Active = false;
          })
          .catch(function (error) {
            console.error('Error al traducir descripciones:', error);
            vm.errorMessage =
              (error.data && error.data.error) ||
              'Se produjo un error al traducir las descripciones.';

            // Si falla la traducción, generamos igualmente el listado
            // usando las descripciones originales.
            vm.finalItems = buildFinalItems(preliminary, descriptions);
            vm.step3Active = true;
            vm.step2Active = false;
          })
          .finally(function () {
            vm.isGenerating = false;
          });
      };

      // **Descripción de la función generateStandardList**
      // generateStandardList envía el listado final del Paso 3 al backend para
      // generar un listado estándar con la estructura del fichero WQ2599/WQ2959
      // y lo guarda en vm.standardHeaders, vm.standardRows y vm.standardCsv.
      //
      // No recibe parámetros; utiliza vm.finalItems como fuente de datos.
      vm.generateStandardList = function generateStandardList() {
        if (!vm.finalItems || vm.finalItems.length === 0) {
          vm.errorMessage =
            'No hay listado final disponible. Genera primero el listado del Paso 3.';
          return;
        }

        vm.isGenerating = true;
        vm.errorMessage = '';
        vm.standardHeaders = [];
        vm.standardRows = [];
        vm.standardCsv = '';

        $http
          .post('/api/standard-list', { items: vm.finalItems })
          .then(function (response) {
            var data = response.data || {};
            vm.standardHeaders = data.headers || [];
            vm.standardRows = data.rows || [];
            vm.standardCsv = data.csvText || '';
          })
          .catch(function (error) {
            console.error('Error al generar listado estándar:', error);
            vm.errorMessage =
              (error.data && error.data.error) ||
              'Se produjo un error al generar el listado estándar.';
          })
          .finally(function () {
            vm.isGenerating = false;
          });
      };

      // **Descripción de la función exportStandardCsv**
      // exportStandardCsv descarga en el navegador el listado estándar en
      // formato CSV separado por ';'.
      //
      // No recibe parámetros; utiliza vm.standardCsv como contenido.
      vm.exportStandardCsv = function exportStandardCsv() {
        if (!vm.standardCsv) {
          vm.errorMessage =
            'No hay listado estándar generado para exportar. Genera primero el listado.';
          return;
        }

        var blob = new Blob([vm.standardCsv], {
          type: 'text/csv;charset=utf-8;',
        });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'listado_estandar.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      };

      // **Descripción de la función getFinalTotalQuantity**
      // getFinalTotalQuantity calcula la suma de las cantidades de todos los
      // elementos del listado final del Paso 3.
      //
      // No recibe parámetros; utiliza vm.finalItems como fuente de datos.
      vm.getFinalTotalQuantity = function getFinalTotalQuantity() {
        if (!vm.finalItems || vm.finalItems.length === 0) {
          return 0;
        }
        var total = 0;
        vm.finalItems.forEach(function (item) {
          var qty = Number(item.Cantidad || 0);
          if (!isNaN(qty)) {
            total += qty;
          }
        });
        return total;
      };

      // **Descripción de la función getStandardTotalQuantity**
      // getStandardTotalQuantity calcula la suma de las cantidades (QUANTITY)
      // de todos los elementos del listado estándar.
      //
      // No recibe parámetros; utiliza vm.standardRows como fuente de datos.
      vm.getStandardTotalQuantity = function getStandardTotalQuantity() {
        if (!vm.standardRows || vm.standardRows.length === 0) {
          return 0;
        }
        var total = 0;
        vm.standardRows.forEach(function (row) {
          var qty = Number((row['QUANTITY'] || '').toString().replace(',', '.'));
          if (!isNaN(qty)) {
            total += qty;
          }
        });
        return total;
      };

      // **Descripción de la función exportFinalCsv**
      // exportFinalCsv descarga en el navegador el listado final del Paso 3 en
      // formato CSV separado por ';'.
      //
      // Parámetros:
      // - No recibe parámetros; utiliza vm.finalItems como fuente de datos.
      vm.exportFinalCsv = function exportFinalCsv() {
        if (!vm.finalItems || vm.finalItems.length === 0) {
          vm.errorMessage =
            'No hay listado final disponible. Genera primero el listado del Paso 3.';
          return;
        }

        var headers = ['REFERENCIA', 'CANTIDAD', 'DESCRIPCION', 'FABRICANTE'];
        var lines = [];
        lines.push(headers.join(';'));

        vm.finalItems.forEach(function (item) {
          var ref = (item.Referencia !== undefined ? item.Referencia : '').toString();
          var qty = (item.Cantidad !== undefined ? item.Cantidad : '').toString();
          var desc = (item.Descripcion !== undefined ? item.Descripcion : '').toString();
          var brand = (item.Fabricante !== undefined ? item.Fabricante : '').toString();
          lines.push([ref, qty, desc, brand].join(';'));
        });

        var csv = lines.join('\n');

        var blob = new Blob([csv], {
          type: 'text/csv;charset=utf-8;',
        });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'listado_final_paso3.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      };

      // **Descripción de la función canonicalizeHeader**
      // canonicalizeHeader genera una clave canónica para un nombre de columna
      // eliminando tildes, normalizando espacios y pasando a mayúsculas.
      //
      // Parámetros:
      // - name: nombre de la columna original.
      //
      // Retorna:
      // - String canónico que se utiliza para detectar columnas duplicadas.
      function canonicalizeHeader(name) {
        if (!name) {
          return '';
        }

        var s = name.toString().trim();
        // Eliminar tildes/acentos
        s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        // Normalizar espacios múltiples
        s = s.replace(/\s+/g, ' ');
        // Mayúsculas
        s = s.toUpperCase();
        return s;
      }

      // **Descripción de la función normalizeItems**
      // normalizeItems toma las filas devueltas por el backend (como objetos
      // con nombres de columna variables) y las convierte en una matriz
      // puramente posicional:
      // - rows: array de arrays [col0, col1, ...]
      // - columnCount: número de columnas detectadas
      // También intenta eliminar una posible fila de cabeceras repetidas.
      //
      // Parámetros:
      // - rawItems: array de objetos devueltos directamente por el backend.
      //
      // Retorna:
      // - Objeto { rows, columnCount } con filas posicionales.
      function normalizeItems(rawItems) {
        var canonicalToIndex = {};
        var headersByIndex = [];

        // Determinar el conjunto de columnas usando claves canónicas
        (rawItems || []).forEach(function (row) {
          Object.keys(row || {}).forEach(function (key) {
            var trimmedKey = (key || '').trim();
            if (!trimmedKey) {
              return;
            }

            var upper = canonicalizeHeader(trimmedKey);
            if (canonicalToIndex[upper] === undefined) {
              var idx = headersByIndex.length;
              canonicalToIndex[upper] = idx;
              headersByIndex[idx] = trimmedKey;
            }
          });
        });

        var columnCount = headersByIndex.length;

        // Construir matriz posicional
        var rows = (rawItems || []).map(function (row) {
          var arr = new Array(columnCount);
          Object.keys(row || {}).forEach(function (key) {
            var trimmedKey = (key || '').trim();
            if (!trimmedKey) {
              return;
            }
            var upper = canonicalizeHeader(trimmedKey);
            var idx = canonicalToIndex[upper];
            if (idx !== undefined) {
              arr[idx] = row[key];
            }
          });
          return arr;
        });

        // Detectar y eliminar una posible fila de cabeceras duplicadas:
        // si la primera fila contiene principalmente textos idénticos a los
        // nombres de las columnas (ignorando mayúsculas y acentos), se descarta.
        if (rows.length > 0 && columnCount > 0) {
          var firstRow = rows[0];
          var headerMatches = 0;

          for (var i = 0; i < columnCount; i += 1) {
            var headerLabel = headersByIndex[i] || '';
            var headerCanon = canonicalizeHeader(headerLabel);
            var cell = (firstRow[i] || '').toString();
            var cellCanon = canonicalizeHeader(cell);
            if (cellCanon && cellCanon === headerCanon) {
              headerMatches++;
            }
          }

          if (headerMatches >= Math.max(2, Math.floor(columnCount / 2))) {
            rows.shift();
          }
        }

        return {
          rows: rows,
          columnCount: columnCount,
        };
      }

      // **Descripción de la función normalizeBilingualDescription**
      // normalizeBilingualDescription intenta limpiar descripciones que contienen
      // la misma información en dos idiomas (por ejemplo, separadas por " / " o " - ").
      // Se queda con la primera parte, que se asume como la versión deseada
      // (español de España, tras la traducción del backend).
      //
      // Parámetros:
      // - text: cadena original de descripción.
      //
      // Retorna:
      // - Cadena con solo la parte anterior al separador, o el texto original si no hay separador.
      function normalizeBilingualDescription(text) {
        if (!text) {
          return '';
        }

        var cleaned = text;
        var separators = [' / ', ' - ', ' | '];

        separators.forEach(function (sep) {
          if (cleaned.indexOf(sep) !== -1) {
            cleaned = cleaned.split(sep)[0];
          }
        });

        return cleaned;
      }

      // **Descripción de la función buildFinalItems**
      // buildFinalItems aplica las reglas de mayúsculas, normalización de referencias,
      // selección de idioma en descripciones y agrupación de cantidades sobre un listado preliminar.
      //
      // Parámetros:
      // - preliminary: array de objetos con las claves Referencia, Cantidad, Descripcion, Fabricante.
      // - descriptionsForUse: array de strings con las descripciones a utilizar (ya traducidas o no).
      //
      // Retorna:
      // - Array de objetos finales transformados y agrupados.
      function buildFinalItems(preliminary, descriptionsForUse) {
        // Aplicar traducción (o descripciones originales), limpieza de duplicidad
        // de idiomas, mayúsculas y reglas específicas
        var transformed = preliminary.map(function (item, index) {
          var referencia = item.Referencia || '';
          var cantidad = item.Cantidad || '';
          var descripcion =
            (descriptionsForUse && descriptionsForUse[index]) ||
            item.Descripcion ||
            '';
          var fabricante = item.Fabricante || '';

          // Limpiar posibles duplicaciones en dos idiomas dentro de la descripción
          descripcion = normalizeBilingualDescription(descripcion);

          referencia = referencia.toString().toUpperCase().trim();
          descripcion = descripcion.toString().toUpperCase().trim();
          fabricante = fabricante.toString().toUpperCase().trim();

          // Normalización específica de fabricante:
          // - TEE -> SCHNEIDER
          // - SIEMENS AG -> SIEMENS
          if (fabricante === 'TEE') {
            fabricante = 'SCHNEIDER';
          } else if (fabricante === 'SIEMENS AG') {
            fabricante = 'SIEMENS';
          }

          // Eliminar prefijos tipo "SIE. ", "SCH. ", "PI. ", etc. en la referencia
          // (cualquier bloque de 2-6 letras seguido de punto y espacios iniciales).
          referencia = referencia.replace(/^[A-Z]{2,6}\.\s*/, '');

          // Para SIEMENS, eliminar todos los espacios de la referencia
          if (fabricante === 'SIEMENS') {
            referencia = referencia.replace(/\s+/g, '');
          }

          var cantidadNumero = 0;
          if (cantidad !== null && cantidad !== undefined) {
            var cantidadStr = cantidad.toString().replace(',', '.');
            var parsed = parseFloat(cantidadStr);
            if (!isNaN(parsed)) {
              cantidadNumero = parsed;
            }
          }

          return {
            Referencia: referencia,
            Cantidad: cantidadNumero,
            Descripcion: descripcion,
            Fabricante: fabricante,
          };
        });

        // Agrupar por referencia y fabricante sumando cantidades
        var groupedMap = {};

        transformed.forEach(function (item) {
          var key = item.Referencia + '|' + item.Fabricante;

          if (!groupedMap[key]) {
            groupedMap[key] = {
              Referencia: item.Referencia,
              Cantidad: 0,
              Descripcion: item.Descripcion,
              Fabricante: item.Fabricante,
            };
          }

          groupedMap[key].Cantidad += item.Cantidad || 0;
        });

        // Convertir el mapa a array y ordenar por referencia
        return Object.keys(groupedMap)
          .sort()
          .map(function (key) {
            return groupedMap[key];
          });
      }
    },
  ]);
})();

