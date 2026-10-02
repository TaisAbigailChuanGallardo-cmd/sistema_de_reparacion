import { Entidad } from './base/Entidad.js';
import { ErrorReglaNegocio } from './base/ErrorReglaNegocio.js';
import { ESTADO_EQUIPO, TIPO_EQUIPO } from './base/vocabulario.js';

/**
 * Equipo
 *
 * Responsabilidad: "Registra las caracteristicas, falla y estado del equipo".
 * Pertenece a un cliente.
 *
 * Multiplicidad: Cliente 1 -> 0..* Equipo ; Equipo 1 -> 0..* OrdenServicio
 */
export class Equipo extends Entidad {
  static TABLA = 'equipo';

  static CAMPOS = {
    id_equipo:             { tipo: 'entero',    soloLectura: true },
    id_cliente:            { tipo: 'entero',    requerido: true },
    tipo:                  { tipo: 'texto',     dominio: Object.values(TIPO_EQUIPO), requerido: true },
    marca:                 { tipo: 'texto',     requerido: true },
    modelo:                { tipo: 'texto',     requerido: true },
    numero_serie:          { tipo: 'texto',     requerido: true },
    color:                 { tipo: 'texto' },
    anio:                  { tipo: 'entero' },
    falla_reportada:       { tipo: 'texto' },
    estado:                { tipo: 'texto',     soloLectura: true, porDefecto: ESTADO_EQUIPO.EN_TALLER },
    accesorios_entregados: { tipo: 'texto' },
    created_at:            { tipo: 'datetime', soloLectura: true },
    updated_at:            { tipo: 'datetime', soloLectura: true },
  };

  static ETIQUETAS = {
    id_cliente: 'cliente propietario',
    tipo: 'tipo de equipo',
    marca: 'marca',
    modelo: 'modelo',
    numero_serie: 'numero de serie',
    falla_reportada: 'falla reportada',
    accesorios_entregados: 'accesorios entregados',
  };

  /**
   * registrar() - da de alta un equipo.
   * @param {object} datos
   * @returns {Equipo}
   */
  static registrar(datos) {
    const equipo = new Equipo(datos);
    equipo.#validarIdentificacion();
    return equipo;
  }

  /**
   * actualizarEstado() - el estado del equipo lo sincroniza el trigger
   * trg_orden_equipo_* a partir del estado de su orden. Este metodo solo
   * cubre la baja definitiva, que es una decision del taller y no del flujo.
   * @param {string} estado
   */
  actualizarEstado(estado) {
    if (estado !== ESTADO_EQUIPO.DE_BAJA) {
      throw new ErrorReglaNegocio(
        'El estado del equipo se deriva del estado de su orden; solo se permite marcar DE_BAJA',
        'validacion',
      );
    }
    this._fijar('estado', estado);
    return this;
  }

  /** Marca o actualiza la falla declarada por el cliente. */
  registrarFalla(falla) {
    if (!falla || !String(falla).trim()) {
      throw new ErrorReglaNegocio('La falla reportada no puede estar vacia', 'validacion');
    }
    this.asignar('falla_reportada', falla);
    return this;
  }

  /** Descripcion para listados: "Samsung Galaxy A54". */
  get descripcion() {
    return `${this.obtener('marca')} ${this.obtener('modelo')}`.trim();
  }

  #validarIdentificacion() {
    const serie = this.obtener('numero_serie');
    if (!/^[0-9A-Za-z-]{4,80}$/.test(serie)) {
      throw new ErrorReglaNegocio(
        'El numero de serie debe tener entre 4 y 80 caracteres alfanumericos',
        'validacion',
      );
    }
    const anio = this.obtener('anio');
    if (anio && (anio < 1990 || anio > 2100)) {
      throw new ErrorReglaNegocio('El anio del equipo debe estar entre 1990 y 2100', 'validacion');
    }
  }
}
