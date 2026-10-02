/* ==========================================================================
   Modulo 3 - Ordenes de Servicio
   Concentra RF-03 (recepcion), RF-04 (diagnostico), RF-05 (seguimiento del
   estado), RF-06 (conceptos y repuestos), RF-07 (asignacion de tecnico) y
   RF-08 (pago con comprobante).
   ========================================================================== */

import { api, sesion } from '../api.js';
import {
  $, el, tabla, seccion, tarjetas, vacio, dinero, numero, fecha, fechaHora, hoy, legible,
  cargarYAvisar, abrirModal, cerrarModal, panelFormulario, campo,
  confirmar, exito, fallo, etiquetaEstado,
} from '../ui.js';

let clientes = [];
let equipos = [];
let tecnicos = [];
let repuestos = [];
let maquinaEstados = { estados: [], transiciones: {} };
let catalogos = {};

export async function iniciar(raiz) {
  raiz.replaceChildren(el('div', { class: 'cargando' }, 'Cargando ordenes...'));
  [clientes, equipos, tecnicos, repuestos, maquinaEstados, catalogos] = await Promise.all([
    api.get('/clientes', { limite: 200 }),
    api.get('/equipos', { limite: 200 }),
    api.get('/tecnicos'),
    api.get('/inventario/repuestos', { limite: 200 }),
    api.get('/reportes/estados'),
    api.get('/catalogos/inventario'),
  ]);
  raiz.replaceChildren(construir());
  return raiz;
}

/* --------------------------------------------------------------------------
   Listado con filtros
   -------------------------------------------------------------------------- */

function construir() {
  const contenedor = el('div', {});

  const buscador = el('input', { class: 'campo__control', type: 'search', placeholder: 'Numero de orden, cliente o equipo...' });
  const soloPendientes = el('input', { type: 'checkbox' });
  let estadoActivo = '';

  const filtrar = () => listar({
    busqueda: buscador.value,
    estado: estadoActivo,
    pendientes: soloPendientes.checked,
  });

  buscador.addEventListener('input', filtrar);
  soloPendientes.addEventListener('change', filtrar);

  /* Los chips reemplazan al select de estados: el flujo de una orden ya es una
     maquina de estados, asi que mostrar todos los destinos posibles de una vez
     invita a saltarse el paso anterior. Solo se muestran los que la orden
     admite, y ademas llevan el numero de ordenes que hay en cada uno. */
  const chip = (valor, texto, conteo) => el('button', {
    class: `chip ${valor === estadoActivo ? 'chip--activo' : ''}`,
    type: 'button',
    onclick: () => {
      estadoActivo = valor;
      contenedor.querySelectorAll('.chip').forEach((n) => n.classList.remove('chip--activo'));
      chipNuevo.classList.add('chip--activo');
      filtrar();
    },
  }, texto, conteo !== undefined ? el('span', { class: 'chip__conteo' }, conteo) : null);

  const chipNuevo = chip('', 'Todas', undefined);

  const chips = el('div', { class: 'chips' }, [
    chipNuevo,
    ...(maquinaEstados.estados ?? []).map((estado) => chip(estado, legible(estado))),
  ]);

  contenedor.append(
    el('div', { class: 'encabezado-modulo' },
      el('div', { class: 'encabezado-modulo__filtros' },
        el('label', { class: 'campo mb-0' }, el('span', { class: 'campo__etiqueta' }, 'Buscar'), buscador),
        // Se reutiliza el input de la linea 44 en vez de crear otro: ya tiene su
        // listener en 'change' y el filtro lee su estado con .checked. El <span>
        // de etiqueta va vacio a proposito, solo alinea la fila con el buscador.
        el('label', { class: 'campo campo--check mb-0' },
          el('span', { class: 'campo__etiqueta' }, ''),
          el('span', { class: 'campo__check' }, soloPendientes, el('span', {}, 'Solo pendientes')),
        ),
      ),
      el('button', { class: 'boton boton--primario', onclick: () => nuevaOrden() }, '+ Nueva orden'),
    ),
    chips,
    el('div', { id: 'lista-ordenes' }, el('div', { class: 'cargando' }, 'Cargando...')),
  );

  listar({});
  return contenedor;
}

