/* ==========================================================================
   Modulo 5 - Personal y Mensajes
   Tecnicos con su carga de trabajo (RN-07), usuarios del sistema con su rol
   (RNF-02), planes y suscripciones, y la bitacora de comunicacion con el
   cliente.
   ========================================================================== */

import { api, sesion } from '../api.js';
import {
  $, el, tabla, seccion, tarjetas, dinero, numero, fecha, fechaHora, legible,
  abrirModal, cerrarModal, panelFormulario, campo, exito, fallo,
} from '../ui.js';

let tecnicos = [];
let usuarios = [];
let planes = [];
let suscripciones = [];
let mensajes = [];
let clientes = [];

export async function iniciar(raiz) {
  raiz.replaceChildren(el('div', { class: 'cargando' }, 'Cargando personal...'));
  [tecnicos, usuarios, planes, suscripciones, mensajes, clientes] = await Promise.all([
    api.get('/tecnicos'),
    api.get('/usuarios'),
    api.get('/planes'),
    api.get('/planes/suscripciones'),
    api.get('/mensajes', { limite: 50 }),
    api.get('/clientes', { limite: 200 }),
  ]);
  raiz.replaceChildren(construir());
  return raiz;
}

function construir() {
  const contenedor = el('div', {});

  const SECCIONES = [
    { valor: 'tecnicos', texto: 'Técnicos' },
    { valor: 'usuarios', texto: 'Usuarios y roles' },
    { valor: 'planes', texto: 'Planes y suscripciones' },
    { valor: 'mensajes', texto: 'Mensajes al cliente' },
  ];

  const cuerpo = el('div', { id: 'cuerpo-personal' });
  const pestanas = el('div', { class: 'pestanas', role: 'tablist' });

  const mostrar = (valor) => {
    SECCIONES.forEach((s) => {
      const nodo = pestanas.querySelector(`[data-seccion="${s.valor}"]`);
      const activo = s.valor === valor;
      nodo.classList.toggle('pestana--activa', activo);
      nodo.setAttribute('aria-selected', String(activo));
    });
    cuerpo.replaceChildren(vistaSeleccionada(valor));
  };

  SECCIONES.forEach((s) => pestanas.append(
    el('button', {
      class: 'pestana', type: 'button', role: 'tab', datos: { seccion: s.valor },
      onclick: () => mostrar(s.valor),
    }, s.texto),
  ));

  contenedor.append(
    el('div', { class: 'encabezado-modulo' },
      el('div', { class: 'encabezado-modulo__filtros' }),
      el('button', { class: 'boton boton--primario', onclick: formularioTecnico }, '+ Nuevo técnico'),
      el('button', { class: 'boton boton--fantasma', onclick: formularioMensaje }, 'Enviar mensaje'),
    ),
    tarjetas([
      { etiqueta: 'Tecnicos activos', valor: numero(tecnicos.filter((t) => Number(t.activo)).length), color: 'verde' },
      { etiqueta: 'Ordenes activas asignadas', valor: numero(tecnicos.reduce((s, t) => s + Number(t.ordenes_activas ?? 0), 0)), color: 'ambar', nota: 'Suma de la carga actual (RN-07)' },
      { etiqueta: 'Usuarios del sistema', valor: numero(usuarios.length) },
      { etiqueta: 'Mensajes no leidos', valor: numero(mensajes.filter((m) => !Number(m.leido)).length), color: 'rojo' },
    ]),
    pestanas,
    cuerpo,
  );

  mostrar('tecnicos');
  return contenedor;
}

function vistaSeleccionada(seccionActual) {
  return {
    tecnicos: vistaTecnicos,
    usuarios: vistaUsuarios,
    planes: vistaPlanes,
    mensajes: vistaMensajes,
  }[seccionActual]();
}

/* --------------------------------------------------------------------------
   Tecnicos
   -------------------------------------------------------------------------- */

