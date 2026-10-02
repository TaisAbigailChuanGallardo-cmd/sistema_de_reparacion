import { ErrorReglaNegocio } from './ErrorReglaNegocio.js';

/**
 * Tipos admitidos en la declaracion de atributos de una entidad.
 * Cada tipo define como se normaliza el valor que llega de MySQL o del body
 * de la peticion, para que el resto del sistema no tenga que repetir la
 * conversion en cada repositorio.
 */
export const Tipos = Object.freeze({
  texto:    { default: () => '' },
  entero:   { default: () => 0, validar: (v) => Number.isInteger(Number(v)) },
  decimal:  { default: () => 0, validar: (v) => Number.isFinite(Number(v)) },
  booleano: { default: () => false },
  fecha:    { default: () => null },
  datetime: { default: () => null },
});

/**
 * Entidad
 *
 * Clase base de todo el dominio. Concentra lo que las 16 clases del modelo
 * comparten: declaracion de atributos con su visibilidad, normalizacion de
 * tipos, validacion de los campos obligatorios y conversion a objeto plano
 * para persistencia o para la respuesta HTTP.
 *
 * La visibilidad declarada en CAMPOS replica la convencion del diagrama
 * UML del documento (+ publico, - privado, # protegido).
 */
export class Entidad {
  /** Nombre de la tabla que la respalda. Lo sobrescribe cada subclase. */
  static TABLA = null;

  /**
   * Declaracion de atributos.
   * { columna: { tipo, requerido, soloLectura, porDefecto, etiqueta } }
   * `soloLectura` marca lo que calcula el sistema y no acepta escritura
   * desde la API (costo_final, saldo, subtotal, stock...).
   */
  static CAMPOS = {};

  /** Etiquetas legibles, usadas para validar y para los mensajes de error. */
  static ETIQUETAS = {};

  /** Valores que se permiten en el dominio; util para ENUM de MySQL. */
  static DOMINIOS = {};

  #datos = Object.create(null);

  constructor(fuente = {}) {
    this.cargar(fuente);
  }

  // ---------------------------------------------------------------------------
  // Acceso a datos
  // ---------------------------------------------------------------------------

  /**
   * Carga un objeto plano en la entidad, normalizando y validando.
   * @param {object} fuente
   */
  cargar(fuente) {
    for (const [columna, definicion] of Object.entries(this.constructor.CAMPOS)) {
      const viene = Object.prototype.hasOwnProperty.call(fuente, columna);
      let valor = viene ? fuente[columna] : definicion.porDefecto;

      if (valor === undefined) valor = Tipos[definicion.tipo].default();
      valor = this.#normalizar(definicion.tipo, valor);

      if (definicion.requerido && (valor === null || valor === '')) {
        throw new ErrorReglaNegocio(
          `El campo "${this.#etiqueta(columna)}" es obligatorio`,
          'validacion',
        );
      }

      if (definicion.dominio && !definicion.dominio.includes(valor)) {
        throw new ErrorReglaNegocio(
          `El campo "${this.#etiqueta(columna)}" admite: ${definicion.dominio.join(', ')}`,
          'validacion',
        );
      }

      this.#datos[columna] = valor;
    }
    return this;
  }

  /**
   * Asigna un atributo respetando soloLectura.
   * Los atributos calculados por la base (costo_final, saldo, subtotal) se
   * ignoran aqui a proposito: la unica fuente de verdad es el trigger.
   */
  asignar(columna, valor) {
    const definicion = this.constructor.CAMPOS[columna];
    if (!definicion) {
      throw new ErrorReglaNegocio(`"${columna}" no es un atributo de ${this.constructor.name}`, 'validacion');
    }
    if (definicion.soloLectura) {
      throw new ErrorReglaNegocio(
        `"${this.#etiqueta(columna)}" es un valor calculado por el sistema y no se puede asignar`,
        'validacion',
      );
    }
    this.#datos[columna] = this.#normalizar(definicion.tipo, valor);
    return this;
  }

  /**
   * Asignacion masiva. Silencia los atributos de soloLectura en lugar de
   * fallar, porque la usara el propio repositorio al leer una fila.
   */
  asignarSiEsEditable(fuente) {
    for (const [columna, valor] of Object.entries(fuente)) {
      const definicion = this.constructor.CAMPOS[columna];
      if (definicion && !definicion.soloLectura) {
        this.#datos[columna] = this.#normalizar(definicion.tipo, valor);
      }
    }
    return this;
  }

  /** Lectura de un atributo. */
  obtener(columna) {
    return this.#datos[columna];
  }

  /**
   * Escritura protegida (# en la convencion del diagrama UML).
   *
   * Los campos privados de JavaScript solo son visibles dentro de la clase que
   * los declara, de modo que las subclases no pueden alcanzar #datos
   * directamente. Este metodo es el punto de entrada autorizado: cada entidad
   * escribe unicamente los atributos que el diagrama declara como privados o
   * protegidos de ella, y no los de sus sisters.
   *
   * @param {string} columna
   * @param {*} valor
   */
  _fijar(columna, valor) {
    this.#datos[columna] = valor;
    return this;
  }

  /** Indica si el atributo tiene valor informado. */
  informado(columna) {
    const valor = this.#datos[columna];
    return valor !== null && valor !== undefined && valor !== '';
  }

  // ---------------------------------------------------------------------------
  // Conversion
  // ---------------------------------------------------------------------------

  /** Objeto plano con todos los atributos, apto para JSON. */
  aObjeto() {
    return { ...this.#datos };
  }

  /**
   * Objeto plano limitado a los atributos editables: es lo que se usa en
   * INSERT y UPDATE, de modo que un cliente no pueda escribir en una
   * columna calculada aunque manipule la peticion.
   */
  aParametros() {
    const salida = {};
    for (const [columna, definicion] of Object.entries(this.constructor.CAMPOS)) {
      if (!definicion.soloLectura) {
        salida[columna] = this.#datos[columna];
      }
    }
    return salida;
  }

  toJSON() {
    return this.aObjeto();
  }

  // ---------------------------------------------------------------------------
  // Apoyo interno
  // ---------------------------------------------------------------------------

  #normalizar(tipo, valor) {
    if (valor === null || valor === undefined || valor === '') {
      return tipo === 'booleano' ? 0 : null;
    }
    switch (tipo) {
      case 'entero':
        return Number.isNaN(Number(valor)) ? null : Math.trunc(Number(valor));
      case 'decimal':
        // MySQL devuelve los DECIMAL como cadena para no perder precision;
        // en el dominio se maneja como numero de dos decimales.
        return Number.isNaN(Number(valor)) ? null : Math.round(Number(valor) * 100) / 100;
      case 'booleano':
        return valor === true || valor === 1 || valor === '1' ? 1 : 0;
      case 'datetime': {
        if (valor instanceof Date) return valor.toISOString().slice(0, 19).replace('T', ' ');
        return String(valor).slice(0, 19).replace('T', ' ');
      }
      case 'fecha': {
        if (valor instanceof Date) return valor.toISOString().slice(0, 10);
        return String(valor).slice(0, 10);
      }
      default:
        return String(valor);
    }
  }

  #etiqueta(columna) {
    return this.constructor.ETIQUETAS[columna] ?? columna;
  }
}
