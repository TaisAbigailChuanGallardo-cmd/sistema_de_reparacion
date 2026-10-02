/* ==========================================================================
   Modulo 6 - Reportes
   RF-10 e indicadores de gestion del apartado 13: operacion, economia,
   consumo de repuestos, carga de tecnicos, tiempos de reparacion y pagos.
   ========================================================================== */

import { api } from '../api.js';
import {
  el, tabla, seccion, tarjetas, dinero, fecha, hoy, inicioDeMes, numero, legible,
  cargarYAvisar, exito, fallo, etiquetaEstado,
} from '../ui.js';

const VISTAS = [
  { clave: 'operacion', titulo: 'Operación' },
  { clave: 'economico', titulo: 'Económico' },
  { clave: 'pagos', titulo: 'Pagos' },
  { clave: 'repuestos', titulo: 'Repuestos' },
  { clave: 'tecnicos', titulo: 'Técnicos' },
  { clave: 'tiempos', titulo: 'Tiempos' },
];

let vistaActual = 'operacion';
let fechas = { desde: inicioDeMes(), hasta: hoy() };

/** Atajos de periodo: escribir a mano dos fechas es la parte tediosa del reporte. */
const PERIODOS = [
  { texto: 'Este mes', calcular: () => ({ desde: inicioDeMes(), hasta: hoy() }) },
  {
    texto: 'Mes anterior',
    calcular: () => {
      const d = new Date();
      const primero = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const ultimo = new Date(d.getFullYear(), d.getMonth(), 0);
      return { desde: aISO(primero), hasta: aISO(ultimo) };
    },
  },
  {
    texto: 'Últimos 30 días',
    calcular: () => {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      return { desde: aISO(d), hasta: hoy() };
    },
  },
  {
    texto: 'Este año',
    calcular: () => ({ desde: `${new Date().getFullYear()}-01-01`, hasta: hoy() }),
  },
];

const aISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function iniciar(raiz) {
  raiz.replaceChildren(construir());
  return raiz;
}

function construir() {
  const contenedor = el('div', {});

  const entradaDesde = el('input', { class: 'campo__control', type: 'date', value: fechas.desde });
  const entradaHasta = el('input', { class: 'campo__control', type: 'date', value: fechas.hasta });

  const cuerpo = el('div', { id: 'cuerpo-reporte' }, el('div', { class: 'cargando' }, 'Consultando...'));

  const consultar = async () => {
    fechas = { desde: entradaDesde.value, hasta: entradaHasta.value };
    await pintar(cuerpo);
  };

  entradaDesde.addEventListener('change', consultar);
  entradaHasta.addEventListener('change', consultar);

  const pestanas = el('div', { class: 'pestanas', role: 'tablist' });
  const mostrar = (clave) => {
    vistaActual = clave;
    pestanas.querySelectorAll('.pestana').forEach((n) => {
      const activo = n.dataset.vista === clave;
      n.classList.toggle('pestana--activa', activo);
      n.setAttribute('aria-selected', String(activo));
    });
    consultar();
  };

  VISTAS.forEach((vista) => pestanas.append(
    el('button', {
      class: 'pestana', type: 'button', role: 'tab', datos: { vista: vista.clave },
      onclick: () => mostrar(vista.clave),
    }, vista.titulo),
  ));

  const chips = el('div', { class: 'chips' }, PERIODOS.map((periodo) =>
    el('button', {
      class: 'chip', type: 'button',
      onclick: () => {
        const rango = periodo.calcular();
        entradaDesde.value = rango.desde;
        entradaHasta.value = rango.hasta;
        consultar();
      },
    }, periodo.texto),
  ));

  contenedor.append(
    el('div', { class: 'encabezado-modulo' },
      el('div', { class: 'encabezado-modulo__filtros' },
        el('label', { class: 'campo mb-0' }, el('span', { class: 'campo__etiqueta' }, 'Desde'), entradaDesde),
        el('label', { class: 'campo mb-0' }, el('span', { class: 'campo__etiqueta' }, 'Hasta'), entradaHasta),
      ),
      el('button', { class: 'boton boton--primario', onclick: consultar }, 'Consultar'),
    ),
    chips,
    pestanas,
    cuerpo,
  );

  mostrar(vistaActual);
  return contenedor;
}

async function pintar(destino) {
  destino.replaceChildren(el('div', { class: 'cargando' }, 'Consultando...'));
  const datos = await cargarYAvisar('No se pudo generar el reporte', () => {
    if (vistaActual === 'tecnicos') return api.get('/reportes/tecnicos');
    return api.get(`/reportes/${vistaActual}`, fechas);
  });
  if (!datos) return;

  const constructor = {
    operacion: reporteOperacion,
    economico: reporteEconomico,
    pagos: reportePagos,
    repuestos: reporteRepuestos,
    tecnicos: reporteTecnicos,
    tiempos: reporteTiempos,
  }[vistaActual];

  const descargar = el('button', { class: 'boton boton--fantasma boton--chico', type: 'button' }, '⤓ Exportar CSV');
  descargar.addEventListener('click', () => exportarCSV(vistaActual, datos));

  destino.replaceChildren(
    el('div', { class: 'encabezado-modulo' },
      el('span', { class: 'texto-pequeno' }, `Periodo: ${fechas.desde} al ${fechas.hasta}`),
      descargar,
    ),
    constructor(datos),
  );
}