async function listar(filtros) {
  const destino = $('#lista-ordenes');
  if (!destino) return;

  destino.replaceChildren(el('div', { class: 'cargando' }, 'Consultando ordenes...'));
  const ordenes = await cargarYAvisar('No se pudieron cargar las ordenes',
    () => api.get('/ordenes', { ...filtros, limite: 200 }));

  if (!ordenes) return;

  const conResumen = el('div', { class: 'pila' },
    resumen(ordenes),
    ordenes.length
      ? tabla([
          { titulo: 'N.º', campo: 'numero', clase: 'negrita' },
          {
            titulo: 'Cliente', campo: 'cliente',
            render: (f) => el('div', {},
              el('div', {}, f.cliente ?? '—'),
              el('div', { class: 'texto-pequeno' }, `${f.marca ?? ''} ${f.modelo ?? ''}`.trim() || f.equipo),
            ),
          },
          { titulo: 'Técnico', render: (f) => f.tecnico ?? el('span', { class: 'texto-pequeno' }, 'Sin asignar') },
          { titulo: 'Estado', render: (f) => etiquetaEstado(f.estado) },
          { titulo: 'Prioridad', render: (f) => (f.prioridad === 'URGENTE' ? el('span', { class: 'etiqueta etiqueta--cancelado' }, 'Urgente') : el('span', { class: 'etiqueta etiqueta--activo' }, 'Normal')) },
          { titulo: 'Recepción', render: (f) => fecha(f.fecha_recepcion) },
          { titulo: 'Total', clase: 'numero', render: (f) => el('strong', {}, dinero(f.costo_final)) },
          {
            titulo: 'Saldo', clase: 'numero',
            render: (f) => (Number(f.saldo ?? 0) > 0
              ? el('span', { class: 'etiqueta etiqueta--deuda' }, dinero(f.saldo))
              : el('span', { class: 'etiqueta etiqueta--saldado' }, 'Saldado')),
          },
          { titulo: '', render: (f) => el('button', { class: 'boton boton--chico', onclick: () => verOrden(f.id_orden) }, 'Abrir') },
        ], ordenes)
      : vacio('No hay ordenes que coincidan con los filtros', '✎'),
  );

  destino.replaceChildren(conResumen);
}

/** Cifras del listado: lo que la fila Eye no deja ver de un vistazo. */
function resumen(ordenes) {
  const activas = ordenes.filter((o) => !['ENTREGADO', 'CANCELADO'].includes(o.estado));
  const porCobrar = ordenes.reduce((suma, o) => suma + Number(o.saldo ?? 0), 0);
  const urgentes = ordenes.filter((o) => o.prioridad === 'URGENTE' && !['ENTREGADO', 'CANCELADO'].includes(o.estado));

  return tarjetas([
    { etiqueta: 'Órdenes listadas', valor: numero(ordenes.length), nota: `${numero(activas.length)} aún en taller` },
    { etiqueta: 'Facturación', valor: dinero(ordenes.reduce((s, o) => s + Number(o.costo_final ?? 0), 0)), color: 'verde', nota: 'total de la consulta' },
    { etiqueta: 'Por cobrar', valor: dinero(porCobrar), color: porCobrar > 0 ? 'rojo' : 'verde', nota: 'suma de los saldos pendientes' },
    { etiqueta: 'Urgentes', valor: numero(urgentes.length), color: urgentes.length ? 'ambar' : 'verde', nota: 'prioridad alta sin entregar' },
  ]);
}

/* --------------------------------------------------------------------------
   Alta de orden (RF-03)
   -------------------------------------------------------------------------- */

