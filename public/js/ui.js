/* ==========================================================================
   Ayudantes de presentacion.
   Concentran la creacion de nodos, el formato de fechas y dinero, las tablas,
   los avisos y el modal, para que los modulos se dediquen al negocio.
   ========================================================================== */

/** Crea un elemento; los atributos y las propiedades se aplican tal cual. */
export function el(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);

  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (clave === 'class') nodo.className = valor;
    else if (clave === 'html') nodo.innerHTML = valor;
    else if (clave === 'texto') nodo.textContent = valor;
    else if (clave === 'datos') Object.assign(nodo.dataset, valor);
    else if (clave.startsWith('on') && typeof valor === 'function') {
      nodo.addEventListener(clave.slice(2).toLowerCase(), valor);
    } else nodo.setAttribute(clave, valor);
  }

  for (const hijo of hijos.flat()) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return nodo;
}

export const $ = (selector, raiz = document) => raiz.querySelector(selector);
export const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

/* --------------------------------------------------------------------------
   Formato
   -------------------------------------------------------------------------- */

const moneda = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

export const dinero = (valor) => moneda.format(Number(valor ?? 0));
export const numero = (valor, decimales = 0) =>
  Number(valor ?? 0).toLocaleString('es-PE', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

export function fecha(valor) {
  if (!valor) return '—';
  const d = new Date(String(valor).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(valor);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fechaHora(valor) {
  if (!valor) return '—';
  const d = new Date(String(valor).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(valor);
  return `${d.toLocaleDateString('es-PE')} ${d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Fecha de hoy en formato YYYY-MM-DD.
 * No se usa toISOString() a proposito: en Lima (UTC-5) a partir de las 19:00 el
 * UTC ya es del dia siguiente y devolveria manana como hoy, lo que descuadra los
 * filtros por fecha y los valores por defecto de los formularios.
 */
export const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function inicioDeMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export const legible = (texto) => String(texto ?? '')
  .replace(/_/g, ' ')
  .toLowerCase()
  .replace(/^./, (c) => c.toUpperCase());

/* --------------------------------------------------------------------------
   Componentes
   -------------------------------------------------------------------------- */

/** Etiqueta de color segun el estado de la orden. */
export function etiquetaEstado(estado) {
  return el('span', { class: `etiqueta etiqueta--${String(estado).toLowerCase()}` }, legible(estado));
}

export function etiquetaSaldo(saldo) {
  const debe = Number(saldo) > 0;
  return el('span', { class: `etiqueta ${debe ? 'etiqueta--deuda' : 'etiqueta--saldado'}` },
    debe ? `Debe ${dinero(saldo)}` : 'Saldado');
}

/** Tabla generica. `columnas` es [{ titulo, campo, clase, render }]. */
export function tabla(columnas, filas, { vacio = 'No hay registros para mostrar' } = {}) {
  if (!filas?.length) {
    return el('div', { class: 'tabla tabla__vacia' }, vacio);
  }

  return el('div', { class: 'tabla-contenedor' },
    el('table', { class: 'tabla' },
      el('thead', {},
        el('tr', {}, columnas.map((c) =>
          el('th', { class: c.clase ?? '' }, c.titulo)),
        ),
      ),
      el('tbody', {}, filas.map((fila, indice) =>
        el('tr', {},
          columnas.map((c) => {
            const valor = c.render ? c.render(fila, indice) : fila[c.campo];
            return el('td', { class: c.clase ?? '' }, valor ?? '—');
          }),
        ),
      )),
    ),
  );
}

export function seccion(titulo, ...contenido) {
  return el('section', { class: 'seccion' },
    el('h3', { class: 'seccion__titulo' }, titulo),
    ...contenido,
  );
}

export function tarjetas(items) {
  return el('div', { class: 'tarjetas' }, items.map((item) =>
    el('div', { class: `tarjeta ${item.color ? `tarjeta--${item.color}` : ''}` },
      el('div', { class: 'tarjeta__etiqueta' }, item.etiqueta),
      el('div', { class: 'tarjeta__valor' }, item.valor),
      item.nota ? el('div', { class: 'tarjeta__nota' }, item.nota) : null,
    ),
  ));
}

export function vacio(mensaje, icono = '∅') {
  return el('div', { class: 'vacio' },
    el('span', { class: 'vacio__icono' }, icono),
    el('p', { class: 'mb-0' }, mensaje),
  );
}

export function cargando() {
  return el('div', { class: 'cargando' }, 'Cargando informacion...');
}

/* --------------------------------------------------------------------------
   Avisos (toasts)
   -------------------------------------------------------------------------- */

const ICONO_AVISO = {
  exito: '✓',
  error: '!',
  aviso: 'i',
};

/**
 * Muestra un aviso en la esquina inferior derecha.
 *
 * El icono se toma del tipo y no del texto para que el mensaje de la API
 * pueda mostrarse tal cual llega, sin reescribirlo ni prefixarlo.
 */
export function avisar(mensaje, tipo = '') {
  const nodo = el('div', { class: `aviso ${tipo ? `aviso--${tipo}` : ''}`, role: 'status' },
    el('span', { class: 'aviso__icono', 'aria-hidden': 'true' }, ICONO_AVISO[tipo] ?? '·'),
    el('span', { class: 'aviso__texto' }, mensaje ?? ''),
  );
  $('#avisos').append(nodo);
  setTimeout(() => nodo.remove(), 4200);
}

export const exito = (m) => avisar(m, 'exito');
export const fallo = (m) => avisar(m, 'error');

/** Muestra un aviso de carga, ejecuta la promesa y avisa si falla. */
export async function cargarYAvisar(mensaje, promesa) {
  try {
    return await promesa();
  } catch (error) {
    fallo(error.message ?? mensaje);
    return null;
  }
}

/* --------------------------------------------------------------------------
   Modal
   -------------------------------------------------------------------------- */

let alCerrarModal = null;

export function abrirModal(titulo, contenido, alCerrar = null) {
  $('#modal-titulo').textContent = titulo;
  const cuerpo = $('#modal-cuerpo');
  cuerpo.replaceChildren(contenido);
  $('#modal').hidden = false;
  alCerrarModal = alCerrar;
  return cuerpo;
}

export function cerrarModal() {
  $('#modal').hidden = true;
  $('#modal-cuerpo').replaceChildren();
  alCerrarModal?.();
  alCerrarModal = null;
}

export function confirmar(mensaje) {
  return new Promise((resolver) => {
    let decided = false;
    const terminar = (valor) => { decided = true; cerrarModal(); resolver(valor); };

    abrirModal('Confirmar', el('p', {}, mensaje), () => { if (!decided) resolver(false); });
    $('#modal-cuerpo').append(el('div', { class: 'acciones-modal' },
      el('button', { class: 'boton boton--fantasma', onclick: () => terminar(false) }, 'Cancelar'),
      el('button', { class: 'boton boton--primario', onclick: () => terminar(true) }, 'Aceptar'),
    ));
  });
}

/* --------------------------------------------------------------------------
   Formularios
   -------------------------------------------------------------------------- */

/**
 * Campo de formulario. `tipo` acepta los valores de input.
 *
 * - 'select'     lista cerrada, no admite valores fuera de `opciones`.
 * - 'datalist'   input con sugerencias de `opciones` que ademas permite
 *                escribir un valor nuevo. Se usa para catalogos que crecen
 *                solos (marcas, por ejemplo): un select obligaria a agregar
 *                antes cada marca posible por una via que no existe.
 * - 'textarea'   texto multilinea.
 */
export function campo({ etiqueta, nombre, tipo = 'text', valor = '', opciones = null, requerido = false, ancho = false, ayuda = null, attrs = {} }) {
  let control;
  // En la rama 'datalist' el control visible es un <div> que envuelve al input,
  // y `required` sobre el div no hace nada. Se guarda aparte el input que es el
  // que de verdad debe marcarse como obligatorio.
  let controlRequerible = null;

  if (tipo === 'select') {
    control = el('select', { class: 'campo__control', name: nombre, ...attrs },
      el('option', { value: '' }, 'Seleccione...'),
      (opciones ?? []).map((opcion) => {
        const valorOpcion = typeof opcion === 'object' ? opcion.valor : opcion;
        const texto = typeof opcion === 'object' ? opcion.texto : legible(opcion);
        return el('option', { value: valorOpcion, selected: String(valor) === String(valorOpcion) }, texto);
      }),
    );
    controlRequerible = control;
  } else if (tipo === 'datalist') {
    const idLista = `${nombre}-sugerencias`;
    const entrada = el('input', {
      class: 'campo__control', type: 'text', name: nombre,
      value: valor ?? '', list: idLista, autocomplete: 'off', ...attrs,
    });
    controlRequerible = entrada;
    control = el('div', { class: 'campo__control campo__control--datalist' },
      entrada,
      el('datalist', { id: idLista },
        (opciones ?? []).map((opcion) => {
          const valorOpcion = typeof opcion === 'object' ? opcion.valor : opcion;
          const texto = typeof opcion === 'object' ? opcion.texto : legible(opcion);
          return el('option', { value: valorOpcion }, texto);
        }),
      ),
    );
  } else if (tipo === 'textarea') {
    control = el('textarea', {
      class: 'campo__control', name: nombre, rows: attrs.rows ?? 3, ...attrs,
    }, valor ?? '');
    controlRequerible = control;
  } else {
    control = el('input', {
      class: 'campo__control', type: tipo, name: nombre, value: valor ?? '', ...attrs,
    });
    controlRequerible = control;
  }

  if (requerido) controlRequerible.required = true;

  return el('label', { class: `campo ${ancho ? 'campo--ancho' : ''}` },
    el('span', { class: 'campo__etiqueta' }, etiqueta),
    control,
    ayuda ? el('span', { class: 'texto-pequeno' }, ayuda) : null,
  );
}

/** Lee un formulario como objeto plano; los numeros se convierten con Number(). */
export function leerFormulario(formulario, { numericos = [] } = {}) {
  const datos = {};
  for (const [nombre, valor] of new FormData(formulario)) {
    datos[nombre] = numericos.includes(nombre) && valor !== '' ? Number(valor) : valor;
  }
  return datos;
}

/** Envuelve un formulario en un panel con botonera de acciones. */
export function panelFormulario({ campos, alEnviar, textoEnviar = 'Guardar', cancelable = true }) {
  const formulario = el('form', { class: 'pila' });

  const grilla = el('div', { class: 'campos' }, campos);
  const error = el('p', { class: 'alerta alerta--error', hidden: true });
  const enviar = el('button', { class: 'boton boton--primario', type: 'submit' }, textoEnviar);

  formulario.append(grilla, error, el('div', { class: 'acciones-modal' },
    cancelable ? el('button', { class: 'boton boton--fantasma', type: 'button', onclick: () => cerrarModal() }, 'Cancelar') : null,
    enviar,
  ));

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    error.hidden = true;
    enviar.disabled = true;
    try {
      await alEnviar(leerFormulario(formulario, { numericos: campos.filter((c) => c.tipo === 'number').map((c) => c.nombre) }));
    } catch (errorApi) {
      error.textContent = errorApi.message;
      error.hidden = false;
    } finally {
      enviar.disabled = false;
    }
  });

  return formulario;
}
