/* ==========================================================================
   Punto de entrada de la interfaz.
   Resuelve el inicio de sesion, el enrutado por hash (#/modulo) y el montaje
   de cada modulo. Los modulos se cargan de forma perezosa para no descargar
   todo el codigo en el primer arranque.
   ========================================================================== */

import { api, sesion } from './api.js';
import { $, $$, cargando, fallo, cerrarModal } from './ui.js';

const MODULOS = {
  tablero: { titulo: 'Tablero', subtitulo: 'Indicadores de gestion', cargar: () => import('./modulos/tablero.js') },
  clientes: { titulo: 'Clientes y Equipos', subtitulo: 'Registro y trazabilidad (RF-01, RF-02, RF-09)', cargar: () => import('./modulos/clientes.js') },
  ordenes: { titulo: 'Ordenes de Servicio', subtitulo: 'Recepcion, diagnostico, reparacion y entrega (RF-03 a RF-08)', cargar: () => import('./modulos/ordenes.js') },
  inventario: { titulo: 'Inventario', subtitulo: 'Repuestos, proveedores y egresos (RF-06)', cargar: () => import('./modulos/inventario.js') },
  personal: { titulo: 'Personal y Mensajes', subtitulo: 'Tecnicos, usuarios, planes y comunicacion (RNF-02)', cargar: () => import('./modulos/personal.js') },
  reportes: { titulo: 'Reportes', subtitulo: 'Indicadores de gestion del taller (RF-10)', cargar: () => import('./modulos/reportes.js') },
};

const contenido = $('#contenido');
const modulosPrecargados = new Map();

/* --------------------------------------------------------------------------
   Navegacion
   -------------------------------------------------------------------------- */

function moduloActual() {
  const nombre = location.hash.replace(/^#\/?/, '').split('/')[0];
  return MODULOS[nombre] ? nombre : 'tablero';
}

function marcarMenu(nombre) {
  $$('.menu__enlace').forEach((enlace) => {
    enlace.classList.toggle('activo', enlace.dataset.modulo === nombre);
  });
}

async function enrutar() {
  if (!sesion.iniciada) return mostrarLogin();

  const nombre = moduloActual();
  const modulo = MODULOS[nombre];
  const usuario = sesion.usuario;

  $('#menu-usuario-nombre').textContent = usuario?.nombre ?? 'Usuario';
  $('#menu-usuario-rol').textContent = usuario?.rol ?? '';
  $('#cabecera-titulo').textContent = modulo.titulo;
  $('#cabecera-subtitulo').textContent = modulo.subtitulo;
  $('#menu-lateral').classList.remove('abierto');
  marcarMenu(nombre);

  contenido.replaceChildren(cargando());

  try {
    if (!modulosPrecargados.has(nombre)) {
      modulosPrecargados.set(nombre, await modulo.cargar());
    }
    // Cada modulo pinta dentro de `contenido` y devuelve ese mismo nodo, asi que
    // aqui no se vuelve a insertar. Hacer contenido.replaceChildren(vista) con
    // vista === contenido lanza "The new child element contains the parent" y
    // deja la vista en blanco.
    await modulosPrecargados.get(nombre).iniciar(contenido);
    contenido.scrollTop = 0;
  } catch (error) {
    if (error?.estado === 401) return mostrarLogin();
    contenido.replaceChildren();
    fallo(error.message ?? 'No se pudo cargar el modulo');
  }
}

/* --------------------------------------------------------------------------
   Sesion
   -------------------------------------------------------------------------- */

function mostrarLogin() {
  $('#vista-app').hidden = true;
  $('#vista-login').hidden = false;
}

function mostrarApp() {
  $('#vista-login').hidden = true;
  $('#vista-app').hidden = false;
  if (!location.hash) location.hash = '#/tablero';
  enrutar();
}

$('#formulario-login').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const boton = $('#login-enviar');
  const error = $('#login-error');
  error.hidden = true;
  boton.disabled = true;
  boton.textContent = 'Verificando...';

  try {
    await api.iniciarSesion($('#login-email').value.trim(), $('#login-password').value);
    mostrarApp();
  } catch (falloLogin) {
    error.textContent = falloLogin.message;
    error.hidden = false;
  } finally {
    boton.disabled = false;
    boton.textContent = 'Ingresar';
  }
});

$('#boton-salir').addEventListener('click', async () => {
  await api.cerrarSesion();
  modulosPrecargados.clear();
  mostrarLogin();
});

$('#boton-menu').addEventListener('click', () => {
  $('#menu-lateral').classList.toggle('abierto');
});

/* --------------------------------------------------------------------------
   Modal: cierre por boton, fondo y tecla Escape
   -------------------------------------------------------------------------- */

$('#modal-cerrar').addEventListener('click', cerrarModal);
$('#modal').addEventListener('click', (evento) => {
  if (evento.target.id === 'modal') cerrarModal();
});
document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape' && !$('#modal').hidden) cerrarModal();
});

/* --------------------------------------------------------------------------
   Arranque
   -------------------------------------------------------------------------- */

window.addEventListener('hashchange', enrutar);

if (sesion.iniciada) mostrarApp();
else mostrarLogin();
