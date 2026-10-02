import { consultar, ejecutar, enTransaccion } from '../db/pool.js';
import { repos, indicadores } from '../repositories/index.js';
import {
  Cliente,
  ComprobantePago,
  DetalleServicio,
  Equipo,
  ESTADO_ORDEN,
  ErrorReglaNegocio,
  Mensaje,
  MovimientoEconomico,
  OrdenServicio,
  Pago,
  Proveedor,
  Repuesto,
  Tecnico,
  TIPO_COMPROBANTE,
} from '../domain/index.js';

/**
 * ClienteService
 * Orquesta el caso de uso "Registrar datos, consultar historial" (RF-01, RF-09).
 */
export class ClienteService {
  static async registrar(datos) {
    const cliente = Cliente.registrar(datos);
    return repos.cliente.crear(cliente);
  }

  static async actualizar(id, cambios) {
    const cliente = await repos.cliente.buscarPorId(id);
    if (!cliente) throw new ErrorReglaNegocio('Cliente no encontrado', 'validacion');

    cliente.actualizarDatos(cambios);
    return repos.cliente.actualizar(cliente);
  }

  static listar(opciones) { return repos.cliente.listar(opciones); }
  static buscar(texto, limite) { return repos.cliente.buscar(texto, limite); }
  static async obtener(id) {
    const cliente = await repos.cliente.buscarPorId(id);
    if (!cliente) throw new ErrorReglaNegocio('Cliente no encontrado', 'validacion');
    return cliente;
  }

  /** RF-09: historial de servicios del cliente con sus equipos. */
  static async historial(id) {
    await ClienteService.obtener(id);
    const [ordenes, equipos] = await Promise.all([
      repos.cliente.consultarHistorial(id),
      repos.equipo.porCliente(id),
    ]);
    return { ordenes, equipos };
  }
}

/**
 * EquipoService
 * Casos de uso RF-02 (registro con su falla) y RF-05 (seguimiento de estado).
 */
export class EquipoService {
  static async registrar(datos) {
    const equipo = Equipo.registrar(datos);
    const existe = await repos.cliente.buscarPorId(equipo.obtener('id_cliente'));
    if (!existe) throw new ErrorReglaNegocio('El cliente indicado no existe', 'validacion');
    return repos.equipo.crear(equipo);
  }

  static async actualizar(id, cambios) {
    const equipo = await repos.equipo.buscarPorId(id);
    if (!equipo) throw new ErrorReglaNegocio('Equipo no encontrado', 'validacion');

    // id_cliente no se cambia: el equipo pertenece al cliente que lo registro.
    const { id_cliente, estado, ...permitidos } = cambios;
    Object.entries(permitidos).forEach(([k, v]) => {
      if (v !== undefined && Equipo.CAMPOS[k] && !Equipo.CAMPOS[k].soloLectura) {
        equipo.asignar(k, v);
      }
    });
    if (estado) equipo.actualizarEstado(estado);
    return repos.equipo.actualizar(equipo);
  }

  static listar(opciones) { return repos.equipo.listar(opciones); }
  static buscar(texto, limite) { return repos.equipo.buscar(texto, limite); }

  static async obtener(id) {
    const equipo = await repos.equipo.buscarPorId(id);
    if (!equipo) throw new ErrorReglaNegocio('Equipo no encontrado', 'validacion');
    return equipo;
  }
}

/**
 * OrdenServicioService
 * Nucleo operativo del taller. Cubre RF-03 a RF-07 y coordina el flujo
 * recepcion - diagnostico - presupuesto - reparacion - pago - entrega.
 */
export class OrdenServicioService {
  /**
   * Abre una orden de servicio (RF-03) en estado RECIBIDO.
   * El numero unico lo asigna el trigger; aqui solo se valida el contexto.
   */
  static async registrar(datos) {
    // RN-01: se verifica la pertenencia para dar un mensaje claro antes de
    // que llegue al trigger.
    const equipo = await repos.equipo.buscarPorId(datos.id_equipo);
    if (!equipo) throw new ErrorReglaNegocio('El equipo indicado no existe', 'validacion');

    if (equipo.obtener('id_cliente') !== Number(datos.id_cliente)) {
      throw new ErrorReglaNegocio(
        'RN-01: el equipo no pertenece al cliente indicado',
        'RN-01',
      );
    }

    const orden = OrdenServicio.generar({
      ...datos,
      falla_reportada: datos.falla_reportada ?? equipo.obtener('falla_reportada'),
    });

    const creada = await repos.orden.crear(orden);
    await OrdenServicioService.#notificar(creada, ESTADO_ORDEN.RECIBIDO, 'Orden recibida');
    return creada;
  }

