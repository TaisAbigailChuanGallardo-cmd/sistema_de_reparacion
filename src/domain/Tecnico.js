import { Entidad } from './base/Entidad.js';
import { ErrorReglaNegocio } from './base/ErrorReglaNegocio.js';
import { ESTADOS_ACTIVOS_ORDEN } from './base/vocabulario.js';

/**
 * Tecnico
 *
 * Responsabilidad: "Asigna y registra el diagnostico y las actividades de
 * reparacion" (seccion 3). Atiende ordenes.
 *
 * Multiplicidad: Tecnico 1 -> 0..* OrdenServicio
 *
 * El codigo correlativo (TEC-0001) lo asigna el trigger trg_tecnico_codigo_bi.
 */
export class Tecnico extends Entidad {
  static TABLA = 'tecnico';

  static CAMPOS = {
    id_tecnico:   { tipo: 'entero',  soloLectura: true },
    codigo:       { tipo: 'texto',   soloLectura: true },
    nombre:       { tipo: 'texto',   requerido: true },
    especialidad: { tipo: 'texto',   requerido: true },
    telefono:     { tipo: 'texto' },
    email:        { tipo: 'texto' },
    activo:       { tipo: 'booleano', soloLectura: true, porDefecto: 1 },
    created_at:   { tipo: 'datetime', soloLectura: true },
    updated_at:   { tipo: 'datetime', soloLectura: true },
  };

  static ETIQUETAS = {
    nombre: 'nombre del tecnico',
    especialidad: 'especialidad',
    telefono: 'telefono',
    email: 'correo electronico',
  };

  /** Datos de la carga de trabajo que la RN-07 necesita para evaluar. */
  static CAMPOS_CARGA = ['ordenes_activas', 'maximo_permitido'];

  /**
   * registrar() - alta de un tecnico.
   * @param {object} datos
   * @returns {Tecnico}
   */
  static registrar(datos) {
    const tecnico = new Tecnico(datos);
    const email = tecnico.obtener('email');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      throw new ErrorReglaNegocio('El correo electronico no tiene un formato valido', 'validacion');
    }
    return tecnico;
  }

  /**
   * asignarOrden() - asigna una orden al tecnico.
   * La RN-07 no se comprueba aqui: la autoridad es el trigger, que conoce el
   * limite configurado en la tabla `parametro`. Este metodo solo valida que
   * la orden exista en el modelo y prepara el cambio.
   * @param {import('./OrdenServicio.js').OrdenServicio} orden
   */
  asignarOrden(orden) {
    if (!orden) {
      throw new ErrorReglaNegocio('Se requiere una orden valida para asignarla', 'validacion');
    }
    if (!this.obtener('activo')) {
      throw new ErrorReglaNegocio('No se puede asignar ordenes a un tecnico inactivo', 'validacion');
    }
    orden.asignar('id_tecnico', this.obtener('id_tecnico'));
    return orden;
  }

  /**
   * Indica si una orden cuenta dentro de la carga activa del tecnico (RN-07).
   * @param {object} orden Fila con la columna `estado`.
   */
  static cuentaComoActiva(orden) {
    return ESTADOS_ACTIVOS_ORDEN.includes(orden?.estado);
  }
}
