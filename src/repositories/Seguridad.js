import { consultar, ejecutar } from '../db/pool.js';
import { RepositorioBase } from './RepositorioBase.js';
import { MovimientoEconomico, Proveedor, Rol } from '../domain/index.js';
import { Plan, Suscripcion, Usuario } from '../domain/index.js';

export class RepositorioProveedor extends RepositorioBase {
  static entidad = Proveedor;
}

export class RepositorioMovimientoEgreso extends RepositorioBase {
  static entidad = MovimientoEconomico;

  /** Proveedor con el total que le compro el taller en un periodo. */
  async comprasPorProveedor(desde, hasta) {
    return consultar(
      `SELECT m.id_proveedor, pr.razon_social, pr.ruc,
              COUNT(*) AS operaciones,
              COALESCE(SUM(m.monto), 0) AS total
         FROM \`movimiento_economico\` m
         JOIN \`proveedor\` pr ON pr.id_proveedor = m.id_proveedor
        WHERE m.tipo = 'EGRESO' AND m.fecha BETWEEN ? AND ?
        GROUP BY m.id_proveedor, pr.razon_social, pr.ruc
        ORDER BY total DESC`,
      [desde, hasta],
    );
  }
}

export class RepositorioRol extends RepositorioBase {
  static entidad = Rol;
}

export class RepositorioUsuario extends RepositorioBase {
  static entidad = Usuario;

  /** Busca por correo; devuelve el hash para poder verificar la contrasena. */
  async buscarPorEmail(email) {
    const filas = await consultar(
      `SELECT u.*, r.nombre AS rol_nombre
         FROM \`usuario\` u
         JOIN \`rol\` r ON r.id_rol = u.id_rol
        WHERE u.email = ?
        LIMIT 1`,
      [String(email).toLowerCase()],
    );
    return filas[0] ?? null;
  }

  /** Usuarios sin el hash, para las respuestas JSON. */
  async listarPublicos() {
    return consultar(
      `SELECT u.id_usuario, u.nombre, u.email, u.telefono, u.estado, u.ultimo_acceso,
              u.created_at, r.nombre AS rol
         FROM \`usuario\` u
         JOIN \`rol\` r ON r.id_rol = u.id_rol
        ORDER BY u.nombre ASC`,
    );
  }

  /** Registra el acceso del usuario (auditoria de RNF-02). */
  async registrarAcceso(idUsuario) {
    await ejecutar('UPDATE `usuario` SET `ultimo_acceso` = NOW() WHERE `id_usuario` = ?', [idUsuario]);
  }
}

export class RepositorioPlan extends RepositorioBase {
  static entidad = Plan;

  /** Planes con la lista de beneficios que ofrecen. */
  async listarConBeneficios() {
    const planes = await consultar(
      `SELECT p.*, (SELECT COUNT(*) FROM \`suscripcion\` s
                     WHERE s.id_plan = p.id_plan AND s.estado = 'ACTIVA') AS suscriptores
         FROM \`plan\` p
        ORDER BY p.precio ASC`,
    );

    const beneficios = await consultar(
      `SELECT id_plan, beneficio FROM \`plan_beneficio\` WHERE activo = 1 ORDER BY id_beneficio`,
    );

    return planes.map((plan) => ({
      ...plan,
      beneficios: beneficios.filter((b) => b.id_plan === plan.id_plan).map((b) => b.beneficio),
    }));
  }
}

export class RepositorioSuscripcion extends RepositorioBase {
  static entidad = Suscripcion;

  /** Suscripciones con su plan y su usuario. */
  async listarDetalladas() {
    return consultar(
      `SELECT s.*, p.nombre AS plan, p.precio AS plan_precio, u.nombre AS usuario, u.email
         FROM \`suscripcion\` s
         JOIN \`plan\` p ON p.id_plan = s.id_plan
         JOIN \`usuario\` u ON u.id_usuario = s.id_usuario
        ORDER BY s.fecha_inicio DESC`,
    );
  }
}