function nuevaOrden() {
  if (!clientes.length || !equipos.length) {
    fallo('Primero registre un cliente y su equipo');
    return;
  }

  const formulario = panelFormulario({
    textoEnviar: 'Recepcionar equipo',
    campos: [
      campo({
        etiqueta: 'Cliente', nombre: 'id_cliente', tipo: 'select', requerido: true,
        opciones: clientes.map((c) => ({ valor: c.id_cliente, texto: `${c.nombre} (${c.numero_documento})` })),
      }),
      campo({
        etiqueta: 'Equipo', nombre: 'id_equipo', tipo: 'select', requerido: true,
        opciones: equipos.map((e) => ({ valor: e.id_equipo, texto: `${e.codigo} - ${e.marca} ${e.modelo}` })),
      }),
      campo({ etiqueta: 'Prioridad', nombre: 'prioridad', tipo: 'select', opciones: ['NORMAL', 'URGENTE'] }),
      campo({ etiqueta: 'Falla reportada', nombre: 'falla_reportada', ancho: true, requerido: true, ayuda: 'Motivo por el que el cliente deja el equipo' }),
      campo({ etiqueta: 'Accesorios entregados', nombre: 'accesorios', ancho: true, ayuda: 'Cargador, funda, memoria... si el cliente los deja' }),
    ],
    alEnviar: async (datos) => {
      const orden = await api.post('/ordenes', {
        ...datos,
        id_cliente: Number(datos.id_cliente),
        id_equipo: Number(datos.id_equipo),
        id_usuario_registro: sesion.usuario?.id_usuario ?? null,
      });
      exito(`Orden ${orden.numero} creada`);
      cerrarModal();
      await recargar();
      verOrden(orden.id_orden);
    },
  });

  abrirModal('Recepcion de equipo', formulario);
}

/* --------------------------------------------------------------------------
   Detalle de la orden
   -------------------------------------------------------------------------- */

async function verOrden(id) {
  const orden = await cargarYAvisar('No se pudo cargar la orden', () => api.get(`/ordenes/${id}`));
  if (!orden) return;

  const contenido = el('div', { class: 'pila' });
  const cuerpo = abrirModal(`Orden ${orden.numero}`, contenido);

  contenido.append(barraDeEstados(orden));

  contenido.append(
    el('div', { class: 'boton--fila' },
      boton('Cambiar estado', () => formularioEstado(orden), 'primario'),
      boton('Asignar tecnico', () => formularioTecnico(orden)),
      boton('Registrar diagnostico', () => formularioDiagnostico(orden)),
      boton('Agregar concepto', () => formularioConcepto(orden)),
      boton('Aplicar descuento', () => formularioDescuento(orden)),
      boton('Registrar pago', () => formularioPago(orden), 'exito'),
    ),
  );

  contenido.append(
    seccion('Encabezado', el('div', { class: 'rejilla' },
      dato('Cliente', orden.cliente),
      dato('Documento', orden.cliente_documento),
      dato('Equipo', `${orden.marca ?? ''} ${orden.modelo ?? ''} (${orden.numero_serie ?? 'sin serie'})`),
      dato('Tecnico', orden.tecnico ?? 'Sin asignar'),
      dato('Prioridad', legible(orden.prioridad)),
      dato('Recepcion', fecha(orden.fecha_recepcion)),
      dato('Entrega', orden.fecha_entrega ? fecha(orden.fecha_entrega) : 'Pendiente'),
    )),
  );

  if (orden.falla_reportada || orden.diagnostico || orden.solucion) {
    contenido.append(seccion('Tecnica',
      el('div', { class: 'rejilla' },
        dato('Falla reportada', orden.falla_reportada),
        dato('Diagnostico', orden.diagnostico),
        dato('Solucion', orden.solucion),
        dato('Observaciones', orden.observaciones),
      ),
    ));
  }

  contenido.append(desglose(orden));

  const conceptos = [
    ...(orden.detalles?.repuestos ?? []).map((d) => ({ ...d, grupo: 'Repuestos' })),
    ...(orden.detalles?.manoObra ?? []).map((d) => ({ ...d, grupo: 'Mano de obra' })),
    ...(orden.detalles?.adicionales ?? []).map((d) => ({ ...d, grupo: 'Adicionales' })),
  ];

  contenido.append(seccion('Conceptos registrados',
    tabla([
      { titulo: 'Grupo', campo: 'grupo' },
      { titulo: 'Descripcion', campo: 'descripcion' },
      { titulo: 'Cantidad', campo: 'cantidad', clase: 'numero' },
      { titulo: 'Unitario', campo: 'costo_unitario', clase: 'numero', render: (f) => dinero(f.costo_unitario) },
      { titulo: 'Subtotal', campo: 'subtotal', clase: 'numero', render: (f) => dinero(f.subtotal) },
      {
        titulo: '',
        render: (f) => el('button', {
          class: 'boton boton--chico boton--fantasma',
          onclick: async () => {
            const acepta = await confirmar('Quitar este concepto? Si es un repuesto, vuelve al inventario.');
            if (!acepta) return;
            try {
              await api.eliminar(`/ordenes/${id}/conceptos/${f.id_detalle}`);
              exito('Concepto eliminado');
              cerrarModal();
              verOrden(id);
              recargar();
            } catch (error) { fallo(error.message); }
          },
        }, 'Quitar'),
      },
    ], conceptos, { vacio: 'Todavia no se registraron conceptos en esta orden' }),
  ));

  contenido.append(seccion('Pagos y comprobantes',
    tabla([
      { titulo: 'Fecha', render: (f) => fechaHora(f.fecha) },
      { titulo: 'Monto', clase: 'numero', render: (f) => dinero(f.monto) },
      { titulo: 'Metodo', render: (f) => legible(f.metodo) },
      { titulo: 'Comprobante', render: (f) => f.comprobante_numero ?? f.numero ?? '—' },
      { titulo: 'Estado', render: (f) => legible(f.estado) },
    ], orden.pagos ?? [], { vacio: 'Esta orden aun no tiene pagos registrados' }),
  ));

  contenido.append(seccion('Historial de estados',
    tabla([
      { titulo: 'Fecha', render: (f) => fechaHora(f.created_at) },
      { titulo: 'De', render: (f) => legible(f.estado_anterior) },
      { titulo: 'A', render: (f) => legible(f.estado_nuevo) },
      { titulo: 'Comentario', campo: 'comentario' },
    ], orden.historial ?? [], { vacio: 'Sin movimientos registrados' }),
  ));

  cuerpo.scrollTop = 0;
}

