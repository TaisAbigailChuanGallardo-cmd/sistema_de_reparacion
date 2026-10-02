/* ==========================================================================
   Modulo 1 - Tablero
   Panel de control del taller. Todo se arma a partir de una sola llamada a
   GET /api/reportes/tablero: indicadores, serie diaria, reparto por estado,
   marcas, carga de tecnicos, ordenes recientes y las tres bandejas de
   alertas (garantias, stock y mensajes).
   ========================================================================== */

import { api } from '../api.js';
import { $, el, tabla, dinero, numero, fecha, fechaHora, cargando, exito, fallo } from '../ui.js';

const PERIODOS = [
  { dias: 7, texto: '7 días' },
  { dias: 14, texto: '14 días' },
  { dias: 30, texto: '30 días' },
];

let diasActivo = 14;

/* Colores por estado. Se usan tanto en los anillos como en la tabla, asi que
   viven aqui para que no se repitan dos veces con valores distintos. */
const COLOR_ESTADO = {
  RECIBIDO: '#1d4ed8',
  EN_DIAGNOSTICO: '#7c3aed',
  PRESUPUESTADO: '#b45309',
  EN_REPARACION: '#ea580c',
  LISTO: '#0891b2',
  ENTREGADO: '#047857',
  CANCELADO: '#b91c1c',
};

export async function iniciar(raiz) {
  raiz.replaceChildren(cargando());
  const datos = await api.get('/reportes/tablero', { dias: diasActivo });
  raiz.replaceChildren(construir(datos));
  return raiz;
}

function construir(d) {
  return el('div', { class: 'tablero' },
    encabezado(),
    metricas(d),
    cuerpoPrincipal(d),
    el('div', { class: 'tablero__cuerpo' },
      panelOrdenesRecientes(d),
      panelAlertas(d),
    ),
    el('div', { class: 'tablero__fila' },
      panelMarcas(d),
      panelEstados(d),
      panelTecnicos(d),
    ),
  );
}

/* --------------------------------------------------------------------------
   Encabezado
   -------------------------------------------------------------------------- */

function encabezado() {
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';

  const botones = PERIODOS.map((periodo) =>
    el('button', {
      class: periodo.dias === diasActivo ? 'activo' : '',
      type: 'button',
      onclick: async () => {
        diasActivo = periodo.dias;
        const raiz = $('#contenido');
        raiz.replaceChildren(cargando());
        try {
          const datos = await api.get('/reportes/tablero', { dias: diasActivo });
          raiz.replaceChildren(construir(datos));
        } catch (error) {
          fallo(error.message);
        }
      },
    }, periodo.texto),
  );

  return el('div', { class: 'tablero__saludo' },
    el('div', {},
      el('h2', {}, saludo),
      el('p', {}, `Resumen operativo al ${new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}`),
    ),
    el('div', { class: 'tablero__periodo' }, botones),
    el('button', { class: 'boton boton--fantasma boton--chico', type: 'button', onclick: recargar }, '↻ Actualizar'),
  );

  async function recargar() {
    try {
      exito('Indicadores actualizados');
      await iniciar($('#contenido'));
    } catch (error) {
      fallo(error.message);
    }
  }
}

/* --------------------------------------------------------------------------
   Indicadores principales
   -------------------------------------------------------------------------- */