function vistaTecnicos() {
  return seccion('Tecnicos y carga de trabajo (RN-07)',
    tabla([
      { titulo: 'Codigo', campo: 'codigo' },
      { titulo: 'Nombre', campo: 'nombre' },
      { titulo: 'Especialidad', campo: 'especialidad' },
      { titulo: 'Telefono', campo: 'telefono' },
      { titulo: 'Activas', clase: 'numero', render: (f) => `${f.ordenes_activas ?? 0} / ${f.maximo_permitido ?? 5}` },
      { titulo: 'Ocupacion', render: (f) => barraCarga(f) },
      { titulo: 'Listas para entregar', clase: 'numero', render: (f) => f.ordenes_listas ?? 0 },
      { titulo: 'Estado', render: (f) => el('span', { class: `etiqueta ${Number(f.activo) ? 'etiqueta--activo' : 'etiqueta--inactivo'}` }, Number(f.activo) ? 'Activo' : 'Inactivo') },
    ], tecnicos, { vacio: 'Todavia no hay tecnicos registrados' }),
  );
}

function barraCarga(tecnico) {
  const activas = Number(tecnico.ordenes_activas ?? 0);
  const maximo = Number(tecnico.maximo_permitido ?? 5) || 1;
  const porcentaje = Math.min(100, Math.round((activas / maximo) * 100));
  const nivel = porcentaje >= 100 ? 'critico' : (porcentaje >= 70 ? 'alto' : '');

  return el('div', { class: 'barra-carga', title: `${activas} de ${maximo} ordenes activas` },
    el('div', { class: `barra-carga__relleno ${nivel}`, style: `width: ${porcentaje}%` }),
  );
}

/* --------------------------------------------------------------------------
   Usuarios
   -------------------------------------------------------------------------- */

function vistaUsuarios() {
  return seccion('Usuarios del sistema (RNF-02)',
    tabla([
      { titulo: 'Nombre', campo: 'nombre' },
      { titulo: 'Correo', campo: 'email' },
      { titulo: 'Rol', campo: 'rol' },
      { titulo: 'Telefono', campo: 'telefono' },
      { titulo: 'Ultimo acceso', render: (f) => (f.ultimo_acceso ? fechaHora(f.ultimo_acceso) : 'Nunca') },
      { titulo: 'Estado', render: (f) => el('span', { class: `etiqueta ${f.estado === 'ACTIVO' ? 'etiqueta--activo' : 'etiqueta--inactivo'}` }, legible(f.estado)) },
    ], usuarios, { vacio: 'No hay usuarios registrados' }),
  );
}

/* --------------------------------------------------------------------------
   Planes y suscripciones
   -------------------------------------------------------------------------- */

function vistaPlanes() {
  const contenedor = el('div', { class: 'pila' });

  contenedor.append(
    seccion('Planes disponibles',
      tabla([
        { titulo: 'Codigo', campo: 'codigo' },
        { titulo: 'Plan', campo: 'nombre' },
        { titulo: 'Precio', clase: 'numero', render: (f) => dinero(f.precio) },
        { titulo: 'Periodicidad', render: (f) => legible(f.periodicidad) },
        { titulo: 'Beneficio', campo: 'beneficio' },
      ], planes, { vacio: 'No hay planes registrados' }),
    ),
  );

  contenedor.append(
    seccion('Suscripciones vigentes',
      tabla([
        { titulo: 'Usuario', campo: 'nombre' },
        { titulo: 'Plan', campo: 'plan' },
        { titulo: 'Inicio', render: (f) => fecha(f.fecha_inicio) },
        { titulo: 'Vence', render: (f) => fecha(f.fecha_fin) },
        { titulo: 'Monto', clase: 'numero', render: (f) => dinero(f.monto) },
        { titulo: 'Estado', render: (f) => el('span', { class: `etiqueta ${f.estado === 'ACTIVA' ? 'etiqueta--activo' : 'etiqueta--inactivo'}` }, legible(f.estado)) },
      ], suscripciones, { vacio: 'No hay suscripciones registradas' }),
    ),
  );

  return contenedor;
}