function barraDeEstados(orden) {
  const flujo = el('div', { class: 'flujo' });
  const camino = (maquinaEstados.transiciones?.[orden.estado]?.siguientes ?? []);
  const estadoActual = orden.estado;

  flujo.append(el('span', { class: 'flujo__paso hecho' }, legible(estadoActual)));
  if (camino.length) {
    flujo.append(el('span', { class: 'flujo__flecha' }, '→'));
    flujo.append(el('span', { class: 'texto-pequeno' }, 'Puede pasar a:'));
    camino.forEach((estado, indice) => {
      if (indice) flujo.append(el('span', { class: 'flujo__flecha' }, '·'));
      flujo.append(el('span', { class: 'flujo__paso' }, legible(estado)));
    });
  } else {
    flujo.append(el('span', { class: 'texto-pequeno' }, 'Estado final: la orden ya no admite cambios de estado.'));
  }
  return flujo;
}

function desglose(orden) {
  const d = orden.desglose ?? {};
  return seccion('Resumen economico (RN-05)',
    tarjetas([
      { etiqueta: 'Diagnostico', valor: dinero(d.diagnostico) },
      { etiqueta: 'Mano de obra', valor: dinero(d.manoObra) },
      { etiqueta: 'Repuestos', valor: dinero(d.repuestos) },
      { etiqueta: 'Adicionales', valor: dinero(d.adicionales) },
      { etiqueta: 'Descuento', valor: `- ${dinero(d.descuento)}`, color: 'ambar' },
      { etiqueta: 'Total', valor: dinero(d.total), color: 'verde' },
      { etiqueta: 'Pagado', valor: dinero(orden.total_pagado) },
      { etiqueta: 'Saldo', valor: dinero(orden.saldo), color: Number(orden.saldo) > 0 ? 'rojo' : 'verde' },
    ]),
  );
}

/* --------------------------------------------------------------------------
   Acciones sobre la orden
   -------------------------------------------------------------------------- */