  /**
   * cambiarEstado() (RF-05) recorre el diagrama de estados. Las RN-02 y RN-03
   * se validan en el dominio y las vuelve a aplicar el trigger, de modo que
   * el resultado es el mismo llegue por donde llegue la peticion.
   */
  static async cambiarEstado(id, { estado, id_tecnico, diagnostico, solucion, observaciones }) {
    const orden = await repos.orden.buscarPorId(id);
    if (!orden) throw new ErrorReglaNegocio('Orden de servicio no encontrada', 'validacion');

    const anterior = orden.obtener('estado');
    orden.actualizarEstado(estado, { id_tecnico, diagnostico, solucion, observaciones });

    const actualizada = await repos.orden.cambiarEstado(id, {
      estado,
      ...(id_tecnico !== undefined ? { id_tecnico } : {}),
      ...(diagnostico !== undefined ? { diagnostico } : {}),
      ...(solucion !== undefined ? { solucion } : {}),
      ...(observaciones !== undefined ? { observaciones } : {}),
    });

    if (estado !== anterior) {
      await OrdenServicioService.#notificar(
        actualizada,
        estado,
        `Orden ${actualizada.obtener('numero')}: ${estado.replace(/_/g, ' ')}`,
      );
    }

    return actualizada;
  }

  /**
   * Registra la notificacion al cliente sobre el avance de su orden.
   * Es el caso de uso "recibir notificacion": el cliente conoce el estado de
   * su equipo sin tener que llamar al taller a preguntar.
   * @private
   */
  static async #notificar(orden, estado, asunto) {
    const idUsuario = orden.obtener('id_usuario_registro');
    const idCliente = orden.obtener('id_cliente');
    if (!idUsuario || !idCliente) return;

    const numero = orden.obtener('numero');
    await repos.mensaje.crear(
      Mensaje.enviar({
        id_usuario: idUsuario,
        id_cliente: idCliente,
        id_orden: orden.obtener('id_orden'),
        asunto,
        contenido: Mensaje.plantillaEstado(numero, estado),
      }),
    );
  }

  /** Asigna un tecnico a la orden (RN-02). */
  static async asignarTecnico(id, idTecnico) {
    const [orden, tecnico] = await Promise.all([
      repos.orden.buscarPorId(id),
      repos.tecnico.buscarPorId(idTecnico),
    ]);
    if (!orden) throw new ErrorReglaNegocio('Orden de servicio no encontrada', 'validacion');
    if (!tecnico) throw new ErrorReglaNegocio('Tecnico no encontrado', 'validacion');

    tecnico.asignarOrden(orden);
    return repos.orden.cambiarEstado(id, { id_tecnico: Number(idTecnico) });
  }

  /**
   * Registra el diagnostico tecnico sin cambiar el estado.
   * Los diagnosticos se guardan a medida que el tecnico avanza, que es como
   * funciona en la practica: primero se sabe la falla, despues el presupuesto.
   */
  static async registrarDiagnostico(id, texto) {
    const orden = await repos.orden.buscarPorId(id);
    if (!orden) throw new ErrorReglaNegocio('Orden de servicio no encontrada', 'validacion');

    orden.registrarDiagnostico(texto);
    return repos.orden.cambiarEstado(id, { diagnostico: texto });
  }

  /** Detalle completo de la orden: encabezado, desglose, pagos e historial. */
  static async detalle(id) {
    const detalle = await repos.orden.obtenerDetalle(id);
    if (!detalle) throw new ErrorReglaNegocio('Orden de servicio no encontrada', 'validacion');

    const [pagos, historial] = await Promise.all([
      repos.orden.listarPagos(id),
      repos.orden.listarHistorialEstados(id),
    ]);
    return { ...detalle, pagos, historial };
  }

  static listar(opciones) { return repos.orden.listarConsolidado(opciones); }
  static async obtener(id) {
    const orden = await repos.orden.buscarPorId(id);
    if (!orden) throw new ErrorReglaNegocio('Orden de servicio no encontrada', 'validacion');
    return orden;
  }

  /**
   * agregarDetalle() (RF-06) registra un concepto en la orden. El descuento de
   * stock (RN-04) y el recalculo del costo final (RN-05) los aplican los
   * triggers dentro de la misma transaccion.
   */
  static async agregarDetalle(idOrden, datos) {
    const orden = await repos.orden.buscarPorId(idOrden);
    if (!orden) throw new ErrorReglaNegocio('Orden de servicio no encontrada', 'validacion');

    const detalle = DetalleServicio.registrar(datos);
    return repos.detalle.crear(detalle);
  }

  /** Elimina un concepto; el repuesto vuelve al inventario (RN-04). */
  static async quitarDetalle(idOrden, idDetalle) {
    const filas = await consultar(
      'SELECT * FROM `detalle_servicio` WHERE `id_detalle` = ? AND `id_orden` = ?',
      [idDetalle, idOrden],
    );
    if (!filas.length) {
      throw new ErrorReglaNegocio('El concepto no pertenece a esta orden', 'validacion');
    }
    return repos.detalle.eliminar(idDetalle);
  }

  /** Aplica un descuento autorizado (RN-05). */
  static async aplicarDescuento(id, valor) {
    const orden = await repos.orden.buscarPorId(id);
    if (!orden) throw new ErrorReglaNegocio('Orden de servicio no encontrada', 'validacion');
    orden.aplicarDescuento(valor);
    return repos.orden.actualizar(orden);
  }
}