function metricas(d) {
  const variacion = (actual, anterior) => {
    const a = Number(anterior ?? 0);
    const b = Number(actual ?? 0);
    if (a === 0) return { texto: 'sin base de comparación', clase: 'tendencia--igual' };
    const pct = ((b - a) / a) * 100;
    const clase = pct > 0 ? 'tendencia--sube' : pct < 0 ? 'tendencia--baja' : 'tendencia--igual';
    return { texto: `${pct > 0 ? '▲' : pct < 0 ? '▼' : '■'} ${numero(Math.abs(pct), 1)}%`, clase };
  };

  const ordenes = variacion(d.ordenes_mes, d.ordenes_mes_anterior);
  const ingresos = variacion(d.ingresos_mes, d.ingresos_mes_anterior);

  const total = Number(d.ordenes_totales ?? 0) || 1;
  const metaTotalStock = Math.max(Number(d.repuestos_por_reponer ?? 0) + Number(d.repuestos_agotados ?? 0), 1);

  return el('div', { class: 'metricas' },
    metrica({
      titulo: 'Órdenes activas',
      icono: '⚙',
      valor: numero(d.ordenes_activas ?? 0),
      pie: [tendencia(ordenes), el('span', {}, `${numero(d.ordenes_mes ?? 0)} abiertas este mes`)],
      progreso: (Number(d.ordenes_activas ?? 0) / total) * 100,
      color: 'azul',
    }),
    metrica({
      titulo: 'Ingresos del mes',
      icono: 'S/',
      valor: dinero(d.ingresos_mes ?? 0),
      pie: [
        tendencia(ingresos),
        el('span', {}, `${dinero(d.ingresos_mes_anterior ?? 0)} el mes pasado`),
      ],
      nota: `Margen ${numero(d.margen_mes ?? 0, 1)}% · ${dinero(d.utilidad_mes ?? 0)} de utilidad`,
      color: 'verde',
    }),
    metrica({
      titulo: 'Equipos listos para entrega',
      icono: '✓',
      valor: numero(d.equipos_listos ?? 0),
      pie: [
        el('span', {}, `${numero(d.por_recibir ?? 0)} por recibir · ${numero(d.en_reparacion ?? 0)} en reparación`),
      ],
      nota: `${numero(d.entregadas_mes ?? 0)} entregadas este mes`,
      color: 'ambar',
    }),
    metrica({
      titulo: 'Repuestos con stock bajo',
      icono: '⚠',
      valor: numero(d.repuestos_por_reponer ?? 0),
      pie: [el('span', {}, `${numero(d.repuestos_agotados ?? 0)} agotados de ${numero(d.repuestos_totales ?? 0)} referencias`)],
      progreso: (Number(d.repuestos_por_reponer ?? 0) / metaTotalStock) * 100,
      color: (d.repuestos_por_reponer ?? 0) > 0 ? 'rojo' : 'verde',
    }),
  );
}

function metrica({ titulo, icono, valor, pie, nota, progreso, color = 'azul' }) {
  return el('div', { class: `metrica metrica--${color}` },
    el('div', { class: 'metrica__cabeza' },
      el('span', { class: 'metrica__titulo' }, titulo),
      el('span', { class: 'metrica__icono' }, icono),
    ),
    el('div', { class: 'metrica__valor' }, valor),
    el('div', { class: 'metrica__pie' }, pie),
    nota ? el('div', { class: 'metrica__pie' }, el('span', {}, nota)) : null,
    progreso !== undefined
      ? el('div', { class: 'metrica__progreso' }, el('span', { style: `width: ${Math.min(100, Math.max(0, progreso))}%` }))
      : null,
  );
}

function tendencia({ texto, clase }) {
  return el('span', { class: `tendencia ${clase}` }, texto);
}

/* --------------------------------------------------------------------------
   Cuerpo principal: gráfico de líneas + accesos rápidos
   -------------------------------------------------------------------------- */

function cuerpoPrincipal(d) {
  return el('div', { class: 'tablero__cuerpo' },
    panelGrafico(d),
    panelAccesos(d),
  );
}

function panelGrafico(d) {
  const serie = d.serie_diaria ?? [];
  const totalRecibidas = serie.reduce((suma, punto) => suma + Number(punto.recibidas ?? 0), 0);
  const totalEntregadas = serie.reduce((suma, punto) => suma + Number(punto.entregadas ?? 0), 0);

  return el('section', { class: 'panel-tablero' },
    el('div', { class: 'panel-tablero__cabeza' },
      el('div', {},
        el('h3', { class: 'panel-tablero__titulo' }, 'Rendimiento del taller'),
        el('p', { class: 'panel-tablero__nota' }, `Últimos ${diasActivo} días · ${totalRecibidas} recibidas y ${totalEntregadas} entregadas`),
      ),
      el('div', { class: 'leyenda' },
        el('span', {}, el('i', { style: 'background:#1d4ed8' }), 'Recibidas'),
        el('span', {}, el('i', { style: 'background:#047857' }), 'Entregadas'),
      ),
    ),
    serie.length ? graficoLineas(serie) : el('p', { class: 'panel-tablero__nota' }, 'Sin datos en el periodo.'),
  );
}

/**
 * Gráfico de líneas dibujado en SVG. Se hace a mano y no con una librería
 * porque el proyecto no usa ninguna y una sola serie de dos líneas no
 * justifica el peso extra en el navegador.
 */