function formularioEstado(orden) {
  const permitidos = maquinaEstados.transiciones?.[orden.estado]?.siguientes ?? [];
  if (!permitidos.length) {
    fallo(`Una orden en estado ${legible(orden.estado)} no admite mas cambios de estado`);
    return;
  }

  const formulario = panelFormulario({
    textoEnviar: 'Aplicar cambio',
    cancelable: true,
    campos: [
      campo({
        etiqueta: 'Nuevo estado', nombre: 'estado', tipo: 'select', requerido: true,
        opciones: permitidos,
        ayuda: `Transiciones validas desde ${legible(orden.estado)} (RN-02, RN-03)`,
      }),
      campo({ etiqueta: 'Tecnico a asignar', nombre: 'id_tecnico', tipo: 'select', opciones: tecnicos.map((t) => ({ valor: t.id_tecnico, texto: `${t.nombre} (${t.ordenes_activas ?? 0} activas)` })), ayuda: 'Obligatorio para pasar a EN_REPARACION (RN-02)' }),
      campo({ etiqueta: 'Observaciones', nombre: 'observaciones', ancho: true }),
    ],
    alEnviar: async (datos) => {
      const cuerpo = { estado: datos.estado, observaciones: datos.observaciones || undefined };
      if (datos.id_tecnico) cuerpo.id_tecnico = Number(datos.id_tecnico);
      await api.patch(`/ordenes/${orden.id_orden}/estado`, cuerpo);
      exito(`Orden actualizada a ${legible(datos.estado)}`);
      cerrarModal();
      await recargar();
      verOrden(orden.id_orden);
    },
  });

  abrirModal('Cambiar estado de la orden', formulario);
}

function formularioTecnico(orden) {
  const formulario = panelFormulario({
    textoEnviar: 'Asignar tecnico',
    campos: [
      campo({
        etiqueta: 'Tecnico', nombre: 'id_tecnico', tipo: 'select', requerido: true,
        opciones: tecnicos.map((t) => ({
          valor: t.id_tecnico,
          texto: `${t.nombre} - ${t.ordenes_activas ?? 0}/${t.maximo_permitido ?? 5} activas`,
        })),
        ayuda: 'La RN-07 impide superar el maximo de ordenes activas por tecnico',
      }),
    ],
    alEnviar: async (datos) => {
      await api.patch(`/ordenes/${orden.id_orden}/tecnico`, { id_tecnico: Number(datos.id_tecnico) });
      exito('Tecnico asignado');
      cerrarModal();
      await recargar();
      verOrden(orden.id_orden);
    },
  });

  abrirModal('Asignar tecnico (RN-02)', formulario);
}

function formularioDiagnostico(orden) {
  const formulario = panelFormulario({
    textoEnviar: 'Guardar diagnostico',
    campos: [
      campo({
        etiqueta: 'Diagnostico tecnico', nombre: 'diagnostico', tipo: 'textarea', ancho: true, requerido: true,
        valor: orden.diagnostico ?? '',
      }),
      campo({ etiqueta: 'Solucion aplicada', nombre: 'solucion', tipo: 'textarea', ancho: true, valor: orden.solucion ?? '' }),
    ],
    alEnviar: async (datos) => {
      await api.put(`/ordenes/${orden.id_orden}/diagnostico`, {
        diagnostico: datos.diagnostico,
        solucion: datos.solucion || undefined,
      });
      exito('Diagnostico registrado');
      cerrarModal();
      await recargar();
      verOrden(orden.id_orden);
    },
  });

  abrirModal('Diagnostico de la orden', formulario);
}