/* --------------------------------------------------------------------------
   Mensajes
   -------------------------------------------------------------------------- */

function vistaMensajes() {
  return seccion('Bitacora de comunicacion con el cliente',
    tabla([
      { titulo: 'Fecha', render: (f) => fechaHora(f.created_at) },
      { titulo: 'Cliente', render: (f) => f.cliente_nombre ?? f.nombre_cliente ?? '—' },
      { titulo: 'Canal', render: (f) => legible(f.canal) },
      { titulo: 'Asunto', campo: 'asunto' },
      { titulo: 'Contenido', campo: 'contenido' },
      {
        titulo: 'Leido',
        render: (f) => (Number(f.leido)
          ? el('span', { class: 'etiqueta etiqueta--activo' }, 'Si')
          : el('button', {
            class: 'boton boton--chico',
            onclick: async () => {
              try {
                await api.patch(`/mensajes/${f.id_mensaje}/leido`, {});
                exito('Marcado como leido');
                await recargarMensajes();
              } catch (error) { fallo(error.message); }
            },
          }, 'Marcar leido')),
      },
    ], mensajes, { vacio: 'Todavia no se han enviado mensajes' }),
  );
}

/* --------------------------------------------------------------------------
   Formularios
   -------------------------------------------------------------------------- */

function formularioTecnico() {
  const formulario = panelFormulario({
    textoEnviar: 'Registrar tecnico',
    campos: [
      campo({ etiqueta: 'Nombre', nombre: 'nombre', requerido: true }),
      campo({ etiqueta: 'Especialidad', nombre: 'especialidad', requerido: true, ayuda: 'Ejemplo: Micro soldadura, Cambio de pantalla' }),
      campo({ etiqueta: 'Telefono', nombre: 'telefono' }),
      campo({ etiqueta: 'Correo', nombre: 'email', tipo: 'email' }),
    ],
    alEnviar: async (datos) => {
      await api.post('/tecnicos', datos);
      exito('Tecnico registrado');
      cerrarModal();
      await recargar();
    },
  });

  abrirModal('Registrar tecnico', formulario);
}

function formularioMensaje() {
  if (!clientes.length) {
    fallo('No hay clientes a quienes notificar');
    return;
  }

  const formulario = panelFormulario({
    textoEnviar: 'Enviar mensaje',
    campos: [
      campo({
        etiqueta: 'Cliente', nombre: 'id_cliente', tipo: 'select', requerido: true,
        opciones: clientes.map((c) => ({ valor: c.id_cliente, texto: c.nombre })),
      }),
      campo({ etiqueta: 'Canal', nombre: 'canal', tipo: 'select', opciones: ['SMS', 'EMAIL', 'WHATSAPP'] }),
      campo({ etiqueta: 'Asunto', nombre: 'asunto', requerido: true, ancho: true }),
      campo({ etiqueta: 'Contenido', nombre: 'contenido', tipo: 'textarea', ancho: true, requerido: true }),
    ],
    alEnviar: async (datos) => {
      await api.post('/mensajes', {
        ...datos,
        id_cliente: Number(datos.id_cliente),
        id_usuario: sesion.usuario?.id_usuario ?? null,
      });
      exito('Mensaje registrado');
      cerrarModal();
      await recargarMensajes();
    },
  });

  abrirModal('Enviar mensaje al cliente', formulario);
}

/* --------------------------------------------------------------------------
   Recargas
   -------------------------------------------------------------------------- */

async function recargarMensajes() {
  mensajes = await api.get('/mensajes', { limite: 50 });
  const raiz = $('#contenido');
  raiz.replaceChildren(construir());
}

async function recargar() {
  tecnicos = await api.get('/tecnicos');
  const raiz = $('#contenido');
  raiz.replaceChildren(construir());
}
