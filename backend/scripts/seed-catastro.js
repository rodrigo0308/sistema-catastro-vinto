/**
 * Seed de datos catastrales - Sprint 5
 *
 * 1. Carga los polígonos de bloques/mausoleos desde Datos/cementerio_vinto.geojson
 *    en la tabla espacial predio_nicho (EPSG:4326). El KML original viene en 3D
 *    (lon, lat, altitud), por eso se aplica ST_Force2D antes de guardar.
 * 2. Carga SOLO los nichos de BLOQUE 5-B (4 filas x 8 columnas) según la hoja
 *    "Hoja1" de Datos/CEMENTERIO NICHOS ULTIMO.xlsx.
 *
 * Uso:  node scripts/seed-catastro.js
 *
 * Es idempotente: los predios se actualizan por codigo_lote y los nichos del
 * bloque se recrean en cada ejecución.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DB = {
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5433),
  user: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'supersecretpassword',
  database: process.env.DB_NAME ?? 'catastro_vinto',
};

const GEOJSON_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'Datos',
  'cementerio_vinto.geojson',
);

/** El KML solo trae "bloque 5": ese polígono representa al BLOQUE 5-B del Excel. */
const POLIGONO_BLOQUE_5B = 'bloque 5';
const CODIGO_BLOQUE_5B = 'Bloque 5-B';

/** Convierte "bloque 12" -> "Bloque 12" y "bloque 5" -> "Bloque 5-B". */
function normalizarCodigo(nombre) {
  const texto = String(nombre ?? '').trim();
  const numero = texto.match(/(\d+)/);
  if (!numero) {
    return texto;
  }
  if (texto.toLowerCase() === POLIGONO_BLOQUE_5B) {
    return CODIGO_BLOQUE_5B;
  }
  return `Bloque ${Number(numero[1])}`;
}

/**
 * Matriz 4x8 del BLOQUE 5-B extraída de "CEMENTERIO NICHOS ULTIMO.xlsx".
 * Cada posición del arreglo es un nicho: [fila, columna, estado, difunto,
 * apellido, solicitante, resolucion].
 */
const NICHOS_BLOQUE_5B = [
  // Fila 1
  [1, 1, 'Ocupado', 'ARMINDA BARRIONUEVO LUIZAGA', 'BARRIONUEVO LUIZAGA', 'ALEX SANDER MERIDA BARRIO NUEVO', null],
  [1, 2, 'Ocupado', 'SANTUSA YAURIPARA QUISPE', 'YAURIPARA QUISPE', 'VALENTINA QUISPE CONDORI DE YAURIPARA', null],
  [1, 3, 'Libre', null, null, null, null],
  [1, 4, 'Libre', null, null, null, null],
  [1, 5, 'Libre', null, null, null, null],
  [1, 6, 'Libre', null, null, null, null],
  [1, 7, 'Ocupado', 'MARINA PADILLA VARGAS', 'PADILLA VARGAS', null, null],
  [1, 8, 'Libre', null, null, null, null],
  // Fila 2
  [2, 1, 'Ocupado', null, null, 'MIGUELINA TRUJILLO VALENCIA', 'RA. 15/2021'],
  [2, 2, 'Ocupado', 'ANTONIO CHAVEZ JIMENEZ', 'CHAVEZ JIMENEZ', 'RUTH SONIA VELARDE RICALDI', 'RA 18/2020'],
  [2, 3, 'Ocupado', 'FERMINA VELIZ MAMANI', 'VELIZ MAMANI', 'VICTORIA CELIA CALANI VELIZ', 'RA. 38/2020'],
  [2, 4, 'Ocupado', null, null, 'ROSA SAN MIGUEL ZUBIETA', 'RA. 39/2020'],
  [2, 5, 'Ocupado', null, null, 'EDGAR CONDORI AROJA', 'RA. 16/2020'],
  [2, 6, 'Ocupado', 'PEDRO TRIVEÑO CHAMBI', 'TRIVEÑO CHAMBI', 'JUAN CARLOS TRIVEÑO TORRICO', 'RA. 19/2020'],
  [2, 7, 'Ocupado', 'ELIAS CHARCA QUISPE', 'CHARCA QUISPE', 'LILIAN ROSARIO CHARCAS CONDORI', 'RA. 17/2020'],
  [2, 8, 'Ocupado', 'NESTOR ALMARAZ QUIROZ', 'ALMARAZ QUIROZ', 'RUBEN ALBERTO ALMARAZ', 'RA. 24/2020'],
  // Fila 3
  [3, 1, 'Ocupado', 'JUAN AGUILAR NIETO', 'AGUILAR NIETO', 'RENE FERNANDEZ ALBERTO', 'RA. 41/2020'],
  [3, 2, 'Ocupado', null, null, 'AYDA DEYSI HUARACHI FLORES', 'RA. 10/2020'],
  [3, 3, 'Ocupado', null, null, 'ELIZABETH LLANOS EULATE', 'RA. 11/2020'],
  [3, 4, 'Ocupado', 'TRACY BERNAL SOZA', 'BERNAL SOZA', 'ROMULO RAUL BERNAL QUIROZ', 'RA. 13/2020'],
  [3, 5, 'Mora', 'DAVID PEDRO ENRIQUEZ AGREDA', 'ENRIQUEZ AGREDA', 'ADALID ENRIQUEZ AGREDA', 'RA. 21/2020'],
  [3, 6, 'Ocupado', 'DENNIS VILLEGAS PAREDES', 'VILLEGAS PAREDES', 'FLORENCIA PAREDES', 'RA. 23/2020'],
  [3, 7, 'Ocupado', 'VICTOR HUGO MURGA VARGAS', 'MURGA VARGAS', null, null],
  [3, 8, 'Libre', null, null, null, null],
  // Fila 4
  [4, 1, 'Libre', null, null, null, null],
  [4, 2, 'Libre', null, null, null, null],
  [4, 3, 'Ocupado', 'ALBERTO ZERDA DOMINGUEZ', 'ZERDA DOMINGUEZ', 'JUAN ZERDA PEÑALOZA', null],
  [4, 4, 'Libre', null, null, null, null],
  [4, 5, 'Libre', null, null, null, null],
  [4, 6, 'Libre', null, null, null, null],
  [4, 7, 'Libre', null, null, null, null],
  [4, 8, 'Libre', null, null, null, null],
];