function formularioConcepto(orden) {
  const formulario = panelFormulario({
    textoEnviar: 'Agregar concepto',
    campos: [
      campo({
        etiqueta: 'Concepto', nombre: 'concepto', tipo: 'select', requerido: true,
        opciones: catalogos.concepto_servicio ?? [],
      }),
      campo({ etiqueta: 'Descripcion', nombre: 'descripcion', requerido: true }),
      campo({ etiqueta: 'Cantidad', nombre: 'cantidad', tipo: 'number', valor: 1, requerido: true, attrs: { min: '1', step: '1' } }),
      campo({
        etiqueta: 'Repuesto del inventario', nombre: 'id_repuesto', tipo: 'select',
        opciones: repuestos.map((r) => ({ valor: r.id_repuesto, texto: `${r.codigo} - ${r.nombre} (stock ${r.stock})` })),
        ayuda: 'Obligatorio si el concepto es REPUESTO: el stock se descuenta solo (RN-04)',
      }),
      campo({ etiqueta: 'Costo unitario', nombre: 'costo_unitario', tipo: 'number', attrs: { min: '0', step: '0.01' }, ayuda: 'Si se omite y hay repuesto, se usa su precio' }),
    ],
    alEnviar: async (datos) => {
      const cuerpo = { concepto: datos.concepto, descripcion: datos.descripcion, cantidad: Number(datos.cantidad) };
      if (datos.id_repuesto) cuerpo.id_repuesto = Number(datos.id_repuesto);
      if (datos.costo_unitario) cuerpo.costo_unitario = Number(datos.costo_unitario);
      await api.post(`/ordenes/${orden.id_orden}/conceptos`, cuerpo);
      exito('Concepto agregado');
      cerrarModal();
      await recargar();
      verOrden(orden.id_orden);
    },
  });

  abrirModal('Agregar concepto a la orden', formulario);
}

function formularioDescuento(orden) {
  const formulario = panelFormulario({
    textoEnviar: 'Aplicar descuento',
    campos: [
      campo({
        etiqueta: 'Monto del descuento', nombre: 'descuento', tipo: 'number', requerido: true,
        valor: orden.descuento ?? 0, attrs: { min: '0', step: '0.01' },
        ayuda: 'No puede superar los conceptos registrados (RN-05)',
      }),
    ],
    alEnviar: async (datos) => {
      await api.patch(`/ordenes/${orden.id_orden}/descuento`, { descuento: Number(datos.descuento) });
      exito('Descuento aplicado');
      cerrarModal();
      await recargar();
      verOrden(orden.id_orden);
    },
  });

  abrirModal('Descuento sobre la orden', formulario);
}

function formularioPago(orden) {
  const saldo = Number(orden.saldo ?? 0);
  if (saldo <= 0) {
    fallo('Esta orden no tiene saldo pendiente');
    return;
  }

  const formulario = panelFormulario({
    textoEnviar: 'Registrar pago',
    campos: [
      campo({
        etiqueta: 'Monto', nombre: 'monto', tipo: 'number', requerido: true, valor: saldo,
        attrs: { min: '0.01', max: String(saldo), step: '0.01' },
        ayuda: `No puede superar el saldo pendiente: ${dinero(saldo)} (RN-06)`,
      }),
      campo({ etiqueta: 'Metodo', nombre: 'metodo', tipo: 'select', opciones: catalogos.metodo_pago, requerido: true }),
      campo({ etiqueta: 'Fecha', nombre: 'fecha', tipo: 'date', valor: hoy(), requerido: true }),
      campo({ etiqueta: 'Tipo de comprobante', nombre: 'tipo_comprobante', tipo: 'select', opciones: catalogos.tipo_comprobante }),
      campo({ etiqueta: 'Referencia', nombre: 'referencia', ayuda: 'Numero de operacion o voucher' }),
    ],
    alEnviar: async (datos) => {
      await api.post(`/ordenes/${orden.id_orden}/pagos`, {
        ...datos,
        monto: Number(datos.monto),
        id_usuario: sesion.usuario?.id_usuario ?? null,
      });
      exito('Pago registrado con su comprobante');
      cerrarModal();
      await recargar();
      verOrden(orden.id_orden);
    },
  });

  abrirModal('Registrar pago (RF-08)', formulario);
}

/* --------------------------------------------------------------------------
   Utilidades del modulo
   -------------------------------------------------------------------------- */

const dato = (clave, valor) => el('div', { class: 'dato' },
  el('span', { class: 'dato__clave' }, clave),
  el('span', { class: 'dato__valor' }, valor ?? '—'),
);

const boton = (texto, alHacerClic, tipo = 'fantasma') =>
  el('button', { class: `boton boton--${tipo}`, onclick: alHacerClic }, texto);

async function recargar() {
  [tecnicos, repuestos] = await Promise.all([
    api.get('/tecnicos'),
    api.get('/inventario/repuestos', { limite: 200 }),
  ]);
  const raiz = $('#contenido');
  raiz.replaceChildren(construir());
}
