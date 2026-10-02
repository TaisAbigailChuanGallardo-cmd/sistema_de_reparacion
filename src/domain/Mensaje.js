import { Entidad } from './base/Entidad.js';
import { ErrorReglaNegocio } from './base/ErrorReglaNegocio.js';
import { TIPO_MENSAJE } from './base/vocabulario.js';

/**
 * Mensaje
 *
 * Responsabilidad: "Gestiona la comunicacion con el cliente" (seccion 3).
 *
 * Multiplicidad: Usuario 1 -> 0..* Mensaje
 *
 * Corresponde al caso de uso "Consultar estado - recibir notificacion" del
 * administrador: cada cambio relevante de una orden deja un mensaje para el
 * cliente, de modo que el seguimiento no dependa de que este llame a preguntar.
 */
export class Mensaje extends Entidad {
  static TABLA = 'mensaje';

  static CAMPOS = {
    id_mensaje:  { tipo: 'entero',    soloLectura: true },
    id_usuario:  { tipo: 'entero',    requerido: true },
    id_cliente:  { tipo: 'entero' },
    id_orden:    { tipo: 'entero' },
    canal:       { tipo: 'texto',     dominio: Object.values(TIPO_MENSAJE), porDefecto: TIPO_MENSAJE.SISTEMA },
    asunto:      { tipo: 'texto',     requerido: true },
    contenido:   { tipo: 'texto',     requerido: true },
    leido:       { tipo: 'booleano', soloLectura: true, porDefecto: 0 },
    fecha_envio: { tipo: 'datetime', soloLectura: true },
  };

  static ETIQUETAS = {
    id_usuario: 'usuario emisor',
    id_cliente: 'cliente destinatario',
    id_orden: 'orden relacionada',
    canal: 'canal',
    asunto: 'asunto',
    contenido: 'contenido',
  };

  /**
   * enviar() - crea un mensaje dirigido al cliente.
   * @param {object} datos
   * @returns {Mensaje}
   */
  static enviar(datos) {
    const mensaje = new Mensaje(datos);

    if (!mensaje.obtener('id_cliente') && !mensaje.obtener('id_orden')) {
      throw new ErrorReglaNegocio(
        'El mensaje debe estar dirigido a un cliente o a una orden',
        'validacion',
      );
    }
    if (String(mensaje.obtener('contenido')).trim().length < 5) {
      throw new ErrorReglaNegocio('El contenido del mensaje es demasiado corto', 'validacion');
    }
    return mensaje;
  }

  /** Marca el mensaje como leido por su destinatario. */
  marcarLeido() {
    this._fijar('leido', 1);
    return this;
  }

  /** Plantilla de notificacion para un cambio de estado de la orden. */
  static plantillaEstado(numeroOrden, estado) {
    const textos = {
      RECIBIDO: `Su equipo fue ingresado al taller con la orden ${numeroOrden}.`,
      EN_DIAGNOSTICO: `Su equipo ${numeroOrden} esta siendo diagnosticado.`,
      PRESUPUESTADO: `El presupuesto de la orden ${numeroOrden} esta listo para su aprobacion.`,
      EN_REPARACION: `Su equipo ${numeroOrden} ya esta en reparacion.`,
      LISTO: `Su equipo ${numeroOrden} salio de taller y esta listo para recoger.`,
      ENTREGADO: `La orden ${numeroOrden} fue entregada. Gracias por su confianza.`,
    };
    return textos[estado] ?? `Su orden ${numeroOrden} cambio de estado a ${estado}.`;
  }
}
