import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { desdeErrorMysql, ErrorReglaNegocio } from '../domain/index.js';

const DIRECTORIO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'database',
);

/**
 * Conector sin base de datos seleccionada, necesario para ejecutar
 * CREATE DATABASE en 01_schema.sql.
 */
function crearConexion() {
  return mysql.createConnection({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    multipleStatements: false,
    charset: 'utf8mb4',
  });
}

/**
 * Convierte un archivo .sql en una lista de sentencias.
 *
 * MySQL no entiende la directiva DELIMITER: es una instruccion del cliente
 * (mysql, Workbench) que permite escribir cuerpos de trigger y procedure con
 * varios puntos y coma. Como aqui los archivos se ejecutan por el driver,
 * se emula ese comportamiento: se separa por el delimitador vigente, que
 * cambia de ";" a "$$" dentro de los bloques y vuelve a ";" al terminar.
 *
 * @param {string} contenido
 * @returns {string[]}
 */
export function dividirSentencias(contenido) {
  const delimitadorPorDefecto = ';';
  const sentencias = [];
  let delimitador = delimitadorPorDefecto;
  let acumulado = '';

  const cerrarAcumulado = () => {
    let texto = acumulado.trim();
    acumulado = '';

    // La directiva DELIMITER no existe para el servidor: el "$$" que cierra
    // un trigger es solo una marca para el cliente, asi que se quita.
    if (delimitador && texto.endsWith(delimitador)) {
      texto = texto.slice(0, texto.length - delimitador.length).trim();
    }

    if (texto) sentencias.push(texto);
  };

  for (const linea of contenido.split(/\r?\n/)) {
    const texto = linea.trim();

    const cambio = texto.match(/^DELIMITER\s+(\S+)$/i);
    if (cambio) {
      cerrarAcumulado();
      delimitador = cambio[1];
      continue;
    }

    acumulado += `${linea}\n`;

    if (texto.endsWith(delimitador)) {
      cerrarAcumulado();
    }
  }
  cerrarAcumulado();

  return sentencias.filter((sentencia) => tieneCodigo(sentencia));
}

/** Indica si el fragmento contiene algo mas que comentarios y blancos. */
function tieneCodigo(fragmento) {
  return fragmento
    .split(/\r?\n/)
    .filter((linea) => !linea.trim().startsWith('--'))
    .join('')
    .trim().length > 0;
}

/**
 * Ejecuta un archivo .sql sentencia por sentencia.
 * @param {import('mysql2/promise').Connection} conexion
 * @param {string} ruta
 */
async function ejecutarArchivo(conexion, ruta) {
  const contenido = await readFile(ruta, 'utf8');
  const sentencias = dividirSentencias(contenido);

  for (const sentencia of sentencias) {
    try {
      await conexion.query(sentencia);
    } catch (errorOriginal) {
      throw conContexto(ruta, sentencia, desdeErrorMysql(errorOriginal));
    }
  }
  return sentencias.length;
}

/**
 * Anade al error el archivo y la sentencia que lo provoked. Sin esto, un fallo
 * de FK o de sintaxis solo informa el mensaje de MariaDB y no se sabe que
 * fila del seed lo causo.
 */
function conContexto(ruta, sentencia, error) {
  const resumen = sentencia.replace(/\s+/g, ' ').trim();
  const extracto = resumen.length > 160 ? `${resumen.slice(0, 160)}...` : resumen;
  const contexto = `${path.basename(ruta)} -> ${extracto}`;

  if (error instanceof ErrorReglaNegocio) {
    return new ErrorReglaNegocio(`${error.message}\n  en: ${contexto}`, error.regla);
  }
  return new Error(`${error.message}\n  en: ${contexto}`, { cause: error });
}

/**
 * Aplica el esquema completo.
 * @param {object} opciones
 * @param {boolean} opciones.reset    Borra la base antes de reconstruirla.
 * @param {boolean} opciones.conSeed  Carga tambien los datos de prueba.
 */
export async function migrar({ reset = false, conSeed = false } = {}) {
  const conexion = await crearConexion();
  const resumen = [];

  try {
    if (reset) {
      await conexion.query(
        'DROP DATABASE IF EXISTS `taller_reparacion`',
      );
      console.log('  Base de datos anterior eliminada.');
    }

    const archivos = (await readdir(DIRECTORIO))
      .filter((nombre) => nombre.endsWith('.sql'))
      .sort();

    for (const archivo of archivos) {
      if (!conSeed && archivo.includes('seed')) continue;

      const ruta = path.join(DIRECTORIO, archivo);
      const cantidad = await ejecutarArchivo(conexion, ruta);
      resumen.push({ archivo, cantidad });
      console.log(`  ${archivo.padEnd(18)} ${String(cantidad).padStart(3)} sentencias`);
    }
  } catch (error) {
    throw error;
  } finally {
    await conexion.end();
  }

  return resumen;
}

// Permite ejecutar el script directamente: node src/db/migrate.js [--reset] [--seed]
const esEjecucionDirecta = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (esEjecucionDirecta) {
  const reset = process.argv.includes('--reset');
  const conSeed = process.argv.includes('--seed');

  console.log('Aplicando el esquema del sistema de gestion de reparacion...');
  migrar({ reset, conSeed })
    .then(() => console.log('Esquema aplicado correctamente.'))
    .catch((error) => {
      console.error(`\nFallo la migracion: ${error.message}`);
      process.exitCode = 1;
    });
}
