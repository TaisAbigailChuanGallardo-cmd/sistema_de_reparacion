/* ==========================================================================
   Modulo 2 - Clientes y Equipos
   RF-01 registro de clientes, RF-02 registro del equipo con su falla y RF-09
   historial de ordenes y equipos por cliente.
   ========================================================================== */

import { api } from '../api.js';
import {
  $, el, tabla, seccion, tarjetas, vacio, dinero, numero, fecha,
  cargarYAvisar, abrirModal, cerrarModal, panelFormulario, campo,
  confirmar, exito, fallo, legible,
} from '../ui.js';

let catalogos = { tipo_documento: [], tipo_equipo: [], marcas: [] };
let clientes = [];
let equipos = [];

export async function iniciar(raiz) {
  raiz.replaceChildren(el('div', { class: 'cargando' }, 'Cargando informacion...'));
  [catalogos, clientes, equipos] = await Promise.all([
    api.get('/catalogos'),
    api.get('/clientes', { limite: 200 }),
    api.get('/equipos', { limite: 200 }),
  ]);
  raiz.replaceChildren(construir());
  return raiz;
}

/* --------------------------------------------------------------------------
   Listado
   -------------------------------------------------------------------------- */

function construir() {
  const contenedor = el('div', {});

  const buscador = el('input', {
    class: 'campo__control', type: 'search', placeholder: 'Buscar por nombre, documento o telefono...',
  });
  buscador.addEventListener('input', () => pintarClientes(buscador.value));

  const buscadorEquipo = el('input', {
    class: 'campo__control', type: 'search', placeholder: 'Buscar equipo por marca, modelo o serie...',
  });
  buscadorEquipo.addEventListener('input', () => pintarEquipos(buscadorEquipo.value));

  contenedor.append(
    resumen(),
    el('div', { class: 'encabezado-modulo' },
      el('div', { class: 'encabezado-modulo__filtros' },
        el('label', { class: 'campo mb-0' }, el('span', { class: 'campo__etiqueta' }, 'Buscar cliente'), buscador),
        el('label', { class: 'campo mb-0' }, el('span', { class: 'campo__etiqueta' }, 'Buscar equipo'), buscadorEquipo),
      ),
      el('button', { class: 'boton boton--primario', onclick: formularioCliente }, '+ Nuevo cliente'),
      el('button', { class: 'boton boton--fantasma', onclick: formularioEquipo }, 'Registrar equipo'),
    ),
  );

  const tablaClientes = seccion('Clientes',
    el('p', { class: 'panel-tablero__nota', id: 'conteo-clientes' }),
    el('div', { id: 'lista-clientes' }));
  const tablaEquipos = seccion('Equipos registrados', el('div', { id: 'lista-equipos' }));

  contenedor.append(tablaClientes, tablaEquipos);
  pintarClientes();
  pintarEquipos();
  return contenedor;
}

/** Cifras de cabecera: dan el contexto de la cartera antes de la tabla. */
function resumen() {
  const activos = equipos.filter((e) => e.estado !== 'DE_BAJA').length;
  const deBaja = equipos.length - activos;
  const sinCorreo = clientes.filter((c) => !c.email).length;
  const porCliente = equipos.reduce((mapa, e) => {
    mapa[e.cliente_nombre] = (mapa[e.cliente_nombre] ?? 0) + 1;
    return mapa;
  }, {});
  const conMasEquipos = Object.entries(porCliente).sort((a, b) => b[1] - a[1])[0];

  return tarjetas([
    { etiqueta: 'Clientes registrados', valor: numero(clientes.length), nota: `${numero(sinCorreo)} sin correo de contacto` },
    { etiqueta: 'Equipos en taller', valor: numero(activos), color: 'ambar', nota: `${numero(deBaja)} dados de baja` },
    { etiqueta: 'Equipos por cliente', valor: conMasEquipos ? numero(conMasEquipos[1]) : '0', color: 'verde', nota: conMasEquipos ? `máximo en ${conMasEquipos[0]}` : 'sin equipos asignados' },
    { etiqueta: 'Documentos únicos', valor: numero(new Set(clientes.map((c) => c.numero_documento)).size), nota: 'validados por el trigger de la base' },
  ]);
}

function pintarClientes(filtro = '') {
  const destino = $('#lista-clientes');
  if (!destino) return;

  const texto = filtro.trim().toLowerCase();
  const filtrados = clientes.filter((c) => [c.nombre, c.numero_documento, c.telefono, c.email]
    .some((campo) => String(campo ?? '').toLowerCase().includes(texto)));

  const conteo = $('#conteo-clientes');
  if (conteo) {
    conteo.textContent = filtro.trim()
      ? `${filtrados.length} de ${clientes.length} clientes coinciden con "${filtro.trim()}"`
      : `${clientes.length} clientes en cartera`;
  }

  destino.replaceChildren(filtrados.length
    ? tabla([
        { titulo: 'Codigo', campo: 'codigo' },
        { titulo: 'Cliente', campo: 'nombre' },
        { titulo: 'Documento', render: (f) => `${f.tipo_documento}: ${f.numero_documento}` },
        { titulo: 'Telefono', campo: 'telefono' },
        { titulo: 'Correo', campo: 'email' },
        { titulo: 'Registro', render: (f) => fecha(f.created_at) },
        {
          titulo: 'Acciones',
          render: (f) => el('div', { class: 'boton--fila' },
            el('button', { class: 'boton boton--chico', onclick: () => verCliente(f.id_cliente) }, 'Historial'),
            el('button', { class: 'boton boton--chico boton--fantasma', onclick: () => editarCliente(f) }, 'Editar'),
          ),
        },
      ], filtrados)
    : vacio('No hay clientes que coincidan con la busqueda', '☺'));
}

