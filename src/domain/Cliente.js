import { Entidad } from './base/Entidad.js';
import { ErrorReglaNegocio } from './base/ErrorReglaNegocio.js';
import { TIPO_DOCUMENTO } from './base/vocabulario.js';

/**
 * Cliente
 *
 * Responsabilidad: "Gestiona los datos del cliente y su historial"
 * (seccion 3 del documento). Tiene equipos y ordenes.
 *
 * Multiplicidad: Cliente 1 -> 0..* Equipo ; Cliente 1 -> 1..* OrdenServicio
 * (en la practica 0..* : un cliente recien registrado todavia no tiene ordenes).
 */
export class Cliente extends Entidad {
  static TABLA = 'cliente';

  static CAMPOS = {
    id_cliente:       { tipo: 'entero',    soloLectura: true },
    tipo_documento:   { tipo: 'texto',     dominio: Object.values(TIPO_DOCUMENTO), porDefecto: TIPO_DOCUMENTO.DNI },
    numero_documento: { tipo: 'texto',     requerido: true },
    nombre:           { tipo: 'texto',     requerido: true },
    telefono:         { tipo: 'texto',     requerido: true },
    email:            { tipo: 'texto' },
    direccion:        { tipo: 'texto' },
    referencia:       { tipo: 'texto' },
    activo:           { tipo: 'booleano', soloLectura: true, porDefecto: 1 },
    created_at:       { tipo: 'datetime', soloLectura: true },
    updated_at:       { tipo: 'datetime', soloLectura: true },
  };

  static ETIQUETAS = {
    id_cliente: 'identificador del cliente',
    tipo_documento: 'tipo de documento',
    numero_documento: 'numero de documento',
    nombre: 'nombre',
    telefono: 'telefono',
    email: 'correo electronico',
    direccion: 'direccion',
    referencia: 'contacto de referencia',
  };

  /**
   * registrar() - crea y valida un cliente nuevo.
   * @param {object} datos
   * @returns {Cliente}
   */
  static registrar(datos) {
    const cliente = new Cliente(datos);
    cliente.#validarDocumento();
    cliente.#validarContacto();
    return cliente;
  }

  /**
   * actualizarDatos() - aplica los cambios sobre los atributos editables.
   * No permite cambiar la identidad del cliente (tipo y numero de documento),
   * porque esa informacion ya pudo quedar asociada a ordenes y comprobantes.
   * @param {object} cambios
   * @returns {this}
   */
  actualizarDatos(cambios) {
    const { tipo_documento, numero_documento, ...permitidos } = cambios ?? {};

    if (tipo_documento || numero_documento) {
      throw new ErrorReglaNegocio(
        'El tipo y el numero de documento identifican al cliente y no se pueden modificar',
        'validacion',
      );
    }

    Object.entries(permitidos).forEach(([columna, valor]) => {
      if (this.constructor.CAMPOS[columna] && valor !== undefined) {
        this.asignar(columna, valor);
      }
    });

    this.#validarDocumento();
    this.#validarContacto();
    return this;
  }

  /** Marca al cliente como inactivo sin borrar su historial. */
  desactivar() {
    this._fijar('activo', 0);
    return this;
  }

  /**
   * Existe como metodo de dominio con la responsabilidad declarada; la
   * consulta que lo resuelve la implementa ClienteService (historial de
   * equipos y ordenes). Se mantiene aqui para respetar el catalogo de
   * operaciones del documento.
   */
  consultarHistorial() {
    return { id_cliente: this.obtener('id_cliente') };
  }

  /** Nombre corto para mostrar en listados. */
  get nombreCompleto() {
    return this.obtener('nombre');
  }

  #validarDocumento() {
    const numero = this.obtener('numero_documento');
    if (!/^[0-9A-Za-z-]{5,20}$/.test(numero)) {
      throw new ErrorReglaNegocio(
        'El numero de documento debe tener entre 5 y 20 caracteres alfanumericos',
        'validacion',
      );
    }

    // El RUC peruano son 11 digitos; el resto de documentos, de 8 a 12.
    const tipo = this.obtener('tipo_documento');
    const soloDigitos = numero.replace(/\D/g, '');
    if (tipo === TIPO_DOCUMENTO.RUC && soloDigitos.length !== 11) {
      throw new ErrorReglaNegocio('El RUC debe tener 11 digitos', 'validacion');
    }
    if (tipo !== TIPO_DOCUMENTO.RUC && (soloDigitos.length < 8 || soloDigitos.length > 12)) {
      throw new ErrorReglaNegocio('El documento debe tener entre 8 y 12 digitos', 'validacion');
    }
  }

  #validarContacto() {
    const email = this.obtener('email');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      throw new ErrorReglaNegocio('El correo electronico no tiene un formato valido', 'validacion');
    }
  }
}