/** Crea la tabla nichos si el backend todavía no la generó con synchronize. */
async function asegurarTablaNichos(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS nichos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      predio_id uuid NOT NULL REFERENCES predio_nicho(id) ON DELETE CASCADE,
      fila integer NOT NULL,
      columna integer NOT NULL,
      nombre_difunto varchar(255),
      apellido_difunto varchar(255),
      solicitante varchar(255),
      resolucion varchar(100),
      estado varchar(20) NOT NULL DEFAULT 'Libre',
      CONSTRAINT uq_nicho_posicion UNIQUE (predio_id, fila, columna)
    )
  `);
}

async function cargarBloques(client) {
  const geojson = JSON.parse(fs.readFileSync(GEOJSON_PATH, 'utf8'));
  let insertados = 0;

  for (const feature of geojson.features) {
    const nombre = feature?.properties?.name;
    if (!nombre || !feature.geometry) {
      continue;
    }
    // El primer polígono es el perímetro del cementerio, no un bloque.
    if (nombre.trim().toLowerCase() === 'cementerio de vinto') {
      continue;
    }

    const codigo = normalizarCodigo(nombre);
    await client.query(
      `INSERT INTO predio_nicho (codigo_lote, estado, poligono)
       VALUES ($1, 'Libre', ST_SetSRID(ST_Force2D(ST_GeomFromGeoJSON($2)), 4326))
       ON CONFLICT (codigo_lote)
       DO UPDATE SET poligono = EXCLUDED.poligono`,
      [codigo, JSON.stringify(feature.geometry)],
    );
    insertados += 1;
  }

  return insertados;
}

async function cargarNichosBloque5B(client) {
  const { rows } = await client.query(
    'SELECT id FROM predio_nicho WHERE codigo_lote = $1',
    [CODIGO_BLOQUE_5B],
  );

  if (rows.length === 0) {
    throw new Error(
      `No se encontró el predio "${CODIGO_BLOQUE_5B}". ¿El GeoJSON contiene "bloque 5"?`,
    );
  }

  const predioId = rows[0].id;
  await client.query('DELETE FROM nichos WHERE predio_id = $1', [predioId]);

  for (const [
    fila,
    columna,
    estado,
    nombre,
    apellido,
    solicitante,
    resolucion,
  ] of NICHOS_BLOQUE_5B) {
    await client.query(
      `INSERT INTO nichos
         (predio_id, fila, columna, nombre_difunto, apellido_difunto, solicitante, resolucion, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [predioId, fila, columna, nombre, apellido, solicitante, resolucion, estado],
    );
  }

  return NICHOS_BLOQUE_5B.length;
}

async function main() {
  const client = new Client(DB);
  await client.connect();

  try {
    await asegurarTablaNichos(client);
    const bloques = await cargarBloques(client);
    const nichos = await cargarNichosBloque5B(client);
    console.log(`Predios cargados/actualizados: ${bloques}`);
    console.log(`Nichos de ${CODIGO_BLOQUE_5B} cargados: ${nichos}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Error en el seed:', error);
  process.exit(1);
});
