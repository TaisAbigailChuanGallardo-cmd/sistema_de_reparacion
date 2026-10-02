/**
 * Publica los cambios locales en GitHub.
 *
 *   npm run publicar -- "mensaje del commit"
 *   npm run publicar
 *
 * Sin mensaje, el resumen se arma a partir del diff, que para un proyecto de
 * este tamano es mas util que un "actualizaciones" a secas.
 *
 * Deliberadamente NO hace push forzado ni borra historial: si el remoto se
 * movio, el script se detiene y avisa en vez de sobrescribir el trabajo de
 * otra persona.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const correr = promisify(execFile);

const RAMA = 'main';
const REMOTO = 'origin';

/** Ejecuta git y devuelve stdout. Lanza con el mensaje de git si falla. */
async function git(...argumentos) {
  const { stdout } = await correr('git', argumentos, {
    cwd: process.cwd(),
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout.trim();
}

/** Inventario de cambios: lo modificado, lo nuevo y lo borrado. */
async function resumenCambios() {
  const salida = await git('status', '--porcelain');
  if (!salida) return null;

  const grupos = { modificados: 0, nuevos: 0, borrados: 0, renombrados: 0 };
  const rutas = [];

  for (const linea of salida.split('\n')) {
    const codigo = linea.slice(0, 2);
    const ruta = linea.slice(3).trim();
    if (!ruta) continue;

    if (codigo === '??') grupos.nuevos += 1;
    else if (codigo.includes('D')) grupos.borrados += 1;
    else if (codigo.includes('R')) grupos.renombrados += 1;
    else grupos.modificados += 1;

    rutas.push(ruta);
  }

  return { grupos, rutas };
}

/** Cuenta las lineas anadidas y eliminadas del diff ya preparado. */
async function resumenDiff() {
  const num = await git('diff', '--cached', '--numstat');
  let anadidas = 0;
  let eliminadas = 0;

  for (const linea of num.split('\n').filter(Boolean)) {
    const [a, b] = linea.split('\t');
    anadidas += Number(a) || 0;
    eliminadas += Number(b) || 0;
  }
  return { anadidas, eliminadas };
}

/** Primeras rutas tocadas, para que el mensaje sea util. */
function rutasResumen(rutas, maximo = 6) {
  const porCarpeta = new Map();
  for (const ruta of rutas) {
    const carpeta = ruta.includes('/') ? ruta.split('/')[0] : 'raiz';
    porCarpeta.set(carpeta, (porCarpeta.get(carpeta) ?? 0) + 1);
  }
  const partes = [...porCarpeta.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([carpeta, n]) => (n > 1 ? `${carpeta} (${n})` : carpeta));
  const texto = partes.join(', ');
  return partes.length > maximo ? `${texto}...` : texto;
}

/** Arma el mensaje cuando el usuario no lo pasa. */
function mensajePorDefecto(cambios, diff) {
  const { grupos } = cambios;
  const detalles = [];
  if (grupos.nuevos) detalles.push(`${grupos.nuevos} nuevo(s)`);
  if (grupos.modificados) detalles.push(`${grupos.modificados} modificado(s)`);
  if (grupos.borrados) detalles.push(`${grupos.borrados} borrado(s)`);
  if (grupos.renombrados) detalles.push(`${grupos.renombrados} renombrado(s)`);

  const resumen = detalles.length ? detalles.join(', ') : 'sin cambios';
  const lineas = diff.anadidas || diff.eliminadas ? ` (+${diff.anadidas} -${diff.eliminadas})` : '';
  return `Actualiza ${rutasResumen(cambios.rutas)}${lineas} [${resumen}]`;
}

async function main() {
  try {
    await git('rev-parse', '--git-dir');
  } catch {
    console.error('Esta carpeta no es un repositorio de git.');
    process.exitCode = 1;
    return;
  }

  const cambios = await resumenCambios();
  if (!cambios) {
    console.log('No hay cambios locales. Nada que publicar.');
    return;
  }

  console.log('Cambios detectados:');
  console.log(`  nuevos      : ${cambios.grupos.nuevos}`);
  console.log(`  modificados : ${cambios.grupos.modificados}`);
  console.log(`  borrados    : ${cambios.grupos.borrados}`);
  console.log('');

  const mensaje = process.argv.slice(2).join(' ').trim() || null;

  await git('add', '-A');
  const diff = await resumenDiff();

  const texto = mensaje ?? mensajePorDefecto(cambios, diff);
  console.log(`Commit: ${texto}`);
  await git('commit', '-m', texto);

  // No se fuerza el push nunca: si el remoto tiene commits que este clon no
  // tiene, sobrescribirlos seria perder trabajo. Se intenta el push y, si el
  // remoto se movio, se explica que hacer.
  try {
    await git('push', '-u', REMOTO, `HEAD:${RAMA}`);
  } catch (error) {
    const detalle = error.stderr?.trim() ?? '';
    const desincronizado = /non-fast-forward|fetch first|rejected/i.test(detalle);

    console.error('');
    if (desincronizado) {
      console.error('El remoto tiene commits que este clon no tiene.');
      console.error('Trae esos cambios y vuelve a publicar:');
      console.error(`  git pull --rebase ${REMOTO} ${RAMA}`);
      console.error(`  npm run publicar -- "${texto}"`);
    } else {
      console.error(`No se pudo subir: ${detalle || error.message}`);
      if (/could not read Username|Authentication failed/i.test(detalle)) {
        console.error('Probablemente falte iniciar sesion: gh auth login');
      }
    }
    process.exitCode = 1;
    return;
  }

  const hash = await git('rev-parse', '--short', 'HEAD');
  console.log('');
  console.log(`Publicado ${hash} en ${REMOTO}/${RAMA}`);
}

main().catch((error) => {
  console.error(`\nFallo la publicacion: ${error.stderr?.trim() || error.message}`);
  process.exitCode = 1;
});