function pintarEquipos(filtro = '') {
  const destino = $('#lista-equipos');
  if (!destino) return;

  const texto = filtro.trim().toLowerCase();
  const filtrados = equipos.filter((e) => [e.marca, e.modelo, e.numero_serie, e.tipo, e.cliente_nombre]
    .some((campo) => String(campo ?? '').toLowerCase().includes(texto)));

  destino.replaceChildren(filtrados.length
    ? tabla([
        { titulo: 'Codigo', campo: 'codigo' },
        { titulo: 'Cliente', campo: 'cliente_nombre' },
        { titulo: 'Tipo', render: (f) => legible(f.tipo) },
        { titulo: 'Marca', campo: 'marca' },
        { titulo: 'Modelo', campo: 'modelo' },
        { titulo: 'Serie', campo: 'numero_serie' },
        { titulo: 'Estado', render: (f) => el('span', { class: `etiqueta ${f.estado === 'DE_BAJA' ? 'etiqueta--inactivo' : 'etiqueta--activo'}` }, legible(f.estado)) },
        { titulo: 'Acciones', render: (f) => el('button', { class: 'boton boton--chico', onclick: () => verEquipo(f.id_equipo) }, 'Ordenes') },
      ], filtrados)
    : vacio('Todavia no hay equipos registrados', '▣'));
}

/* --------------------------------------------------------------------------
   Formularios
   -------------------------------------------------------------------------- */

function formularioCliente(clienteExistente = null) {
  const formulario = panelFormulario({
    textoEnviar: clienteExistente ? 'Guardar cambios' : 'Registrar cliente',
    campos: [
      campo({ etiqueta: 'Codigo', nombre: 'codigo', valor: clienteExistente?.codigo ?? '', ayuda: 'Se genera si se deja vacio' }),
      campo({ etiqueta: 'Tipo de documento', nombre: 'tipo_documento', tipo: 'select', valor: clienteExistente?.tipo_documento ?? '', opciones: catalogos.tipo_documento }),
      campo({ etiqueta: 'Numero de documento', nombre: 'numero_documento', valor: clienteExistente?.numero_documento ?? '', requerido: true }),
      campo({ etiqueta: 'Nombre o razon social', nombre: 'nombre', valor: clienteExistente?.nombre ?? '', requerido: true }),
      campo({ etiqueta: 'Telefono', nombre: 'telefono', valor: clienteExistente?.telefono ?? '', requerido: true }),
      campo({ etiqueta: 'Correo', nombre: 'email', tipo: 'email', valor: clienteExistente?.email ?? '' }),
      campo({ etiqueta: 'Direccion', nombre: 'direccion', valor: clienteExistente?.direccion ?? '' }),
    ],
    alEnviar: async (datos) => {
      if (clienteExistente) {
        await api.put(`/clientes/${clienteExistente.id_cliente}`, datos);
        exito('Cliente actualizado');
      } else {
        await api.post('/clientes', datos);
        exito('Cliente registrado');
      }
      cerrarModal();
      await recargar();
    },
  });

  abrirModal(clienteExistente ? 'Editar cliente' : 'Nuevo cliente', formulario);
}

function formularioEquipo() {
  if (!clientes.length) {
    fallo('Primero registre al menos un cliente');
    return;
  }

  const formulario = panelFormulario({
    textoEnviar: 'Registrar equipo',
    campos: [
      campo({
        etiqueta: 'Cliente', nombre: 'id_cliente', tipo: 'select', requerido: true,
        opciones: clientes.map((c) => ({ valor: c.id_cliente, texto: `${c.nombre} (${c.numero_documento})` })),
      }),
      campo({ etiqueta: 'Tipo de equipo', nombre: 'tipo', tipo: 'select', opciones: catalogos.tipo_equipo, requerido: true }),
      // La marca sugiere las del catalogo pero admite escribir una nueva: el
      // taller recibe equipos de marcas que aun no estan en el sistema.
      // Un select aqui las dejaria fuera para siempre.
      campo({
        etiqueta: 'Marca', nombre: 'marca', tipo: 'datalist', requerido: true,
        opciones: catalogos.marcas ?? [],
        ayuda: 'Elige una del catalogo o escribe una nueva',
      }),
      campo({ etiqueta: 'Modelo', nombre: 'modelo', requerido: true }),
      campo({ etiqueta: 'Numero de serie', nombre: 'numero_serie', requerido: true }),
      campo({ etiqueta: 'Falla reportada', nombre: 'falla_reportada', ancho: true, ayuda: 'Lo que cuenta el cliente al dejar el equipo' }),
    ],
    alEnviar: async (datos) => {
      await api.post('/equipos', { ...datos, id_cliente: Number(datos.id_cliente) });
      exito('Equipo registrado');
      cerrarModal();
      await recargar();
    },
  });

  abrirModal('Registrar equipo', formulario);
}