function graficoLineas(serie) {
  const SVG = 'http://www.w3.org/2000/svg';
  const ancho = 640;
  const alto = 220;
  const margen = { arriba: 14, derecha: 12, abajo: 26, izquierda: 30 };
  const anchoTrama = ancho - margen.izquierda - margen.derecha;
  const altoTrama = alto - margen.arriba - margen.abajo;

  const maximo = Math.max(
    1,
    ...serie.map((p) => Math.max(Number(p.recibidas ?? 0), Number(p.entregadas ?? 0))),
  );
  const tope = Math.ceil(maximo / 2) * 2;

  const x = (i) => margen.izquierda + (serie.length === 1 ? anchoTrama / 2 : (anchoTrama * i) / (serie.length - 1));
  const y = (v) => margen.arriba + altoTrama - (altoTrama * Number(v ?? 0)) / tope;

  const crear = (etiqueta, atributos) => {
    const nodo = document.createElementNS(SVG, etiqueta);
    for (const [k, v] of Object.entries(atributos)) nodo.setAttribute(k, v);
    return nodo;
  };

  const svg = crear('svg', {
    class: 'grafico', viewBox: `0 0 ${ancho} ${alto}`, preserveAspectRatio: 'xMidYMid meet', role: 'img',
  });

  // Líneas de horizontales con su valor, para leer el eje sin hover.
  for (let paso = 0; paso <= 4; paso += 1) {
    const valor = Math.round((tope / 4) * (4 - paso));
    const py = margen.arriba + (altoTrama * paso) / 4;
    svg.append(crear('line', {
      class: 'grafico__rejilla', x1: margen.izquierda, x2: ancho - margen.derecha, y1: py, y2: py,
    }));
    const texto = crear('text', { class: 'grafico__eje', x: margen.izquierda - 6, y: py + 3, 'text-anchor': 'end' });
    texto.textContent = valor;
    svg.append(texto);
  }

  // Etiquetas del eje horizontal: primera, última y una de cada tres.
  serie.forEach((punto, i) => {
    if (i !== 0 && i !== serie.length - 1 && i % 3 !== 0) return;
    const texto = crear('text', { class: 'grafico__eje', x: x(i), y: alto - 8, 'text-anchor': 'middle' });
    texto.textContent = new Date(`${punto.dia}T00:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
    svg.append(texto);
  });

  const trazos = [
    { campo: 'recibidas', color: '#1d4ed8' },
    { campo: 'entregadas', color: '#047857' },
  ];

  for (const trazo of trazos) {
    const puntos = serie.map((p, i) => [x(i), y(p[trazo.campo])]);
    const camino = puntos.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');

    const base = margen.arriba + altoTrama;
    svg.append(crear('path', {
      class: 'grafico__area',
      fill: trazo.color,
      d: `${camino} L${puntos.at(-1)[0].toFixed(1)},${base} L${puntos[0][0].toFixed(1)},${base} Z`,
    }));
    svg.append(crear('path', { class: 'grafico__linea', stroke: trazo.color, d: camino }));

    puntos.forEach(([px, py], i) => {
      const punto = crear('circle', { class: 'grafico__punto', cx: px, cy: py, r: 3.5, fill: trazo.color });
      const dia = new Date(`${serie[i].dia}T00:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
      const rotulo = crear('title', {});
      rotulo.textContent = `${dia} · ${trazo.campo === 'recibidas' ? 'Recibidas' : 'Entregadas'}: ${serie[i][trazo.campo]}`;
      punto.append(rotulo);
      svg.append(punto);
    });
  }

  return svg;
}

function panelAccesos(d) {
  const acciones = [
    { icono: '✚', texto: 'Nueva orden de servicio', nota: 'Registrar equipo y diagnóstico', hash: '#/ordenes', color: '' },
    { icono: '☺', texto: 'Nuevo cliente', nota: `${numero(d.clientes_totales ?? 0)} clientes en cartera`, hash: '#/clientes', color: 'verde' },
    { icono: '⬓', texto: 'Ingresar repuesto', nota: `${numero(d.repuestos_por_reponer ?? 0)} referencias por reponer`, hash: '#/inventario', color: 'ambar' },
    { icono: '▤', texto: 'Reporte de caja', nota: `${dinero(d.ingresos_mes ?? 0)} ingresos del mes`, hash: '#/reportes', color: 'rojo' },
  ];

  return el('section', { class: 'panel-tablero' },
    el('h3', { class: 'panel-tablero__titulo' }, 'Acciones rápidas'),
    el('div', { class: 'accesos' }, acciones.map((accion) =>
      el('button', { class: 'acceso', type: 'button', onclick: () => { location.hash = accion.hash; } },
        el('span', { class: `acceso__icono ${accion.color ? `acceso__icono--${accion.color}` : ''}` }, accion.icono),
        el('span', { class: 'acceso__texto' },
          el('strong', {}, accion.texto),
          el('span', {}, accion.nota),
        ),
        el('span', { class: 'acceso__flecha' }, '›'),
      ),
    )),
  );
}

