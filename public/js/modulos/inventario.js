/* ==========================================================================
   Modulo 4 - Inventario
   Repuestos y su control de stock (RF-04 y RF-06), proveedores y registro de
   egresos: compras de repuestos y gastos operativos.
   ========================================================================== */

import { api } from '../api.js';
import {
  $, el, tabla, seccion, tarjetas, vacio, dinero, numero, legible,
  abrirModal, cerrarModal, panelFormulario, campo, exito, fallo,
} from '../ui.js';

let repuestos = [];
let proveedores = [];
let catalogos = {};

export async function iniciar(raiz) {
  raiz.replaceChildren(el('div', { class: 'cargando' }, 'Cargando inventario...'));
  [repuestos, proveedores, catalogos] = await Promise.all([
    api.get('/inventario/repuestos', { limite: 300 }),
    api.get('/inventario/proveedores'),
    api.get('/catalogos/inventario'),
  ]);
  raiz.replaceChildren(construir());
  return raiz;
}

function construir() {
  const contenedor = el('div', {});
  // Un booleano no alcanza: "agotado" (stock 0) es un subconjunto de "por
  // reponer" (stock <= minimo), asi que con un flag los dos chips filtraban
  // exactamente lo mismo. El filtro es un modo con tres valores.
  let modoFiltro = 'TODOS';

  const buscador = el('input', { class: 'campo__control', type: 'search', placeholder: 'Buscar por codigo, nombre o marca...' });
  const pintar = () => pintarRepuestos(buscador.value, modoFiltro);
  buscador.addEventListener('input', pintar);

  const esAgotado = (r) => Number(r.stock) === 0;
  const esCritico = (r) => Number(r.stock) > 0 && Number(r.stock) <= Number(r.stock_minimo);

  // Los tres buckets son disjuntos, asi que los KPI y los chips cuentan lo mismo.
  const agotados = repuestos.filter(esAgotado);
  const criticos = repuestos.filter(esCritico);
  const valorInventario = repuestos.reduce((suma, r) => suma + Number(r.stock) * Number(r.costo_unitario), 0);

  const chip = (texto, modo, activoInicial = false) => el('button', {
    class: `chip ${activoInicial ? 'chip--activo' : ''}`, type: 'button',
    onclick: (e) => {
      modoFiltro = modo;
      contenedor.querySelectorAll('.chip').forEach((c) => c.classList.remove('chip--activo'));
      e.currentTarget.classList.add('chip--activo');
      pintar();
    },
  }, texto);

  const chipTodos = chip('Todos', 'TODOS', true);
  const chipCriticos = chip('Stock critico', 'CRITICOS');
  const chipAgotados = chip('Agotados', 'AGOTADOS');

  contenedor.append(
    el('div', { class: 'encabezado-modulo' },
      el('div', { class: 'encabezado-modulo__filtros' },
        el('label', { class: 'campo mb-0' }, el('span', { class: 'campo__etiqueta' }, 'Buscar repuesto'), buscador),
      ),
      el('button', { class: 'boton boton--primario', onclick: formularioRepuesto }, '+ Nuevo repuesto'),
      el('button', { class: 'boton boton--fantasma', onclick: formularioProveedor }, 'Nuevo proveedor'),
      el('button', { class: 'boton boton--fantasma', onclick: formularioEgreso }, 'Registrar egreso'),
    ),
  );

  contenedor.append(tarjetas([
    { etiqueta: 'Repuestos en catalogo', valor: numero(repuestos.length) },
    { etiqueta: 'Valor del inventario', valor: dinero(valorInventario), color: 'verde', nota: 'Stock actual x costo unitario' },
    { etiqueta: 'Stock critico', valor: numero(criticos.length), color: criticos.length ? 'ambar' : 'verde', nota: 'Con existencias, en o por debajo del minimo' },
    { etiqueta: 'Agotados', valor: numero(agotados.length), color: agotados.length ? 'rojo' : 'verde', nota: 'Sin existencias' },
  ]));

  contenedor.append(el('div', { class: 'chips' }, [chipTodos, chipCriticos, chipAgotados]));
  contenedor.append(seccion('Repuestos', el('div', { id: 'lista-repuestos' })));
  contenedor.append(seccion('Proveedores', el('div', { id: 'lista-proveedores' })));

  pintar();
  pintarProveedores();
  return contenedor;
}

