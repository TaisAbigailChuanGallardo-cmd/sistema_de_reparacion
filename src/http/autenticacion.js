import bcrypt from 'bcryptjs';
import { repos } from '../repositories/index.js';
import { ErrorAcceso } from './errores.js';

/**
 * Rutas de autenticacion.
 *
 * El sistema emite un token opaco en formato base64 con el id, el rol y la
 * expiracion, y lo mantiene en una tabla en memoria. Es deliberadamente
 * simple: suficiente para el alcance de un taller, y sin dependencias
 * adicionales. Sustituirlo por JWT con firma es un cambio contenido en este
 * unico archivo.
 */

const SECRETO = process.env.TOKEN_SECRET ?? 'taller-reparacion-clave-de-desarrollo';
const VIGENCIA_HORAS = 8;

/** id -> { id_usuario, nombre, email, rol, expira } */
const sesiones = new Map();

/** Firma el token con la clave del servidor. */
function firmar(contenido) {
  const payload = Buffer.from(JSON.stringify(contenido)).toString('base64url');
  return `${payload}.${Buffer.from(`${SECRETO}:${payload}`).toString('base64url')}`;
}

/** Verifica la firma y la vigencia del token. */
function verificar(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, firma] = token.split('.');

  const esperada = Buffer.from(`${SECRETO}:${payload}`).toString('base64url');
  if (firma !== esperada) return null;

  try {
    const contenido = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (contenido.exp < Date.now()) return null;
    return contenido;
  } catch {
    return null;
  }
}

/** POST /api/auth/login */
export async function login(req, res) {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    res.status(400).json({ ok: false, error: 'El correo y la contrasena son obligatorios' });
    return;
  }

  const fila = await repos.usuario.buscarPorEmail(email);
  const coincide = fila && await bcrypt.compare(String(password), fila.password_hash);

  if (!coincide) {
    // Mismo mensaje en ambos casos: no se revela si el correo existe (RNF-02).
    res.status(401).json({ ok: false, error: 'Credenciales incorrectas' });
    return;
  }

  if (fila.estado !== 'ACTIVO') {
    res.status(403).json({ ok: false, error: 'La cuenta esta inactiva o bloqueada' });
    return;
  }

  const contenido = {
    id_usuario: fila.id_usuario,
    nombre: fila.nombre,
    email: fila.email,
    rol: fila.rol_nombre,
    exp: Date.now() + VIGENCIA_HORAS * 36e5,
  };

  sesiones.set(fila.id_usuario, contenido);
  await repos.usuario.registrarAcceso(fila.id_usuario);

  res.json({
    ok: true,
    token: firmar(contenido),
    usuario: { id: fila.id_usuario, nombre: fila.nombre, email: fila.email, rol: fila.rol_nombre },
  });
}

/** POST /api/auth/logout */
export function logout(req, res) {
  if (req.usuario) sesiones.delete(req.usuario.id_usuario);
  res.json({ ok: true, mensaje: 'Sesion cerrada' });
}

/** GET /api/auth/yo */
export function yo(req, res) {
  res.json({ ok: true, usuario: req.usuario });
}

/**
 * Middleware de autenticacion: exige un token valido y lo deja en req.usuario.
 */
export function autenticar(req, res, next) {
  const cabecera = req.headers.authorization ?? '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;

  const contenido = verificar(token);
  if (!contenido) {
    res.status(401).json({ ok: false, error: 'Sesion no valida o expirada' });
    return;
  }

  // La sesion debe seguir viva en el servidor: asi un logout la invalida de inmediato.
  const activa = sesiones.get(contenido.id_usuario);
  if (!activa || activa.exp < Date.now()) {
    res.status(401).json({ ok: false, error: 'Sesion no valida o expirada' });
    return;
  }

  req.usuario = contenido;
  next();
}

/**
 * Middleware de autorizacion por rol.
 * @param {...string} roles
 */
export function requiereRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario) {
      res.status(401).json({ ok: false, error: 'Sesion no valida' });
      return;
    }
    if (!roles.includes(req.usuario.rol)) {
      res.status(403).json({
        ok: false,
        error: `Esta operacion requiere uno de estos roles: ${roles.join(', ')}`,
      });
      return;
    }
    next();
  };
}