/* --------------------------------------------------------------------------
   Órdenes recientes y alertas
   -------------------------------------------------------------------------- */

function panelOrdenesRecientes(d) {
  const recientes = d.ordenes_recientes ?? [];

  return el('section', { class: 'panel-tablero' },
    el('div', { class: 'panel-tablero__cabeza' },
      el('h3', { class: 'panel-tablero__titulo' }, 'Actividad reciente'),
      el('button', {
        class: 'boton boton--fantasma boton--chico', type: 'button',
        style: 'margin-left:auto', onclick: () => { location.hash = '#/ordenes'; },
      }, 'Ver todas las órdenes'),
    ),
    tabla([
      { titulo: 'N.º', campo: 'numero', clase: 'negrita' },
      {
        titulo: 'Cliente', campo: 'cliente',
        render: (f) => el('div', {},
          el('div', {}, f.cliente ?? '—'),
          el('div', { class: 'texto-pequeno' }, `${f.equipo ?? ''} ${f.equipo_tipo ? `· ${f.equipo_tipo}` : ''}`),
        ),
      },
      { titulo: 'Técnico', campo: 'tecnico' },
      {
        titulo: 'Estado', campo: 'estado',
        render: (f) => el('span', { class: `etiqueta etiqueta--${String(f.estado).toLowerCase()}` },
          String(f.estado).replace(/_/g, ' ')),
      },
      { titulo: 'Recepción', campo: 'fecha_recepcion', render: (f) => fecha(f.fecha_recepcion) },
      { titulo: 'Total', clase: 'numero', render: (f) => el('strong', {}, dinero(f.costo_final)) },
      {
        titulo: 'Saldo', clase: 'numero',
        render: (f) => (Number(f.saldo ?? 0) > 0
          ? el('span', { class: 'etiqueta etiqueta--deuda' }, dinero(f.saldo))
          : el('span', { class: 'etiqueta etiqueta--saldado' }, 'Saldado')),
      },
    ], recientes.slice(0, 5), { vacio: 'Aún no se han registrado órdenes' }),
  );
}

