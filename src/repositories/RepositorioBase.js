import { consultar, ejecutar } from '../db/pool.js';
import { ErrorReglaNegocio } from '../domain/index.js';

/**
 * RepositorioBase
 *
 * Implementa el CRUD comun a todas las entidades a partir de la declaracion
 * CAMPOS de cada clase de dominio. Todas las columnas se validan contra esa
 * declaracion antes de entrar en el SQL, de modo que ningun nombre de columna
 * proviene de la peticion del usuario: es la unica forma de garantizar que
 * no se pueda inyectar SQL por el nombre de un campo.
 */
export class RepositorioBase {
  /** @type {import('../domain/index.js').Entidad} */
  static entidad = null;

  constructor() {
    this.entidad = this.constructor.entidad;
    if (!this.entidad) throw new Error(`${this.constructor.name} no declara su entidad`);
  }

  get tabla() {
    return this.constructor.entidad.TABLA;
  }

  get clavePrimaria() {
    return Object.keys(this.constructor.entidad.CAMPOS).find((c) => c.startsWith('id_'));
  }

  /** Convierte una fila de MySQL en una instancia de la entidad. */
  hidratar(fila) {
    return new this.entidad(fila);
  }

  /**
   * Descarta cualquier clave que no pertenezca a la entidad.
   * @param {object} datos
   * @returns {string[]}
   */
  columnasValidas(datos) {
    const validas = Object.keys(this.constructor.entidad.CAMPOS);
    return Object.keys(datos).filter((columna) => validas.includes(columna));
  }

  /**
   * Verifica que un valor de ordenamiento sea una columna real, para que no
   * se pueda pasar por ahi una expresion arbitraria.
   * @param {string|null} columna
   * @param {string} porDefecto
   * @param {string} direccion "ASC" | "DESC"
   */
  columnaOrden(columna, porDefecto, direccion = 'DESC') {
    if (!columna) return porDefecto;
    if (!this.columnasValidas({ [columna]: 1 }).length) {
      throw new ErrorReglaNegocio(`No se puede ordenar por "${columna}"`, 'validacion');
    }
    const sentido = String(direccion).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    return `\`${columna}\` ${sentido}`;
  }

  /**
   * Lista registros con filtros de igualdad, orden y paginacion.
   * @param {object} opciones
   */
  async listar({ filtros = {}, orden = null, direccion = 'DESC', limite = 50, desplazamiento = 0 } = {}) {
    const condiciones = [];
    const parametros = [];

    for (const [columna, valor] of Object.entries(filtros)) {
      if (valor === undefined || valor === null) continue;
      if (!this.columnasValidas({ [columna]: 1 }).length) continue;
      condiciones.push(`\`${columna}\` = ?`);
      parametros.push(valor);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const clause = this.columnaOrden(orden, `\`${this.clavePrimaria}\` DESC`, direccion);
    const maximo = Math.min(Number(limite) || 50, 500);
    const salto = Math.max(Number(desplazamiento) || 0, 0);

    const sql = `SELECT * FROM \`${this.tabla}\` ${where}
                 ORDER BY ${clause} LIMIT ? OFFSET ?`;
    parametros.push(maximo, salto);

    const filas = await consultar(sql, parametros);
    return filas.map((fila) => this.hidratar(fila));
  }

  /** Cuenta registros aplicando los mismos filtros que listar(). */
  async contar({ filtros = {} } = {}) {
    const condiciones = [];
    const parametros = [];

    for (const [columna, valor] of Object.entries(filtros)) {
      if (valor === undefined || valor === null) continue;
      if (!this.columnasValidas({ [columna]: 1 }).length) continue;
      condiciones.push(`\`${columna}\` = ?`);
      parametros.push(valor);
    }
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const [fila] = await consultar(`SELECT COUNT(*) AS total FROM \`${this.tabla}\` ${where}`, parametros);
    return fila.total;
  }

  /** Busca por clave primaria; devuelve null si no existe. */
  async buscarPorId(id) {
    const sql = `SELECT * FROM \`${this.tabla}\` WHERE \`${this.clavePrimaria}\` = ? LIMIT 1`;
    const filas = await consultar(sql, [id]);
    return filas.length ? this.hidratar(filas[0]) : null;
  }

  /** Inserta una entidad y devuelve la instancia con su id asignado. */
  async crear(entidad) {
    const datos = entidad.aParametros();
    const columnas = Object.keys(datos).filter((c) => datos[c] !== undefined);

    if (!columnas.length) throw new ErrorReglaNegocio('No hay datos para insertar', 'validacion');

    const marcadores = columnas.map(() => '?').join(', ');
    const lista = columnas.map((c) => `\`${c}\``).join(', ');

    const sql = `INSERT INTO \`${this.tabla}\` (${lista}) VALUES (${marcadores})`;
    const resultado = await ejecutar(sql, columnas.map((c) => datos[c]));

    return this.buscarPorId(resultado.insertId);
  }

  /** Actualiza los campos editables de una entidad. */
  async actualizar(entidad) {
    const datos = entidad.aParametros();
    const id = entidad.obtener(this.clavePrimaria);

    const columnas = Object.keys(datos)
      .filter((c) => datos[c] !== undefined && c !== this.clavePrimaria);

    if (!columnas.length) return entidad;

    const asignaciones = columnas.map((c) => `\`${c}\` = ?`).join(', ');
    const sql = `UPDATE \`${this.tabla}\` SET ${asignaciones} WHERE \`${this.clavePrimaria}\` = ?`;

    await ejecutar(sql, [...columnas.map((c) => datos[c]), id]);
    return this.buscarPorId(id);
  }

  /** Elimina el registro; devuelve true si habia algo que borrar. */
  async eliminar(id) {
    const sql = `DELETE FROM \`${this.tabla}\` WHERE \`${this.clavePrimaria}\` = ?`;
    const resultado = await ejecutar(sql, [id]);
    return resultado.affectedRows > 0;
  }
}