/* --------------------------------------------------------------------------
   Reportes
   -------------------------------------------------------------------------- */

function reporteOperacion(datos) {
  return el('div', { class: 'pila' },
    tarjetas([
      { etiqueta: 'Ordenes atendidas', valor: datos.atendidas, color: 'verde' },
      { etiqueta: 'Ordenes pendientes', valor: datos.pendientes, color: 'ambar' },
      { etiqueta: 'Estados registrados', valor: (datos.por_estado ?? []).length },
    ]),
    seccion('Ordenes del periodo',
      tabla([
        { titulo: 'Numero', campo: 'numero' },
        { titulo: 'Cliente', campo: 'cliente' },
        { titulo: 'Equipo', campo: 'equipo' },
        { titulo: 'Tecnico', render: (f) => f.tecnico ?? 'Sin asignar' },
        { titulo: 'Estado', render: (f) => etiquetaEstado(f.estado) },
        { titulo: 'Total', clase: 'numero', render: (f) => dinero(f.costo_final) },
        { titulo: 'Recepcion', render: (f) => fecha(f.fecha_recepcion) },
      ], datos.detalle ?? [], { vacio: 'No hubo ordenes en el periodo' }),
    ),
  );
}

function reporteEconomico(datos) {
  const resumen = el('div', { class: 'pila' },
    tarjetas([
      { etiqueta: 'Ingresos', valor: dinero(datos.ingresos), color: 'verde' },
      { etiqueta: 'Egresos', valor: dinero(datos.egresos), color: 'rojo' },
      {
        etiqueta: 'Resultado',
        valor: dinero(datos.resultado),
        color: datos.resultado >= 0 ? 'verde' : 'rojo',
        nota: datos.resultado >= 0 ? 'El taller gano dinero en el periodo' : 'El taller perdio dinero en el periodo',
      },
    ]),
  );

  resumen.append(el('div', { class: 'rejilla' },
    seccion('Composicion de los gastos', tabla([
      { titulo: 'Categoria', render: (f) => legible(f.categoria) },
      { titulo: 'Movimientos', campo: 'movimientos', clase: 'numero' },
      { titulo: 'Total', clase: 'numero', render: (f) => dinero(f.total) },
    ], datos.categorias ?? [], { vacio: 'Sin egresos en el periodo' })),
    seccion('Compras por proveedor', tabla([
      { titulo: 'Proveedor', render: (f) => f.proveedor ?? 'Sin proveedor' },
      { titulo: 'Compras', campo: 'compras', clase: 'numero' },
      { titulo: 'Total', clase: 'numero', render: (f) => dinero(f.total) },
    ], datos.proveedores ?? [], { vacio: 'Sin compras en el periodo' })),
  ));

  resumen.append(seccion('Movimientos del periodo',
    tabla([
      { titulo: 'Fecha', render: (f) => fecha(f.fecha) },
      { titulo: 'Tipo', render: (f) => el('span', { class: `etiqueta ${f.tipo === 'INGRESO' ? 'etiqueta--activo' : 'etiqueta--cancelado'}` }, legible(f.tipo)) },
      { titulo: 'Concepto', campo: 'concepto' },
      { titulo: 'Orden', render: (f) => f.orden_numero ?? '—' },
      { titulo: 'Proveedor', render: (f) => f.proveedor ?? '—' },
      { titulo: 'Monto', clase: 'numero', render: (f) => dinero(f.monto) },
    ], datos.movimientos ?? [], { vacio: 'Sin movimientos en el periodo' }),
  ));

  return resumen;
}

function reportePagos(datos) {
  const metodos = Object.entries(datos.por_metodo ?? {}).map(([metodo, total]) => ({ metodo, total }));

  return el('div', { class: 'pila' },
    tarjetas([
      { etiqueta: 'Ingresos cobrados', valor: dinero(datos.total), color: 'verde' },
      { etiqueta: 'Pagos registrados', valor: (datos.pagos ?? []).length },
      { etiqueta: 'Metodos usados', valor: metodos.length },
    ]),
    seccion('Cobros por metodo de pago',
      tabla([
        { titulo: 'Metodo', render: (f) => legible(f.metodo) },
        { titulo: 'Total', clase: 'numero', render: (f) => dinero(f.total) },
        {
          titulo: 'Participacion',
          render: (f) => el('div', { class: 'barra-carga' },
            el('div', {
              class: 'barra-carga__relleno',
              style: `width: ${datos.total ? Math.round((Number(f.total) / Number(datos.total)) * 100) : 0}%`,
            }),
          ),
        },
      ], metodos, { vacio: 'No se registraron cobros en el periodo' }),
    ),
    seccion('Detalle de cobros',
      tabla([
        { titulo: 'Fecha', render: (f) => fecha(f.fecha) },
        { titulo: 'Orden', render: (f) => f.orden_numero ?? '—' },
        { titulo: 'Metodo', render: (f) => legible(f.metodo) },
        { titulo: 'Referencia', campo: 'referencia' },
        { titulo: 'Monto', clase: 'numero', render: (f) => dinero(f.monto) },
      ], datos.pagos ?? [], { vacio: 'Sin pagos en el periodo' }),
    ),
  );
}