function panelAlertas(d) {
  const garantias = d.alertas_garantias ?? [];
  const stock = d.alertas_stock ?? [];
  const mensajes = d.alertas_mensajes ?? [];

  const fichas = [
    {
      clase: 'ambar', icono: '⏱', titulo: 'Garantías por vencer',
      conteo: d.garantias_por_vencer ?? garantias.length,
      hay: garantias.length > 0,
      vacio: 'Ninguna garantía vence en los próximos 15 días.',
      items: garantias.map((g) => ({
        titulo: `${g.numero} · ${g.cliente}`,
        detalle: `${g.equipo} — vence en ${g.dias_restantes} día(s)`,
      })),
      accion: { texto: 'Ver órdenes', hash: '#/ordenes' },
    },
    {
      clase: 'rojo', icono: '⚠', titulo: 'Stock bajo o agotado',
      conteo: (d.repuestos_por_reponer ?? 0) + (d.repuestos_agotados ?? 0),
      hay: stock.length > 0,
      vacio: 'Todas las referencias están sobre su mínimo.',
      items: stock.map((r) => ({
        titulo: r.nombre,
        detalle: `${r.stock} en stock · mínimo ${r.stock_minimo}${r.proveedor ? ` · ${r.proveedor}` : ''}`,
      })),
      accion: { texto: 'Reponer', hash: '#/inventario' },
    },
    {
      clase: 'azul', icono: '✉', titulo: 'Mensajes sin leer',
      conteo: d.mensajes_no_leidos ?? mensajes.length,
      hay: mensajes.length > 0,
      vacio: 'No hay mensajes pendientes de respuesta.',
      items: mensajes.map((m) => ({
        titulo: m.asunto ?? 'Sin asunto',
        detalle: `${m.cliente ?? 'Cliente'} · ${m.canal ?? '—'} · ${fechaHora(m.fecha_envio)}`,
      })),
      accion: { texto: 'Abrir bandeja', hash: '#/personal' },
    },
  ];

  return el('section', { class: 'panel-tablero' },
    el('div', { class: 'panel-tablero__cabeza' },
      el('h3', { class: 'panel-tablero__titulo' }, 'Alertas y seguimientos'),
      el('div', { class: 'leyenda' }, el('span', {}, el('i', { style: 'background:#b45309' }), 'Requieren atención')),
    ),
    el('div', { class: 'alertas' }, fichas.map((ficha) => {
      const visibles = ficha.items.slice(0, 3);

      return el('div', {},
        el('div', { class: `alerta-ficha alerta-ficha--${ficha.clase}` },
          el('span', { class: 'alerta-ficha__marca' }),
          el('div', { class: 'alerta-ficha__cuerpo' },
            el('strong', {}, `${ficha.icono} ${ficha.titulo}`),
            el('p', {}, ficha.hay ? `${visibles.length} de ${ficha.items.length} mostrados` : ficha.vacio),
          ),
          el('span', { class: 'alerta-ficha__conteo' }, numero(ficha.conteo)),
        ),

        ficha.hay
          ? el('div', { class: 'alertas' }, [
            ...visibles.map((item) => el('div', { class: 'alerta-ficha' },
              el('span', { class: 'alerta-ficha__marca' }),
              el('div', { class: 'alerta-ficha__cuerpo' },
                el('strong', {}, item.titulo),
                el('p', {}, item.detalle),
              ),
            )),
            el('button', {
              class: 'boton boton--fantasma boton--chico', type: 'button',
              onclick: () => { location.hash = ficha.accion.hash; },
            }, ficha.accion.texto),
          ])
          : null,
      );
    })),
  );
}

/* --------------------------------------------------------------------------
   Marcas y carga por técnico
   -------------------------------------------------------------------------- */

function panelMarcas(d) {
  const marcas = d.ordenes_por_marca ?? [];
  const total = marcas.reduce((suma, fila) => suma + Number(fila.total ?? 0), 0) || 1;
  const colores = ['#1d4ed8', '#047857', '#b45309', '#7c3aed', '#0891b2', '#ea580c', '#be123c', '#4d7c0f'];

  return el('section', { class: 'panel-tablero' },
    el('div', { class: 'panel-tablero__cabeza' },
      el('div', {},
        el('h3', { class: 'panel-tablero__titulo' }, 'Equipos por marca'),
        el('p', { class: 'panel-tablero__nota' }, `${numero(d.ordenes_totales ?? 0)} órdenes históricas`),
      ),
    ),
    marcas.length
      ? el('div', { class: 'barras' }, marcas.slice(0, 8).map((fila, i) => {
        const porcentaje = (Number(fila.total) / total) * 100;
        return el('div', { class: 'barra-fila' },
          el('span', { class: 'barra-fila__nombre' }, fila.marca ?? 'Sin marca'),
          el('span', { class: 'barra-fila__valor' }, `${numero(fila.total)} · ${numero(porcentaje, 1)}%`),
          el('div', { class: 'barra-fila__pista barra-carga' },
            el('div', {
              class: 'barra-carga__relleno',
              style: `width:${porcentaje.toFixed(1)}%;background:${colores[i % colores.length]}`,
            }),
          ),
        );
      }))
      : el('p', { class: 'panel-tablero__nota' }, 'Sin equipos registrados.'),
  );
}

/**
 * Reparto de órdenes por estado, dibujado como un anillo con segmentos de
 * circumference. Es el mismo dato de la tabla de estados pero donde de verdad
 * se mira: la proporción, no el número exacto.
 */