function editarCliente(cliente) {
  formularioCliente(cliente);
}

/* --------------------------------------------------------------------------
   Consultas de detalle
   -------------------------------------------------------------------------- */

async function verCliente(id) {
  const datos = await cargarYAvisar('Cargando historial...', () => api.get(`/clientes/${id}`));
  if (!datos) return;

  const { cliente, ...resto } = datos;
  const contenido = el('div', { class: 'pila' });

  contenido.append(
    seccion('Datos del cliente', el('div', { class: 'rejilla' },
      dato('Codigo', cliente.codigo),
      dato('Documento', `${cliente.tipo_documento}: ${cliente.numero_documento}`),
      dato('Nombre', cliente.nombre),
      dato('Telefono', cliente.telefono),
      dato('Correo', cliente.email),
      dato('Direccion', cliente.direccion),
    )),
  );

  contenido.append(seccion('Equipos del cliente',
    tabla([
      { titulo: 'Codigo', campo: 'codigo' },
      { titulo: 'Tipo', render: (f) => legible(f.tipo) },
      { titulo: 'Marca / Modelo', render: (f) => `${f.marca} ${f.modelo}` },
      { titulo: 'Serie', campo: 'numero_serie' },
      { titulo: 'Estado', render: (f) => legible(f.estado) },
    ], resto.equipos ?? [], { vacio: 'El cliente aun no registro equipos' }),
  ));

  contenido.append(seccion('Historial de ordenes',
    tabla([
      { titulo: 'Numero', campo: 'numero' },
      { titulo: 'Equipo', campo: 'equipo' },
      { titulo: 'Estado', render: (f) => legible(f.estado) },
      { titulo: 'Total', clase: 'numero', render: (f) => dinero(f.costo_final) },
      { titulo: 'Recepcion', render: (f) => fecha(f.fecha_recepcion) },
    ], resto.ordenes ?? [], { vacio: 'El cliente aun no tiene ordenes de servicio' }),
  ));

  abrirModal(`Ficha de ${cliente.nombre}`, contenido);
}

async function verEquipo(id) {
  const datos = await cargarYAvisar('Cargando ordenes...', () => api.get(`/equipos/${id}`));
  if (!datos) return;

  const contenido = el('div', { class: 'pila' });
  const { equipo, ordenes } = datos;

  contenido.append(
    seccion('Datos del equipo', el('div', { class: 'rejilla' },
      dato('Codigo', equipo.codigo),
      dato('Tipo', legible(equipo.tipo)),
      dato('Marca', equipo.marca),
      dato('Modelo', equipo.modelo),
      dato('Serie', equipo.numero_serie),
      dato('Estado', legible(equipo.estado)),
      dato('Falla reportada', equipo.falla_reportada),
    )),
  );

  contenido.append(
    seccion('Ataque historico (reparaciones previas)',
      tabla([
        { titulo: 'Numero', campo: 'numero' },
        { titulo: 'Falla', campo: 'falla_reportada' },
        { titulo: 'Diagnostico', campo: 'diagnostico' },
        { titulo: 'Solucion', campo: 'solucion' },
        { titulo: 'Total', clase: 'numero', render: (f) => dinero(f.costo_final) },
      ], ordenes ?? [], { vacio: 'Este equipo solo tiene la orden actual' }),
    ),
  );

  if (ordenes?.length > 1) {
    contenido.append(el('div', { class: 'acciones-modal' },
      el('button', {
        class: 'boton boton--peligro',
        onclick: async () => {
          const acepta = await confirmar('Marcar este equipo como dado de baja lo retira de los equipos activos. Continuar?');
          if (!acepta) return;
          try {
            await api.put(`/equipos/${id}`, { estado: 'DE_BAJA' });
            exito('Equipo dado de baja');
            cerrarModal();
            await recargar();
          } catch (error) { fallo(error.message); }
        },
      }, 'Dar de baja el equipo'),
    ));
  }

  abrirModal(`Equipo ${equipo.codigo}`, contenido);
}

/* --------------------------------------------------------------------------
   Utilidades del modulo
   -------------------------------------------------------------------------- */

const dato = (clave, valor) => el('div', { class: 'dato' },
  el('span', { class: 'dato__clave' }, clave),
  el('span', { class: 'dato__valor' }, valor ?? '—'),
);

async function recargar() {
  [clientes, equipos] = await Promise.all([
    api.get('/clientes', { limite: 200 }),
    api.get('/equipos', { limite: 200 }),
  ]);
  const raiz = $('#contenido');
  raiz.replaceChildren(construir());
}