function pintarRepuestos(filtro = '', modoFiltro = 'TODOS') {
  const destino = $('#lista-repuestos');
  if (!destino) return;

  const texto = filtro.trim().toLowerCase();
  const filtrados = repuestos
    .filter((r) => [r.codigo, r.nombre, r.marca, r.categoria]
      .some((campo) => String(campo ?? '').toLowerCase().includes(texto)))
    .filter((r) => {
      if (modoFiltro === 'TODOS') return true;
      if (modoFiltro === 'AGOTADOS') return Number(r.stock) === 0;
      if (modoFiltro === 'CRITICOS') return Number(r.stock) > 0 && Number(r.stock) <= Number(r.stock_minimo);
      return true;
    });

  destino.replaceChildren(filtrados.length
    ? tabla([
        { titulo: 'Codigo', campo: 'codigo', clase: 'negrita' },
        { titulo: 'Repuesto', campo: 'nombre' },
        { titulo: 'Marca', campo: 'marca' },
        { titulo: 'Categoria', render: (f) => legible(f.categoria) },
        { titulo: 'Nivel de stock', render: (f) => barraStock(f) },
        { titulo: 'Minimo', campo: 'stock_minimo', clase: 'numero' },
        { titulo: 'Costo unit.', clase: 'numero', render: (f) => dinero(f.costo_unitario) },
        { titulo: 'Valor', clase: 'numero', render: (f) => dinero(Number(f.stock) * Number(f.costo_unitario)) },
        { titulo: 'Proveedor', campo: 'proveedor' },
      ], filtrados)
    : vacio('No hay repuestos que coincidan con el filtro', '▣'));
}

/**
 * Barra de nivel: el minimo se marca con una linea vertical para que se vea de
 * un vistazo no solo cuanto hay, sino si falta y cuanto.
 */
function barraStock(repuesto) {
  const stock = Number(repuesto.stock ?? 0);
  const minimo = Number(repuesto.stock_minimo ?? 0);
  const referencia = Math.max(stock, minimo * 2, 1);
  const nivel = stock === 0 ? 'critico' : stock <= minimo ? 'alto' : '';

  return el('div', { class: 'stock' },
    el('span', { class: `etiqueta ${stock === 0 ? 'etiqueta--cancelado' : stock <= minimo ? 'etiqueta--presupuestado' : 'etiqueta--activo'}` },
      `${stock} und.`),
    el('div', { class: 'barra-carga' },
      el('div', {
        class: `barra-carga__relleno ${nivel}`,
        style: `width:${((stock / referencia) * 100).toFixed(1)}%`,
      }),
      minimo > 0 ? el('span', { class: 'stock__minimo', style: `left:${((minimo / referencia) * 100).toFixed(1)}%` }) : null,
    ),
  );
}

function pintarProveedores() {
  const destino = $('#lista-proveedores');
  if (!destino) return;

  destino.replaceChildren(proveedores.length
    ? tabla([
        { titulo: 'RUC', campo: 'ruc' },
        { titulo: 'Razon social', campo: 'razon_social' },
        { titulo: 'Contacto', campo: 'contacto' },
        { titulo: 'Telefono', campo: 'telefono' },
        { titulo: 'Correo', campo: 'email' },
      ], proveedores)
    : vacio('Todavia no hay proveedores registrados', '▤'));
}

/* --------------------------------------------------------------------------
   Formularios
   -------------------------------------------------------------------------- */

