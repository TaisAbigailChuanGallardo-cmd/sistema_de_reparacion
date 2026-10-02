import { Entidad } from './base/Entidad.js';
import { ErrorReglaNegocio } from './base/ErrorReglaNegocio.js';
import { PERIODICIDAD_PLAN, TIPO_SUSCRIPCION } from './base/vocabulario.js';

/**
 * Rol
 *
 * CatÃ¡logo de seguridad. Un usuario tiene exactamente un rol, y el rol
 * determina a que modulos accede. */
export class Rol extends Entidad {
  static TABLA = 'rol';

  static CAMPOS = {
    id_rol:      { tipo: 'entero', soloLectura: true },
    nombre:      { tipo: 'texto',  requerido: true },
    descripcion: { tipo: 'texto' },
    created_at:  { tipo: 'datetime', soloLectura: true },
  };

  static ETIQUETAS = { nombre: 'nombre del rol' };

  static registrar(datos) {
    return new Rol(datos);
  }
}

/**
 * Usuario
 *
 * Responsabilidad: "Gestiona autenticacion, contrasena, rol y estado"
 * (seccion 3). Es la cuenta que operara el sistema.
 *
 * La contrasena nunca se almacena en claro: se guarda el hash bcrypt
 * (RNF-02, acceso controlado a los datos). El hash se excluye de
 * aParametros() para que ningun repositorio pueda escribirlo por descuido.
 */
export class Usuario extends Entidad {
  static TABLA = 'usuario';

  static CAMPOS = {
    id_usuario:    { tipo: 'entero',    soloLectura: true },
    nombre:        { tipo: 'texto',     requerido: true },
    email:         { tipo: 'texto',     requerido: true },
    password_hash: { tipo: 'texto',     requerido: true },
    telefono:      { tipo: 'texto' },
    id_rol:        { tipo: 'entero',    requerido: true },
    estado:        { tipo: 'texto',     soloLectura: true, porDefecto: 'ACTIVO' },
    ultimo_acceso: { tipo: 'datetime', soloLectura: true },
    created_at:    { tipo: 'datetime', soloLectura: true },
    updated_at:    { tipo: 'datetime', soloLectura: true },
  };

  static ETIQUETAS = {
    nombre: 'nombre',
    email: 'correo electronico',
    telefono: 'telefono',
    id_rol: 'rol',
  };

  /**
   * registrar() - crea la cuenta.
   * @param {object} datos
   * @returns {Usuario}
   */
  static registrar(datos) {
    const usuario = new Usuario(datos);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(usuario.obtener('email'))) {
      throw new ErrorReglaNegocio('El correo electronico no tiene un formato valido', 'validacion');
    }
    if (!usuario.obtener('password_hash')) {
      throw new ErrorReglaNegocio('La contrasena es obligatoria', 'validacion');
    }
    return usuario;
  }

  /**
   * El hash jamas sale del servidor en una respuesta HTTP.
   * @returns {object}
   */
  toJSON() {
    const { password_hash, ...visible } = this.aObjeto();
    return visible;
  }

  /** Bloquea el acceso sin borrar su historial de operaciones. */
  bloquear() {
    this._fijar('estado', 'BLOQUEADO');
    return this;
  }
}

/**
 * Plan
 *
 * Responsabilidad: "Define las caracteristicas del plan de servicio".
 * Multiplicidad: Suscripcion 0..* -> 1 Plan
 */
export class Plan extends Entidad {
  static TABLA = 'plan';

  static CAMPOS = {
    id_plan:      { tipo: 'entero', soloLectura: true },
    nombre:       { tipo: 'texto',  requerido: true },
    descripcion:  { tipo: 'texto' },
    precio:       { tipo: 'decimal', porDefecto: 0 },
    periodicidad: { tipo: 'texto',  dominio: Object.values(PERIODICIDAD_PLAN), porDefecto: PERIODICIDAD_PLAN.MENSUAL },
    activo:       { tipo: 'booleano', soloLectura: true, porDefecto: 1 },
    created_at:   { tipo: 'datetime', soloLectura: true },
  };

  static ETIQUETAS = {
    nombre: 'nombre del plan',
    precio: 'precio',
    periodicidad: 'periodicidad',
  };

  static registrar(datos) {
    const plan = new Plan(datos);
    if (plan.obtener('precio') < 0) {
      throw new ErrorReglaNegocio('El precio del plan no puede ser negativo', 'validacion');
    }
    return plan;
  }
}

/**
 * Suscripcion
 *
 * Responsabilidad: "Gestiona el plan, beneficios y vigencia de la suscripcion".
 * Multiplicidad: Usuario 1 -> 0..* Suscripcion
 */
export class Suscripcion extends Entidad {
  static TABLA = 'suscripcion';

  static CAMPOS = {
    id_suscripcion: { tipo: 'entero', soloLectura: true },
    id_usuario:     { tipo: 'entero', requerido: true },
    id_plan:        { tipo: 'entero', requerido: true },
    fecha_inicio:   { tipo: 'fecha', requerido: true },
    fecha_fin:      { tipo: 'fecha' },
    monto:          { tipo: 'decimal', porDefecto: 0 },
    estado:         { tipo: 'texto', soloLectura: true, porDefecto: TIPO_SUSCRIPCION.ACTIVA },
    created_at:     { tipo: 'datetime', soloLectura: true },
  };

  static ETIQUETAS = {
    id_usuario: 'usuario',
    id_plan: 'plan',
    fecha_inicio: 'fecha de inicio',
    fecha_fin: 'fecha de fin',
  };

  /**
   * registrar() - contrata un plan para un usuario.
   * @param {object} datos
   * @returns {Suscripcion}
   */
  static registrar(datos) {
    const suscripcion = new Suscripcion(datos);
    const inicio = suscripcion.obtener('fecha_inicio');
    const fin = suscripcion.obtener('fecha_fin');

    if (fin && new Date(fin) < new Date(inicio)) {
      throw new ErrorReglaNegocio(
        'La fecha de fin no puede ser anterior a la fecha de inicio',
        'validacion',
      );
    }
    return suscripcion;
  }

  /** Indica si la suscripcion sigue vigente hoy. */
  get vigente() {
    if (this.obtener('estado') !== TIPO_SUSCRIPCION.ACTIVA) return false;
    const hoy = new Date().toISOString().slice(0, 10);
    const fin = this.obtener('fecha_fin');
    return !fin || fin >= hoy;
  }
}