/**
 * PagoService
 * RF-08. El pago y su comprobante se emiten en una sola transaccion para
 * que no exista un cobro sin comprobante ni un comprobante sin cobro.
 */
export class PagoService {
  static async registrar(idOrden, datos) {
    const orden = await repos.orden.buscarPorId(idOrden);
    if (!orden) throw new ErrorReglaNegocio('Orden de servicio no encontrada', 'validacion');

    const pago = Pago.registrarPago({ ...datos, id_orden: Number(idOrden) });
    // Comprobacion temprana del saldo; el trigger la vuelve a hacer con el
    // dato mas fresco dentro de la misma transaccion.
    pago.validarMonto(orden.obtener('saldo'));

    return enTransaccion(async () => {
      const creado = await repos.pago.crear(pago);
      const comprobante = await repos.comprobante.crear(
        ComprobantePago.emitir({
          id_pago: creado.obtener('id_pago'),
          tipo: datos.tipo_comprobante ?? TIPO_COMPROBANTE.BOLETA,
          total: creado.obtener('monto'),
        }),
      );
      const actualizada = await repos.orden.buscarPorId(idOrden);
      return { pago: creado, comprobante, orden: actualizada };
    });
  }

  static async anular(idPago) {
    const pago = await repos.pago.buscarPorId(idPago);
    if (!pago) throw new ErrorReglaNegocio('Pago no encontrado', 'validacion');

    return enTransaccion(async () => {
      await ejecutar('UPDATE `pago` SET `estado` = \'ANULADO\' WHERE `id_pago` = ?', [idPago]);
      return repos.orden.buscarPorId(pago.obtener('id_orden'));
    });
  }

  static listarPorPeriodo(desde, hasta) { return repos.pago.listarPorPeriodo(desde, hasta); }
}

/**
 * InventarioService
 * RF-06 (control de repuestos) y el catalogo de proveedores.
 */
export class InventarioService {
  static async registrarRepuesto(datos) {
    const repuesto = Repuesto.registrar(datos);
    return repos.repuesto.crear(repuesto);
  }

  static async registrarProveedor(datos) {
    const proveedor = Proveedor.registrar(datos);
    return repos.proveedor.crear(proveedor);
  }

  static listarRepuestos(opciones) { return repos.repuesto.listar(opciones); }
  static listarProveedores(opciones) { return repos.proveedor.listar(opciones); }
  static buscarRepuesto(texto, limite) { return repos.repuesto.buscar(texto, limite); }

  /** Repuestos por reponer, para el aviso de inventario. */
  static porReponer() { return repos.repuesto.porReponer(); }

  /**
   * Registra un egreso (compra de repuestos o gasto operativo, apartado 9.1).
   * Los ingresos no se registran por aqui: nacen de los pagos.
   */
  static async registrarEgreso(datos) {
    const movimiento = MovimientoEconomico.registrar({
      tipo: 'EGRESO',
      fecha: new Date().toISOString().slice(0, 10),
      ...datos,
    });
    return repos.movimiento.crear(movimiento);
  }

  static async registrarTecnico(datos) {
    const tecnico = Tecnico.registrar(datos);
    return repos.tecnico.crear(tecnico);
  }

  /** Tecnicos con su carga de trabajo (RN-07). */
  static listarTecnicosConCarga() { return repos.tecnico.listarConCarga(); }
}

/**
 * ReporteService
 * Modulo de reportes (RF-10) e indicadores de gestion (apartado 13).
 */
export class ReporteService {
  /**
   * @param {number} dias Ventana de la serie diaria. El repositorio la acota
   *   entre 7 y 60, asi que aqui no hace falta validarla otra vez.
   */
  static tablero(dias) { return indicadores.tablero({ dias }); }

  static resumenEconomico(desde, hasta) {
    return repos.movimiento.resumenPorPeriodo(desde, hasta);
  }

  static movimientos(desde, hasta, tipo) {
    return repos.movimiento.listarPorPeriodo(desde, hasta, tipo);
  }

  static composicionGastos(desde, hasta) {
    return repos.movimiento.porCategoria(desde, hasta);
  }

  static consumoRepuestos(desde, hasta) {
    return repos.repuesto.consumoPorPeriodo(desde, hasta);
  }

  static comprasPorProveedor(desde, hasta) {
    return repos.egreso.comprasPorProveedor(desde, hasta);
  }

  static tiempoReparacion(desde, hasta) {
    return indicadores.tiempoDeReparacion(desde, hasta);
  }
}
