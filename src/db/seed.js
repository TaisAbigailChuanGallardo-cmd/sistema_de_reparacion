import { migrar } from './migrate.js';

/**
 * Carga los datos de prueba.
 *
 * Es un envoltorio de migrar() con conSeed activo, para que el comando
 * `npm run db:seed` tenga un punto de entrada propio y no tenga que conocer
 * los parametros del migrador.
 */
export function sembrar({ reset = false } = {}) {
  return migrar({ reset, conSeed: true });
}

const esEjecucionDirecta = process.argv[1]
  && process.argv[1].replace(/\\/g, '/').endsWith('src/db/seed.js');

if (esEjecucionDirecta) {
  const reset = process.argv.includes('--reset');
  console.log('Cargando datos de prueba...');
  sembrar({ reset })
    .then(() => console.log('Datos de prueba cargados.'))
    .catch((error) => {
      console.error(`\nFallo la carga: ${error.message}`);
      process.exitCode = 1;
    });
}