function formularioRepuesto() {
  const formulario = panelFormulario({
    textoEnviar: 'Registrar repuesto',
    campos: [
      campo({ etiqueta: 'Codigo', nombre: 'codigo', ayuda: 'Se genera si se deja vacio' }),
      campo({ etiqueta: 'Nombre del repuesto', nombre: 'nombre', requerido: true }),
      campo({ etiqueta: 'Marca', nombre: 'marca' }),
      campo({ etiqueta: 'Categoria', nombre: 'categoria', ayuda: 'Ejemplo: Pantalla, Bateria, Conector' }),
      campo({ etiqueta: 'Stock inicial', nombre: 'stock', tipo: 'number', valor: 0, attrs: { min: '0', step: '1' } }),
      campo({ etiqueta: 'Stock minimo', nombre: 'stock_minimo', tipo: 'number', valor: 0, attrs: { min: '0', step: '1' }, ayuda: 'Aviso de reposicion' }),
      campo({ etiqueta: 'Costo unitario', nombre: 'costo_unitario', tipo: 'number', attrs: { min: '0', step: '0.01' }, requerido: true }),
      campo({
        etiqueta: 'Proveedor', nombre: 'id_proveedor', tipo: 'select',
        opciones: proveedores.map((p) => ({ valor: p.id_proveedor, texto: p.razon_social })),
      }),
    ],
    alEnviar: async (datos) => {
      const cuerpo = { ...datos, costo_unitario: Number(datos.costo_unitario) };
      if (datos.stock !== '') cuerpo.stock = Number(datos.stock);
      if (datos.stock_minimo !== '') cuerpo.stock_minimo = Number(datos.stock_minimo);
      if (datos.id_proveedor) cuerpo.id_proveedor = Number(datos.id_proveedor);
      await api.post('/inventario/repuestos', cuerpo);
      exito('Repuesto registrado');
      cerrarModal();
      await recargar();
    },
  });

  abrirModal('Registrar repuesto', formulario);
}

function formularioProveedor() {
  const formulario = panelFormulario({
    textoEnviar: 'Registrar proveedor',
    campos: [
      campo({ etiqueta: 'RUC', nombre: 'ruc', requerido: true }),
      campo({ etiqueta: 'Razon social', nombre: 'razon_social', requerido: true }),
      campo({ etiqueta: 'Persona de contacto', nombre: 'contacto' }),
      campo({ etiqueta: 'Telefono', nombre: 'telefono' }),
      campo({ etiqueta: 'Correo', nombre: 'email', tipo: 'email' }),
      campo({ etiqueta: 'Direccion', nombre: 'direccion', ancho: true }),
    ],
    alEnviar: async (datos) => {
      await api.post('/inventario/proveedores', datos);
      exito('Proveedor registrado');
      cerrarModal();
      await recargar();
    },
  });

  abrirModal('Registrar proveedor', formulario);
}

function formularioEgreso() {
  const formulario = panelFormulario({
    textoEnviar: 'Registrar egreso',
    campos: [
      campo({ etiqueta: 'Concepto del gasto', nombre: 'concepto', requerido: true, ancho: true, ayuda: 'Compra de repuestos, alquiler, servicios...' }),
      campo({ etiqueta: 'Monto', nombre: 'monto', tipo: 'number', requerido: true, attrs: { min: '0.01', step: '0.01' } }),
      campo({
        etiqueta: 'Categoria', nombre: 'categoria', tipo: 'select',
        opciones: catalogos.categoria_movimiento ?? [],
      }),
      campo({
        etiqueta: 'Proveedor', nombre: 'id_proveedor', tipo: 'select',
        opciones: proveedores.map((p) => ({ valor: p.id_proveedor, texto: p.razon_social })),
        ayuda: 'Obligatorio en gastos operativos y compras',
      }),
      campo({ etiqueta: 'Numero de comprobante', nombre: 'comprobante' }),
    ],
    alEnviar: async (datos) => {
      const cuerpo = { ...datos, monto: Number(datos.monto) };
      if (datos.id_proveedor) cuerpo.id_proveedor = Number(datos.id_proveedor);
      await api.post('/inventario/egresos', cuerpo);
      exito('Egreso registrado');
      cerrarModal();
    },
  });

  abrirModal('Registrar egreso', formulario);
}

async function recargar() {
  repuestos = await api.get('/inventario/repuestos', { limite: 300 });
  const raiz = $('#contenido');
  raiz.replaceChildren(construir());
}