function panelEstados(d) {
  const estados = d.ordenes_por_estado ?? [];
  const total = estados.reduce((suma, fila) => suma + Number(fila.total ?? 0), 0);

  if (!total) {
    return el('section', { class: 'panel-tablero' },
      el('h3', { class: 'panel-tablero__titulo' }, 'Órdenes por estado'),
      el('p', { class: 'panel-tablero__nota' }, 'Sin órdenes registradas.'),
    );
  }

  const SVG = 'http://www.w3.org/2000/svg';
  const radio = 60;
  const circunferencia = 2 * Math.PI * radio;
  let acumulado = 0;

  const crear = (etiqueta, atributos) => {
    const nodo = document.createElementNS(SVG, etiqueta);
    for (const [k, v] of Object.entries(atributos)) nodo.setAttribute(k, v);
    return nodo;
  };

  const anillo = crear('svg', { class: 'anillo__lienzo', viewBox: '0 0 160 160' });
  anillo.append(crear('circle', { cx: 80, cy: 80, r: radio, fill: 'none', stroke: 'var(--gris-100)', 'stroke-width': 22 }));

  const segmentos = estados.map((fila) => {
    const fraccion = Number(fila.total ?? 0) / total;
    const nodo = crear('circle', {
      cx: 80, cy: 80, r: radio, fill: 'none',
      stroke: COLOR_ESTADO[fila.estado] ?? 'var(--gris-300)',
      'stroke-width': 22, 'stroke-dasharray': `${(fraccion * circunferencia).toFixed(2)} ${circunferencia.toFixed(2)}`,
      'stroke-dashoffset': (-acumulado * circunferencia).toFixed(2),
    });
    acumulado += fraccion;
    const rotulo = crear('title', {});
    rotulo.textContent = `${String(fila.estado).replace(/_/g, ' ')}: ${fila.total} (${(fraccion * 100).toFixed(1)}%)`;
    nodo.append(rotulo);
    return nodo;
  });
  segmentos.forEach((nodo) => anillo.append(nodo));

  return el('section', { class: 'panel-tablero' },
    el('div', { class: 'panel-tablero__cabeza' },
      el('div', {},
        el('h3', { class: 'panel-tablero__titulo' }, 'Órdenes por estado'),
        el('p', { class: 'panel-tablero__nota' }, `${numero(total)} órdenes en total`),
      ),
    ),
    el('div', { class: 'anillos' },
      el('div', { class: 'anillo' },
        el('div', { class: 'anillo__marco' },
          anillo,
          el('div', { class: 'anillo__centro' }, numero(d.ordenes_activas ?? 0),
            el('span', {}, 'activas')),
        ),
        el('div', { class: 'anillo__leyenda' }, estados.slice(0, 6).map((fila) =>
          el('div', { class: 'anillo__fila' },
            el('i', { style: `background:${COLOR_ESTADO[fila.estado] ?? 'var(--gris-300)'}` }),
            el('span', {}, String(fila.estado).replace(/_/g, ' ').toLowerCase()),
            el('b', {}, numero(fila.total)),
          ),
        )),
      ),
    ),
  );
}

function panelTecnicos(d) {
  const tecnicos = d.carga_por_tecnico ?? [];
  const maximo = Math.max(1, ...tecnicos.map((t) => Number(t.ordenes ?? 0)));

  return el('section', { class: 'panel-tablero' },
    el('div', { class: 'panel-tablero__cabeza' },
      el('div', {},
        el('h3', { class: 'panel-tablero__titulo' }, 'Carga por técnico'),
        el('p', { class: 'panel-tablero__nota' }, 'Regla RN-07: máximo 5 órdenes activas por técnico'),
      ),
    ),
    tecnicos.length
      ? el('div', { class: 'barras' }, tecnicos.map((t) => {
        const activas = Number(t.activas ?? 0);
        const nivel = activas >= 5 ? 'critico' : activas >= 3 ? 'alto' : '';
        return el('div', { class: 'barra-fila' },
          el('span', { class: 'barra-fila__nombre' }, t.nombre ?? '—'),
          el('span', { class: 'barra-fila__valor' },
            `${numero(activas)} activas · ${numero(t.entregadas ?? 0)} entregadas · ${numero(t.horas_promedio ?? 0, 1)} h`),
          el('div', { class: 'barra-fila__pista barra-carga' },
            el('div', {
              class: `barra-carga__relleno ${nivel}`,
              style: `width:${Math.max(3, (Number(t.ordenes ?? 0) / maximo) * 100).toFixed(1)}%`,
            }),
          ),
        );
      }))
      : el('p', { class: 'panel-tablero__nota' }, 'Sin técnicos con órdenes asignadas.'),
  );
}
