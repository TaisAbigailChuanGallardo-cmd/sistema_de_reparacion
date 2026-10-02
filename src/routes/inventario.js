import { Router } from 'express';
import { asincrono, ErrorPeticion } from '../http/errores.js';
import { InventarioService, PagoService } from '../services/index.js';
import { repos } from '../repositories/index.js';
import { TIPO_MOVIMIENTO } from '../domain/index.js';

/**
 * Modulo Inventario (apartado 12): repuestos, proveedores y movimientos de
 * salida. Responde a RF-06.
 */
export const rutasInventario = Router();

/** GET /api/inventario/repuestos?busqueda= */
rutasInventario.get('/repuestos', asincrono(async (req, res) => {
  const { busqueda, limite = 100 } = req.query;

  const datos = busqueda
    ? await InventarioService.buscarRepuesto(busqueda, limite)
    : await InventarioService.listarRepuestos({ limite });

  res.json({ ok: true, datos });
}));

/** GET /api/inventario/repuestos/:id */
rutasInventario.get('/repuestos/:id', asincrono(async (req, res) => {
  const repuesto = await repos.repuesto.buscarPorId(req.params.id);
  if (!repuesto) throw new ErrorPeticion('Repuesto no encontrado', 404);
  res.json({ ok: true, datos: repuesto.toJSON() });
}));

/** POST /api/inventario/repuestos */
rutasInventario.post('/repuestos', asincrono(async (req, res) => {
  const { codigo, nombre, costo_unitario } = req.body ?? {};
  for (const [campo, valor] of Object.entries({ codigo, nombre, costo_unitario })) {
    if (valor === undefined || valor === null || valor === '') {
      throw new ErrorPeticion(`El campo "${campo}" es obligatorio`);
    }
  }

  const repuesto = await InventarioService.registrarRepuesto(req.body);
  res.status(201).json({ ok: true, datos: repuesto.toJSON() });
}));

/** GET /api/inventario/repuestos/:id/stock — existencias que hay que reponer. */
rutasInventario.get('/por-reponer', asincrono(async (_req, res) => {
  res.json({ ok: true, datos: await InventarioService.porReponer() });
}));

/** POST /api/inventario/proveedores */
rutasInventario.post('/proveedores', asincrono(async (req, res) => {
  const { ruc, razon_social } = req.body ?? {};
  if (!ruc || !razon_social) {
    throw new ErrorPeticion('Los campos "ruc" y "razon_social" son obligatorios');
  }
  const proveedor = await InventarioService.registrarProveedor(req.body);
  res.status(201).json({ ok: true, datos: proveedor.toJSON() });
}));

/** GET /api/inventario/proveedores */
rutasInventario.get('/proveedores', asincrono(async (req, res) => {
  res.json({ ok: true, datos: await InventarioService.listarProveedores({ limite: 200 }) });
}));

/**
 * POST /api/inventario/egresos
 * Registra compras de repuestos y gastos operativos (apartado 9.1).
 * Los ingresos no se registran aqui: nacen de los pagos de cada orden.
 */
rutasInventario.post('/egresos', asincrono(async (req, res) => {
  const { concepto, monto, categoria, id_proveedor, fecha, comprobante } = req.body ?? {};

  if (!concepto || !monto) {
    throw new ErrorPeticion('Los campos "concepto" y "monto" son obligatorios');
  }
  if (categoria && !Object.values(CATEGORIA_MOVIMIENTO).includes(categoria)) {
    throw new ErrorPeticion(`Categoria no valida. Use: ${Object.values(CATEGORIA_MOVIMIENTO).join(', ')}`);
  }

  const movimiento = await InventarioService.registrarEgreso({
    concepto,
    monto: Number(monto),
    categoria,
    id_proveedor,
    fecha,
    comprobante,
    tipo: TIPO_MOVIMIENTO.EGRESO,
  });

  res.status(201).json({ ok: true, datos: movimiento.toJSON() });
}));