function reporteRepuestos(datos) {
  return el('div', { class: 'pila' },
    seccion('Consumo de repuestos en el periodo',
      tabla([
        { titulo: 'Codigo', campo: 'codigo' },
        { titulo: 'Repuesto', campo: 'nombre' },
        { titulo: 'Unidades', campo: 'unidades', clase: 'numero' },
        { titulo: 'Total', clase: 'numero', render: (f) => dinero(f.total) },
      ], datos.consumo ?? [], { vacio: 'No se consumieron repuestos en el periodo' }),
    ),
    seccion('Repuestos por reponer',
      tabla([
        { titulo: 'Codigo', campo: 'codigo' },
        { titulo: 'Repuesto', campo: 'nombre' },
        { titulo: 'Stock', clase: 'numero', render: (f) => `${f.stock} / min. ${f.stock_minimo}` },
        { titulo: 'Proveedor', render: (f) => f.proveedor ?? '—' },
      ], datos.por_reponer ?? [], { vacio: 'Todo el inventario esta por encima del minimo' }),
    ),
  );
}

function reporteTecnicos(datos) {
  return seccion('Carga de trabajo por tecnico (RN-07)',
    tabla([
      { titulo: 'Tecnico', campo: 'nombre' },
      { titulo: 'Asignadas', campo: 'ordenes', clase: 'numero' },
      { titulo: 'Entregadas', campo: 'entregadas', clase: 'numero' },
      { titulo: 'Horas promedio', clase: 'numero', render: (f) => numero(f.horas_promedio, 1) },
    ], datos ?? [], { vacio: 'No hay carga de trabajo registrada' }),
  );
}

function reporteTiempos(datos) {
  return el('div', { class: 'pila' },
    tarjetas([
      { etiqueta: 'Tiempo promedio de reparacion', valor: `${numero(datos.promedio_horas, 1)} h`, color: 'verde' },
      { etiqueta: 'Ordenes entregadas', valor: (datos.ordenes ?? []).length, nota: 'Entrega menos recepcion' },
    ]),
    seccion('Ordenes entregadas y su tiempo de atencion',
      tabla([
        { titulo: 'Numero', campo: 'numero' },
        { titulo: 'Cliente', campo: 'cliente' },
        { titulo: 'Equipo', campo: 'equipo' },
        { titulo: 'Tecnico', render: (f) => f.tecnico ?? '—' },
        { titulo: 'Horas', clase: 'numero', render: (f) => numero(f.horas_atencion, 1) },
      ], datos.ordenes ?? [], { vacio: 'No hay ordenes entregadas en el periodo' }),
    ),
  );
}

/* --------------------------------------------------------------------------
   Exportacion
   -------------------------------------------------------------------------- */

function exportarCSV(nombreVista, datos) {
  const filas = [];

  const agregar = (encabezados, registros) => {
    filas.push(encabezados.join(','));
    for (const registro of registros) filas.push(encabezados.map((h) => escapar(registro[h])).join(','));
  };

  if (nombreVista === 'operacion') {
    agregar(['numero', 'cliente', 'equipo', 'estado', 'costo_final', 'fecha_recepcion'], datos.detalle ?? []);
  } else if (nombreVista === 'economico') {
    agregar(['fecha', 'tipo', 'concepto', 'monto'], datos.movimientos ?? []);
  } else if (nombreVista === 'pagos') {
    agregar(['fecha', 'orden_numero', 'metodo', 'referencia', 'monto'], datos.pagos ?? []);
  } else if (nombreVista === 'repuestos') {
    agregar(['codigo', 'nombre', 'unidades', 'total'], datos.consumo ?? []);
  } else if (nombreVista === 'tecnicos') {
    agregar(['nombre', 'ordenes', 'entregadas', 'horas_promedio'], datos ?? []);
  } else if (nombreVista === 'tiempos') {
    agregar(['numero', 'cliente', 'equipo', 'tecnico', 'horas_atencion'], datos.ordenes ?? []);
  }

  if (!filas.length) {
    fallo('El reporte no tiene datos para exportar');
    return;
  }

  const archivo = new Blob([filas.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(archivo);
  enlace.download = `reporte-${nombreVista}-${fechas.desde}_${fechas.hasta}.csv`;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
  exito('Reporte exportado');
}

const escapar = (valor) => {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[",\n;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};
