-- =============================================================================
--  SISTEMA DE GESTION INTEGRAL PARA UNA EMPRESA DE REPARACION
--  DE CELULARES Y EQUIPOS TECNOLOGICOS
-- =============================================================================
--  Archivo   : 03_seed.sql
--  Depende   : 01_schema.sql, 02_triggers.sql
--
--  Datos de arranque para poder demostrar los modulos sin carga manual previa.
--  El orden de insercion respeta las dependencias y, sobre todo, los triggers:
--    1. las ordenes se abren en RECIBIDO,
--    2. los detalles se cargan antes que los pagos (el saldo debe existir),
--    3. los pagos nunca superan el saldo (RN-06).
-- =============================================================================

USE `taller_reparacion`;
SET @OLD_SQL_MODE = @@SQL_MODE;


-- -----------------------------------------------------------------------------
-- 1. ROLES  (control de acceso, RNF-02)
-- -----------------------------------------------------------------------------
INSERT INTO `rol` (`nombre`, `descripcion`) VALUES
  ('ADMINISTRADOR',    'Acceso total al sistema, incluida la configuracion'),
  ('RECEPCIONISTA',    'Registra clientes, equipos, ordenes y cobra'),
  ('TECNICO',          'Diagnostica, repara y actualiza el avance tecnico'),
  ('ADMINISTRADOR_NEGOCIO', 'Consulta reportes e indicadores economicos');


-- -----------------------------------------------------------------------------
-- 2. USUARIOS
--    Contrasenas de la demo:
--      abigail@admin.com / 180822       (administrador)
--      recepcion@taller.pe / admin123
--      tecnico@taller.pe / tecnico123
--      negocio@taller.pe  / tecnico123
--    Los hash son bcrypt con costo 10.
-- -----------------------------------------------------------------------------
INSERT INTO `usuario` (`nombre`, `email`, `password_hash`, `telefono`, `id_rol`) VALUES
  ('Abigail Admin',  'abigail@admin.com',
   '$2a$10$6nDIB8OLA2Y5N178K1E1ceps.fQIqv3ie4XQFoPSvOqrZKK.t9c9W',
   '999111222', 1),
  ('Luis Fernandez',  'recepcion@taller.pe',
   '$2a$10$Hd/gCPm5tsDeydI790Wm/eLofDtnv9S1yfHSVYZOIbqf3vHB6Fup6',
   '999333444', 2),
  ('Marcos Yupanqui', 'tecnico@taller.pe',
   '$2a$10$asZkq8puiRf81TfRuyhTTeCOywJSqcmY1b7T0EHc.Vh6mSx5u4lpe',
   '999555666', 3),
  ('Rosa Paredes',    'negocio@taller.pe',
   '$2a$10$asZkq8puiRf81TfRuyhTTeCOywJSqcmY1b7T0EHc.Vh6mSx5u4lpe',
   '999777888', 4);


-- -----------------------------------------------------------------------------
-- 3. PLANES, BENEFICIOS Y SUSCRIPCIONES
-- -----------------------------------------------------------------------------
INSERT INTO `plan` (`nombre`, `descripcion`, `precio`, `periodicidad`) VALUES
  ('PLAN BASICO',    'Atencion estandar para el taller',                  0.00,  'MENSUAL'),
  ('PLAN NEGOCIO',   'Reportes consolidados y prioridad de atencion',     35.00, 'MENSUAL'),
  ('PLAN PREMIUM',   'Trazabilidad de equipos y garantia extendida',       60.00, 'MENSUAL');

INSERT INTO `plan_beneficio` (`id_plan`, `beneficio`) VALUES
  (1, 'Registro de ordenes sin limite'),
  (1, 'Control de stock de repuestos'),
  (2, 'Reportes de ingresos y egresos'),
  (2, 'Numeracion de orden automatica'),
  (3, 'Garantia extendida de 90 dias'),
  (3, 'Historial por cliente y por equipo');

INSERT INTO `suscripcion` (`id_usuario`, `id_plan`, `fecha_inicio`, `fecha_fin`, `monto`, `estado`) VALUES
  (1, 3, DATE_SUB(CURDATE(), INTERVAL 4 MONTH), NULL, 60.00, 'ACTIVA'),
  (2, 2, DATE_SUB(CURDATE(), INTERVAL 2 MONTH), NULL, 35.00, 'ACTIVA'),
  (3, 1, DATE_SUB(CURDATE(), INTERVAL 6 MONTH), NULL,  0.00, 'ACTIVA');


-- -----------------------------------------------------------------------------
-- 4. PROVEEDORES
-- -----------------------------------------------------------------------------
INSERT INTO `proveedor` (`ruc`, `razon_social`, `contacto_nombre`, `telefono`, `email`) VALUES
  ('20512345678', 'Distribuidora Andina de Componentes SAC', 'Jorge Caceres', '01 4456789', 'ventas@andina.com.pe'),
  ('20598765432', 'Importaciones Moviltech EIRL',            'Silvia Ramos',  '01 5567890', 'compras@moviltech.pe'),
  ('20633344455', 'Servicios Tecnologicos del Norte SRL',     'Alvaro Cueva',  '01 6678901', 'soporte@tecnorte.pe');


-- -----------------------------------------------------------------------------
-- 5. CLIENTES
-- -----------------------------------------------------------------------------
INSERT INTO `cliente` (`tipo_documento`, `numero_documento`, `nombre`, `telefono`, `email`, `direccion`) VALUES
  ('DNI', '70123456', 'Pedro Alvarez Rojas',  '987654321', 'pedro.alvarez@correo.com',  'Jr. Grau 120, Paita'),
  ('DNI', '70234567', 'Lucia Torres Vargas',  '976543210', 'lucia.torres@correo.com',   'Av. Bolognesi 455, Paita'),
  ('CE',  '40123456', 'Carlos Mendez Salas',  '965432101', 'carlos.mendez@correo.com',  'Calle Sucre 88, Sullana'),
  ('DNI', '70345678', 'Ana Quispe Moran',     '954321012', 'ana.quispe@correo.com',     'Jr. Union 302, Paita'),
  ('RUC', '20612345677', 'Comercial Los Andes EIRL', '943210123', 'compras@losandes.pe', 'Av. Independencia 1500, Lima'),
  ('DNI', '70456789', 'Jorge Nunez Bravo',    '932101234', 'jorge.nunez@correo.com',    'Miercoles 720, Sullana');


-- -----------------------------------------------------------------------------
-- 6. EQUIPOS
-- -----------------------------------------------------------------------------
INSERT INTO `equipo` (`id_cliente`, `tipo`, `marca`, `modelo`, `numero_serie`, `color`, `anio`, `falla_reportada`, `accesorios_entregados`) VALUES
  (1, 'CELULAR',     'Samsung',  'Galaxy A54',      'SM-A546B-0001', 'Negro',   2023, 'No enciende, Possible humedad',      'Funda, cargador'),
  (1, 'LAPTOP',      'HP',       'Notebook 15s',     '5CD1234ABC',    'Plata',    2022, 'Pantalla con manchas',              'Cargador'),
  (2, 'CELULAR',     'Xiaomi',   'Redmi Note 12',    'MI-12-88901',   'Azul',     2024, 'No carga, puerto danado',           'Caso, cargador'),
  (3, 'COMPUTADORA', 'Acer',     'Aspire 5',         'AC-7742-XZ',    'Negro',    2021, 'Muy lenta, disco lleno',            NULL),
  (4, 'TABLET',      'Apple',    'iPad 9na gen',     'F2LX90Q4JGH7',  'Blanco',   2022, 'No responde el tactil',             'Funda'),
  (5, 'CELULAR',     'Motorola', 'Moto G54',         'MT-G54-5512',   'Gris',     2023, 'Bateria dura solo 2 horas',        'Cargador turbo'),
  (6, 'IMPRESORA',   'Canon',    'LBP2900',          'CN-2900-7781',  'Blanco',   2020, 'Imprime en blanco',                NULL);


-- -----------------------------------------------------------------------------
-- 7. TECNICOS   (el codigo lo asigna el trigger trg_tecnico_codigo_bi)
-- -----------------------------------------------------------------------------
INSERT INTO `tecnico` (`nombre`, `especialidad`, `telefono`, `email`) VALUES
  ('Carlos Mendoza',   'Microsoldadura y placa madre',  '999111001', 'carlos.mendoza@taller.pe'),
  ('Andrea Rios',      'Software y desbloqueo',         '999111002', 'andrea.rios@taller.pe'),
  ('Luis Zambrano',    'Pantallas y digitadores tactiles',        '999111003', 'luis.zambrano@taller.pe');


-- -----------------------------------------------------------------------------
-- 8. REPUESTOS
-- -----------------------------------------------------------------------------
INSERT INTO `repuesto` (`id_proveedor`, `codigo`, `nombre`, `descripcion`, `marca`, `stock`, `stock_minimo`, `costo_unitario`) VALUES
  (1, 'REP-0001', 'Bateria Samsung A54',      'Bateria original Li-ion 5000mAh',      'Samsung',  12, 4,  85.00),
  (1, 'REP-0002', 'Pantalla OLED A54',        'Display OLED con marco',               'Samsung',   6, 3, 210.00),
  (1, 'REP-0003', 'Conector de carga C',      'Puerto USB-C flexible',                 'Generico', 25, 8,  12.50),
  (2, 'REP-0004', 'Chip SSD 512GB',           'Unidad de estado solido NVMe',         'Kingston',  8, 3, 195.00),
  (2, 'REP-0005', 'Teclado HP 15s',           'Teclado replacement con teclado español','HP',       4, 2, 120.00),
  (2, 'REP-0006', 'Touch iPad 9',             'Digitador tactil original',            'Apple',     3, 2, 165.00),
  (3, 'REP-0007', 'Bateria Moto G54',         'Bateria 5000mAh',                      'Motorola', 14, 5,  70.00),
  (3, 'REP-0008', 'Toner Canon LBP2900',      'Toner negro compatible',               'Canon',    10, 3,  95.00),
  (1, 'REP-0009', 'Flex de carga Redmi Note', 'Flex cable de carga',                  'Xiaomi',   15, 5,   9.00),
  (2, 'REP-0010', 'Fuente de poder 24W',      'Adaptador de corriente universal',     'Generico', 20, 6,  35.00);


-- -----------------------------------------------------------------------------
-- 9. ORDENES DE SERVICIO
--    Se abren en RECIBIDO y luego avanzan: asi se ejercita el diagrama de
--    estados y la RN-07 con su contador real.
--    Cliente 1 -> equipos 1,2 ; cliente 2 -> equipo 3 ; cliente 3 -> equipo 4
--    cliente 4 -> equipo 5 ; cliente 5 -> equipo 6 ; cliente 6 -> equipo 7
-- -----------------------------------------------------------------------------
INSERT INTO `orden_servicio`
  (`id_cliente`, `id_equipo`, `estado`, `fecha_recepcion`, `falla_reportada`, `prioridad`, `id_usuario_registro`, `observaciones`)
VALUES
  (1, 1, 'RECIBIDO', DATE_SUB(NOW(), INTERVAL 3 DAY),  'No enciende, posible ingreso de humedad', 'ALTA',    2, 'Cliente urijo del equipo con recibo'),
  (2, 3, 'RECIBIDO', DATE_SUB(NOW(), INTERVAL 2 DAY),  'No carga, el puerto esta danado',         'NORMAL',  2, NULL),
  (3, 4, 'RECIBIDO', DATE_SUB(NOW(), INTERVAL 1 DAY),  'Equipo muy lento, sospechan disco lleno','NORMAL',  2, NULL),
  (4, 5, 'RECIBIDO', DATE_SUB(NOW(), INTERVAL 5 HOUR), 'El tactil no responde en ninguna zona',  'URGENTE', 2, 'Cliente con cita en la manana'),
  (6, 7, 'RECIBIDO', DATE_SUB(NOW(), INTERVAL 1 HOUR), 'Imprime en blanco desde ayer',           'BAJA',    2, NULL);

-- Asignacion de tecnicos: 3 tecnicos para 5 ordenes, dentro del limite de la
-- RN-07 (5 ordenes activas por tecnico).
UPDATE `orden_servicio` SET `id_tecnico` = 1, `estado` = 'EN_DIAGNOSTICO',
       `diagnostico` = 'Ingreso de liquido en placa. Se debe limpiar con ultrasonido y evaluar la placa de carga.'
 WHERE `numero` = 'OS-000001';
UPDATE `orden_servicio` SET `id_tecnico` = 1, `estado` = 'EN_DIAGNOSTICO',
       `diagnostico` = 'Puerto USB-C con pins doblados. Se requiere cambio de conector.'
 WHERE `numero` = 'OS-000002';
UPDATE `orden_servicio` SET `id_tecnico` = 2, `estado` = 'EN_DIAGNOSTICO',
       `diagnostico` = 'Disco HDD con sectores danados. Se recomienda migrar a SSD.'
 WHERE `numero` = 'OS-000003';
UPDATE `orden_servicio` SET `id_tecnico` = 3, `estado` = 'EN_REPARACION',
       `diagnostico` = 'Digitador tactil sin respuesta en la zona inferior. Conector flex Flojo.'
 WHERE `numero` = 'OS-000004';


-- -----------------------------------------------------------------------------
-- 10. PRESUPUESTO Y CONCEPTOS DE LAS ORDENES
--     Los detalles de repuesto descuentan stock (RN-04) y recalculan el
--     costo final de la orden (RN-05).
-- -----------------------------------------------------------------------------
UPDATE `orden_servicio` SET `costo_diagnostico` = 30.00, `costo_mano_obra` = 60.00,
                            `estado` = 'PRESUPUESTADO'
 WHERE `numero` = 'OS-000001';
UPDATE `orden_servicio` SET `costo_diagnostico` = 25.00, `costo_mano_obra` = 40.00,
                            `estado` = 'PRESUPUESTADO'
 WHERE `numero` = 'OS-000002';
UPDATE `orden_servicio` SET `costo_diagnostico` = 30.00, `costo_mano_obra` = 80.00,
                            `descuento` = 20.00, `estado` = 'PRESUPUESTADO'
 WHERE `numero` = 'OS-000003';
UPDATE `orden_servicio` SET `costo_diagnostico` = 35.00, `costo_mano_obra` = 90.00,
                            `estado` = 'PRESUPUESTADO'
 WHERE `numero` = 'OS-000004';

INSERT INTO `detalle_servicio` (`id_orden`, `id_repuesto`, `concepto`, `descripcion`, `cantidad`) VALUES
  (1, 1, 'REPUESTO', 'Bateria original para Galaxy A54',            1),
  (1, 3, 'REPUESTO', 'Conector de carga para puerto USB-C',         1),
  (2, 9, 'REPUESTO', 'Flex de carga Redmi Note 12',                 1),
  (3, 4, 'REPUESTO', 'SSD NVMe de 512GB para la migracion',         1),
  (4, 6, 'REPUESTO', 'Digitador tactil iPad 9 generacion',          1),
  (5, 8, 'REPUESTO', 'Toner negro compatible con LBP2900',          1),
  (5, 8, 'SERVICIO_ADICIONAL', 'Limpieza de cabezal de impresion', 1);

UPDATE `orden_servicio` SET `costo_adicional` = 20.00 WHERE `numero` = 'OS-000003';
UPDATE `orden_servicio` SET `costo_adicional` = 15.00 WHERE `numero` = 'OS-000001';

-- Cierre de la orden OS-000004: ya tiene diagnostico, puede pasar a LISTO (RN-03).
UPDATE `orden_servicio` SET `estado` = 'LISTO', `solucion` = 'Se sustituyo el digitador tactil. Equipo probado.'
 WHERE `numero` = 'OS-000004';
-- Cierre completo de OS-000003: entregada al cliente.
UPDATE `orden_servicio` SET `estado` = 'ENTREGADO', `solucion` = 'Migracion a SSD completada y sistema reinstallado.'
 WHERE `numero` = 'OS-000003';


-- -----------------------------------------------------------------------------
-- 11. PAGOS Y COMPROBANTES
--     El trigger trg_pago_economia_ai genera el movimiento de INGRESO; los
--     EGRESOS se cargan al final de forma explicita.
--
--     RN-06: cada monto debe ser menor o igual al saldo de su orden.
--       OS-000001  costo final 202.50  ->  abono parcial de  80.00
--       OS-000002  costo final  74.00  ->  abono parcial de  50.00
--       OS-000003  costo final 305.00  ->  cancelacion total de 305.00
--       OS-000004  costo final 290.00  ->  cancelacion total de 290.00
-- -----------------------------------------------------------------------------
INSERT INTO `pago` (`id_orden`, `id_usuario`, `monto`, `fecha`, `metodo`, `referencia`) VALUES
  (1, 2,  80.00,  DATE_SUB(NOW(), INTERVAL 2 DAY),   'EFECTIVO',        'ABONO-01'),
  (2, 2,  50.00,  DATE_SUB(NOW(), INTERVAL 1 DAY),   'YAPE',            'YAPE-88213'),
  (3, 2, 305.00,  DATE_SUB(NOW(), INTERVAL 12 HOUR), 'TARJETA_CREDITO', '****4417'),
  (4, 2, 290.00,  DATE_SUB(NOW(), INTERVAL 4 HOUR),  'TRANSFERENCIA',   'OP-99231');

-- Boleta para los pagos de menor importe, factura para los mayores (>= 200).
INSERT INTO `comprobante_pago` (`id_pago`, `tipo`, `total`)
  SELECT `id_pago`, 'BOLETA', `monto` FROM `pago` WHERE `monto` < 200.00;

INSERT INTO `comprobante_pago` (`id_pago`, `tipo`, `total`)
  SELECT `id_pago`, 'FACTURA', `monto` FROM `pago` WHERE `monto` >= 200.00;


-- -----------------------------------------------------------------------------
-- 12. EGRESOS  (compras de repuestos y gastos operativos)
--     Se reparten entre el mes en curso y el anterior para que el resultado de
--     ambos periodos sea comparable: si todos los gastos se cucen para el mes
--     en curso, el margen de este sale negativo y el tablero no dice nada.
-- -----------------------------------------------------------------------------
INSERT INTO `movimiento_economico` (`tipo`, `categoria`, `concepto`, `monto`, `fecha`, `id_proveedor`, `comprobante`) VALUES
  -- Mes anterior
  ('EGRESO', 'GASTO_OPERATIVO', 'Alquiler del local del taller',          700.00, DATE_SUB(CURDATE(), INTERVAL 33 DAY), NULL, 'REC-001'),
  ('EGRESO', 'COMPRA_REPUESTO', 'Compra de conectores USB-C',             130.00, DATE_SUB(CURDATE(), INTERVAL 38 DAY), 1, 'F001-0000124'),
  ('EGRESO', 'GASTO_OPERATIVO', 'Compras de insumos de limpieza',           88.00, DATE_SUB(CURDATE(), INTERVAL 34 DAY), 3, 'F001-0000126'),
  ('EGRESO', 'GASTO_OPERATIVO', 'Servicio de luz y agua',                  218.50, DATE_SUB(CURDATE(), INTERVAL 31 DAY), NULL, 'REC-002'),
  -- Mes en curso
  ('EGRESO', 'COMPRA_REPUESTO', 'Compra de lote de baterias Samsung A54',  480.00, DATE_SUB(CURDATE(), INTERVAL 20 DAY), 1, 'F001-0000123'),
  ('EGRESO', 'COMPRA_REPUESTO', 'Compra de pantallas para iPhone',        700.00, DATE_SUB(CURDATE(), INTERVAL 15 DAY), 1, 'F001-0000130'),
  ('EGRESO', 'GASTO_OPERATIVO', 'Servicio de internet y telefonia',        165.00, DATE_SUB(CURDATE(), INTERVAL  9 DAY), NULL, 'REC-004'),
  ('EGRESO', 'COMPRA_REPUESTO', 'Compra de conectores Lightning',         360.00, DATE_SUB(CURDATE(), INTERVAL  2 DAY), 1, 'F001-0000133'),
  ('EGRESO', 'GASTO_OPERATIVO', 'Mantenimiento de equipo de soldadura',    340.00, DATE_SUB(CURDATE(), INTERVAL  5 DAY), 3, 'F001-0000132'),
  ('EGRESO', 'IMPUESTO',        'Pago mensual de tributos municipales',    260.00, DATE_SUB(CURDATE(), INTERVAL  4 DAY), NULL, 'REC-003'),
  ('EGRESO', 'IMPUESTO',        'Pago de IGV del periodo',                 140.00, DATE_SUB(CURDATE(), INTERVAL  1 DAY), NULL, 'REC-005');


-- -----------------------------------------------------------------------------
-- 13. MENSAJES  (comunicacion con el cliente)
-- -----------------------------------------------------------------------------
INSERT INTO `mensaje` (`id_usuario`, `id_cliente`, `id_orden`, `canal`, `asunto`, `contenido`, `leido`, `fecha_envio`) VALUES
  (2, 1, 1, 'SISTEMA',  'Orden OS-000001 recibida',
     'Su equipo fue ingresado al taller. Le confirmaremos el diagnostico en breve.', 1, DATE_SUB(NOW(), INTERVAL 3 DAY)),
  (2, 2, 2, 'WHATSAPP', 'Presupuesto listo para su telefono',
     'Hola Lucia, el presupuesto de tu Redmi Note 12 esta listo. Puedes pasar a recogerlo.', 0, DATE_SUB(NOW(), INTERVAL 1 DAY)),
  (3, 3, 3, 'SISTEMA',  'Cambio de disco autorizado',
     'El cambio a SSD fue aprobado. La orden pasa a taller.', 1, DATE_SUB(NOW(), INTERVAL 8 HOUR)),
  (2, 4, 4, 'SMS',      'Su tablet quedo lista',
     'Hola Ana, tu iPad ya salio de taller. Puedes recogerla a partir de las 3pm.', 0, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
  (2,  6,  5, 'SISTEMA',  'Impresora recibida',
     'Recibimos su Canon LBP2900 para revision. Le informaremos el costo del toner.', 0, DATE_SUB(NOW(), INTERVAL 45 MINUTE));


-- -----------------------------------------------------------------------------
-- 14. HISTORIAL AMPLIO
--     Las cinco ordenes de la seccion 9 dejan el taller con muy pocos datos
--     para poder observar el comportamiento del negocio. Aqui se carga un
--     historial de 39 ordenes repartidas en los ultimos dos meses, con sus
--     clientes, equipos, repuestos, pagos, garantias y mensajes.
--
--     Las ordenes se insertan ya en su estado final: el trigger
--     trg_orden_estado_bi lo permite siempre que las que exigen tecnico
--     (EN_DIAGNOSTICO, EN_REPARACION, LISTO) lo traigan asignado, y de ese
--     modo cada orden nace con su fecha real de recepcion y de entrega en vez
--     de quedar sellada con la fecha del momento en que se carga el seed.
-- -----------------------------------------------------------------------------

-- 14.1 Clientes adicionales ----------------------------------------------------
INSERT INTO `cliente`
  (`id_cliente`, `tipo_documento`, `numero_documento`, `nombre`, `telefono`, `email`, `direccion`, `referencia`)
VALUES
  ( 7, 'DNI',      '71567890',   'Diego Alonso Vega',        '900112233', 'diego.alonso@correo.com',   'Av. Brasil 342',            'Esposa: 900112244'),
  ( 8, 'DNI',      '80765432',   'Carmen Flores Diaz',       '900223344', 'carmen.flores@correo.com',  'Jr. Union 1188',            NULL),
  ( 9, 'CE',       '45789012',   'Jorge Salazar Medina',     '900334455', 'jorge.salazar@correo.com',  'Calle Las Begonias 45',     'Hijo: 900334466'),
  (10, 'DNI',      '45991234',   'Sofia Ramirez Luna',       '900445566', 'sofia.ramirez@correo.com',   'Av. Universitaria 1500',   NULL),
  (11, 'RUC',      '20545678912','Distribuidora Andina SAC', '900556677', 'compras@andina.com',        'Av. Argentina 979',         'Contabilidad: 900556688'),
  (12, 'DNI',      '45887766',   'Miguel Torres Paz',        '900667788', NULL,                          'Jr. Puno 890',              NULL),
  (13, 'DNI',      '45332211',   'Rosa Gutierrez Suni',      '900778899', 'rosa.gutierrez@correo.com',  'Av. Tacna 210',             NULL),
  (14, 'PASAPORTE','AB123456',   'Kevin Rojas Mendez',       '900889900', 'kevin.rojas@correo.com',    'Mz. F Lt. 12',              NULL),
  (15, 'DNI',      '72445566',   'Claudia Neyra Vela',       '900990011', NULL,                          'Av. Grau 405',              'Hermano: 900990022'),
  (16, 'DNI',      '73112233',   'Diego Palomino Ruiz',      '900100200', 'diego.palomino@correo.com',  'Calle Lima 733',            NULL);

-- 14.2 Equipos adicionales ----------------------------------------------------
INSERT INTO `equipo`
  (`id_equipo`, `id_cliente`, `tipo`, `marca`, `modelo`, `numero_serie`, `color`, `anio`, `falla_reportada`, `accesorios_entregados`)
VALUES
  ( 8,  7, 'CELULAR',     'Apple',    'iPhone 13',        'F2LX3K9PQ2',   'Medianoche', 2022, 'La bateria dura 3 horas',              'Funda, cable Lightning'),
  ( 9,  7, 'LAPTOP',      'Lenovo',   'IdeaPad 3',        'PF3K9XZ1',     'Gris',       2021, 'No arranca y hace ruido al iniciar',   'Cargador'),
  (10,  8, 'CELULAR',     'Samsung',  'Galaxy S22',       'SM-S228B',     'Crema',      2023, 'Pantalla rota por caida',              'Funda, cargador'),
  (11,  9, 'CELULAR',     'Xiaomi',   'Poco X5 Pro',      'MI-X5-5521',   'Grafito',    2023, 'No detecta la tarjeta SIM',            'Cargador turbo'),
  (12,  9, 'COMPUTADORA', 'HP',       'Desktop 250G7',    'HP-250-7712',  'Negro',      2020, 'Se reinicia solo',                     'Teclado y mouse'),
  (13, 10, 'CELULAR',     'Apple',    'iPhone 12 mini',   'F2LX0M4N77',   'Azul',       2021, 'No enciende el microfono',             'Funda'),
  (14, 10, 'TABLET',      'Samsung',  'Galaxy Tab A9',    'SM-T510-3311', 'Gris',       2023, 'Puerto de carga suelto',               'Cargador'),
  (15, 11, 'LAPTOP',      'HP',       'ProBook 450',      '5CG4412XYZ',   'Plata',      2022, 'El ventilador hace mucho ruido',        'Cargador'),
  (16, 12, 'CELULAR',     'Motorola', 'Moto G84',         'MT-G84-9081',  'Verde',      2024, 'Cambio de pantalla',                   'Cargador'),
  (17, 13, 'CELULAR',     'Samsung',  'Galaxy A14',       'SM-A145F',     'Negro',      2023, 'Altavoz con distorsion',                'Funda'),
  (18, 13, 'CELULAR',     'Xiaomi',   'Redmi 13C',        'MI-13C-7742',  'Azul',       2023, 'Puerto de carga danado',               'Caso'),
  (19, 14, 'CELULAR',     'Apple',    'iPhone 14',        'F2LX9K2M11',   'Morado',     2023, 'La camara trasera no enfoca',          'Funda, cargador'),
  (20, 15, 'COMPUTADORA', 'Acer',     'Predator 5',       'AC-P5-6612',   'Negro',      2021, 'Se sobrecalienta al jugar',            'Cargador'),
  (21, 15, 'IMPRESORA',   'Epson',    'EcoTank L3250',    'EP-L3250-118', 'Blanco',     2022, 'Imprime con manchas',                  NULL),
  (22, 16, 'CELULAR',     'Samsung',  'Galaxy A54',       'SM-A546B-7788','Azul',       2023, 'Golpe en la parte trasera',             'Cargador'),
  (23, 16, 'LAPTOP',      'Apple',    'MacBook Air M1',    'C02X1234ABCD', 'Medianoche', 2022, 'La bateria no carga al 100%',          'Cargador MagSafe'),
  (24,  7, 'CELULAR',     'Xiaomi',   'Redmi Note 13',     'MI-N13-3311',  'Verde',      2024, 'Franja negra en la pantalla',           'Funda'),
  (25, 12, 'COMPUTADORA', 'Acer',     'Nitro V5',         'AC-N5-4410',   'Negro',      2022, 'No detecta el disco duro',             'Cargador'),
  (26, 15, 'CELULAR',     'Apple',    'iPhone 15',        'F2LX1Q2W33',   'Rosa',       2023, 'Puerto Lightning no carga',            'Funda'),
  (27, 16, 'TABLET',      'Apple',    'iPad Air 5',        'F2LX5R6T78',   'Azul',       2023, 'Pantalla con rayas',                   'Cargador'),
  (28,  8, 'CELULAR',     'Xiaomi',   'Poco F5',           'MI-F5-6640',   'Negro',      2023, 'Se apaga al conectar el cargador',      'Cargador turbo'),
  (29, 11, 'LAPTOP',      'Dell',     'Inspiron 3520',     'DL-3520-9012', 'Plata',      2021, 'No escribe en algunas teclas',         'Cargador'),
  (30, 14, 'CELULAR',     'Samsung',  'Galaxy Z Flip 4',  'SM-F946B',     'Negro',      2023, 'La bisagra esta suelta',               'Funda'),
  (31,  9, 'TABLET',      'Lenovo',   'Tab P11',           'LN-P11-2201',  'Gris',       2022, 'No carga y la pantalla parpadea',       'Cargador'),
  (32,  1, 'CELULAR',     'Samsung',  'Galaxy A05',       'SM-A055F',     'Negro',      2023, 'No enciende tras mojarse',             'Cargador'),
  (33,  2, 'LAPTOP',      'Asus',     'VivoBook 15',       'AS-VB15-3341', 'Gris',       2022, 'Se apaga al desconectar el cargador',  'Cargador'),
  (34,  5, 'TABLET',      'Samsung',  'Galaxy Tab S6',     'SM-T860-7781', 'Gris',       2021, 'El cargador no responde',              'Funda, S Pen'),
  (35, 10, 'CELULAR',     'Apple',    'iPhone 11',         'F2LX8W3Q66',   'Blanco',     2021, 'Pantalla con manchas',                 'Funda'),
  (36,  4, 'LAPTOP',      'Lenovo',   'ThinkPad E14',      'LN-E14-9081',  'Negro',      2023, 'No abre el explorador de archivos',    'Cargador'),
  (37,  6, 'CELULAR',     'Motorola', 'Moto G34',          'MT-G34-5510',  'Azul',       2024, 'El altavoz no suena',                  'Cargador'),
  (38,  8, 'COMPUTADORA', 'Acer',     'Aspire 3',          'AC-A3-2201',   'Negro',      2019, 'Motherboard quemada',                  NULL),
  (39,  3, 'CELULAR',     'Xiaomi',   'Redmi Note 11',     'MI-N11-2299',  'Gris',       2022, 'No carga, puerto danado',              'Funda'),
  (40,  1, 'COMPUTADORA', 'HP',       'All-in-One 24',     'HP-AIO-5566',  'Blanco',     2020, 'El ventilador hace mucho ruido',        'Teclado y mouse'),
  (41,  4, 'TABLET',      'Apple',    'iPad 8va gen',      'DMPX2201ABCD', 'Gris',       2021, 'No enciende',                          'Funda'),
  (42,  8, 'CELULAR',     'OnePlus',  'Nord 3',            'OP-N3-7711',   'Verde',      2024, 'No enciende la pantalla',              'Funda'),
  (43, 12, 'LAPTOP',      'HP',       'Victus 15',         'HP-V15-3344',  'Negro',      2022, 'La bateria dura 20 minutos',           'Cargador'),
  (44,  1, 'TABLET',      'Samsung',  'Galaxy Tab A8',     'SM-X200-1190', 'Gris',       2021, 'No carga',                             'Funda'),
  (45,  2, 'LAPTOP',      'Acer',     'Swift Go 14',       'AC-SG14-2201', 'Plata',      2023, 'El teclado numerico no funciona',       'Cargador'),
  (46,  6, 'IMPRESORA',   'Brother',  'HL-L2321DW',        'BR-L2321-2210','Blanco',     2021, 'Atasca con frecuencia',                NULL);

-- 14.3 Repuestos adicionales ---------------------------------------------------
--     REP-0014 y REP-0015 se dejan deliberadamente en o por debajo de su stock
--     minimo y REP-0015 en cero, para que la bandeja de alertas del tablero
--     tenga con que trabajar desde el primer arranque.
INSERT INTO `repuesto`
  (`id_repuesto`, `id_proveedor`, `codigo`, `nombre`, `descripcion`, `marca`, `stock`, `stock_minimo`, `costo_unitario`)
VALUES
  (11, 1, 'REP-0011', 'Bateria iPhone 13',            'Bateria Litio-Ion de reemplazo',            'Apple',     9, 3, 145.00),
  (12, 2, 'REP-0012', 'Pantalla iPhone 12 mini',      'Display OLED original',                      'Apple',     5, 2, 320.00),
  (13, 1, 'REP-0013', 'Camara trasera iPhone 14',     'Modulo de camara triple',                    'Apple',     3, 2, 275.00),
  (14, 3, 'REP-0014', 'Ventilador HP ProBook 450',    'Fan cooler de reemplazo',                    'HP',        2, 2,  68.00),
  (15, 1, 'REP-0015', 'Tinta Epson L3250',            'Botella de tinta cyan',                      'Epson',     0, 2,  55.00),
  (16, 2, 'REP-0016', 'Teclado Lenovo IdeaPad',       'Teclado replacement US',                     'Lenovo',    3, 2,  95.00),
  (17, 2, 'REP-0017', 'Pantalla Moto G84',            'Display con digitador tactil',               'Motorola',  4, 2, 190.00),
  (18, 2, 'REP-0018', 'Fuente de poder 500W ATX',     'Fuente con certificacion 80 Plus',          'Generico',  6, 2, 120.00),
  (19, 3, 'REP-0019', 'Teclado Dell Inspiron 3520',   'Teclado replacement con teclado espanol',    'Dell',      4, 2, 105.00),
  (20, 1, 'REP-0020', 'Pantalla Redmi Note 13',       'Display AMOLED con marco',                  'Xiaomi',    4, 2, 145.00),
  (21, 1, 'REP-0021', 'Conector Lightning iPhone 15', 'Puerto Lightning original',                  'Apple',     6, 2,  45.00),
  (22, 1, 'REP-0022', 'Microfono iPhone 12 mini',     'Microfono principal de reemplazo',           'Apple',     5, 2,  55.00),
  (23, 2, 'REP-0023', 'Pantalla iPad Air 5',          'Display de reemplazo completo',              'Apple',     4, 2, 380.00),
  (24, 1, 'REP-0024', 'Flex main OnePlus Nord 3',     'Flex principal de imagen',                   'OnePlus',   4, 2,  75.00),
  (25, 2, 'REP-0025', 'Bateria HP Victus 15',         'Bateria de 4 celdas',                        'HP',        5, 2, 155.00),
  (26, 1, 'REP-0026', 'Bateria iPad 8va gen',         'Bateria de 32.9Wh',                          'Apple',     6, 2, 130.00),
  (27, 3, 'REP-0027', 'Kit rodillos Brother L2321',   'Juego de rodillos de traccion',              'Brother',   5, 2,  88.00);

-- 14.4 Ordenes de servicio ----------------------------------------------------
--     Los dias se cuentan hacia atras desde hoy, de modo que el historial
--     siempre queda repartido entre el mes en curso y el anterior y las
--     comparaciones de la tarjeta de ingresos tienen sentido.
INSERT INTO `orden_servicio`
  (`id_cliente`, `id_equipo`, `id_tecnico`, `estado`, `fecha_recepcion`, `fecha_diagnostico`,
   `fecha_aprobacion`, `fecha_entrega`, `falla_reportada`, `diagnostico`, `solucion`,
   `costo_diagnostico`, `costo_mano_obra`, `costo_adicional`, `prioridad`, `garantia_dias`,
   `id_usuario_registro`, `observaciones`)
VALUES
  -- Entregadas del mes anterior
  ( 7,  8, 1, 'ENTREGADO', DATE_SUB(NOW(), INTERVAL 53 DAY), DATE_SUB(NOW(), INTERVAL 51 DAY), DATE_SUB(NOW(), INTERVAL 50 DAY), DATE_SUB(NOW(), INTERVAL 48 DAY),
   'La bateria dura 3 horas', 'Bateria con 3 ciclos de carga y 71% de capacidad health.', 'Se reemplazo la bateria por una nueva. Carga verificada al 100%.',
   30.00, 120.00, 0.00, 'NORMAL', 90, 2, NULL),
  ( 8, 10, 3, 'ENTREGADO', DATE_SUB(NOW(), INTERVAL 49 DAY), DATE_SUB(NOW(), INTERVAL 47 DAY), DATE_SUB(NOW(), INTERVAL 46 DAY), DATE_SUB(NOW(), INTERVAL 44 DAY),
   'Pantalla rota por caida', 'Display con el marco separado y el panel rajado.', 'Cambio de pantalla OLED. Digitador tactil verificado.',
   35.00, 150.00, 0.00, 'NORMAL', 30, 2, NULL),
  (11, 15, 2, 'ENTREGADO', DATE_SUB(NOW(), INTERVAL 45 DAY), DATE_SUB(NOW(), INTERVAL 43 DAY), DATE_SUB(NOW(), INTERVAL 42 DAY), DATE_SUB(NOW(), INTERVAL 40 DAY),
   'El ventilador hace mucho ruido', 'Fan con el eje desgastado y el cooler bloqueado.', 'Se cambio el ventilador y se limpio el sistema de refrigeracion.',
   25.00,  90.00, 0.00, 'NORMAL', 90, 2, NULL),
  ( 9, 11, 1, 'ENTREGADO', DATE_SUB(NOW(), INTERVAL 41 DAY), DATE_SUB(NOW(), INTERVAL 39 DAY), DATE_SUB(NOW(), INTERVAL 38 DAY), DATE_SUB(NOW(), INTERVAL 36 DAY),
   'No detecta la tarjeta SIM', 'Slot SIM con los pines sucios y el detector oxidado.', 'Limpieza profunda del slot y prueba con dos lineas.',
   30.00,  60.00, 0.00, 'NORMAL', 30, 2, NULL),
  (16, 22, 3, 'ENTREGADO', DATE_SUB(NOW(), INTERVAL 38 DAY), DATE_SUB(NOW(), INTERVAL 36 DAY), DATE_SUB(NOW(), INTERVAL 35 DAY), DATE_SUB(NOW(), INTERVAL 33 DAY),
   'Golpe en la parte trasera', 'Cristal trasero fracturado y marco deformado.', 'Reemplazo de tapa trasera y ajuste del marco.',
   30.00, 100.00, 0.00, 'NORMAL', 30, 2, NULL),
  (10, 14, 2, 'ENTREGADO', DATE_SUB(NOW(), INTERVAL 35 DAY), DATE_SUB(NOW(), INTERVAL 33 DAY), DATE_SUB(NOW(), INTERVAL 32 DAY), DATE_SUB(NOW(), INTERVAL 30 DAY),
   'Puerto de carga suelto', 'Conector de carga desoldado de la placa.', 'Re-soldado del conector y prueba de carga completa.',
   30.00,  70.00, 0.00, 'NORMAL', 60, 2, NULL),
  ( 1, 44, 3, 'ENTREGADO', DATE_SUB(NOW(), INTERVAL 58 DAY), DATE_SUB(NOW(), INTERVAL 56 DAY), DATE_SUB(NOW(), INTERVAL 55 DAY), DATE_SUB(NOW(), INTERVAL 54 DAY),
   'No carga, puerto danado', 'Puerto de carga con los pines doblados.', 'Cambio del puerto de carga.',
   30.00,  85.00, 0.00, 'NORMAL', 30, 2, NULL),
  ( 2, 45, 1, 'ENTREGADO', DATE_SUB(NOW(), INTERVAL 60 DAY), DATE_SUB(NOW(), INTERVAL 58 DAY), DATE_SUB(NOW(), INTERVAL 57 DAY), DATE_SUB(NOW(), INTERVAL 56 DAY),
   'El teclado numerico no funciona', 'Membrane del tecladopad con teclas en corto.', 'Se reparo la membrana del tecladopad.',
   25.00,  70.00, 0.00, 'BAJA',   90, 2, NULL),
  ( 6, 46, 2, 'ENTREGADO', DATE_SUB(NOW(), INTERVAL 56 DAY), DATE_SUB(NOW(), INTERVAL 52 DAY), DATE_SUB(NOW(), INTERVAL 51 DAY), DATE_SUB(NOW(), INTERVAL 50 DAY),
   'Atasca con frecuencia', 'Rodillo de traccion desgastado y motor sin fuerza.', 'Cambio del kit de rodillos y reengrase.',
   30.00,  75.00, 0.00, 'NORMAL', 60, 2, NULL),
  -- Entregadas del mes en curso
  (13, 17, 1, 'ENTREGADO', DATE_SUB(NOW(), INTERVAL 32 DAY), DATE_SUB(NOW(), INTERVAL 30 DAY), DATE_SUB(NOW(), INTERVAL 29 DAY), DATE_SUB(NOW(), INTERVAL 27 DAY),
   'Altavoz con distorsion', 'Membrana del altavoz deformada por el golpe.', 'Cambio del modulo de altavoz.',
   25.00,  80.00, 0.00, 'NORMAL', 20, 2, NULL),
  (12, 16, 3, 'ENTREGADO', DATE_SUB(NOW(), INTERVAL 29 DAY), DATE_SUB(NOW(), INTERVAL 27 DAY), DATE_SUB(NOW(), INTERVAL 26 DAY), DATE_SUB(NOW(), INTERVAL 24 DAY),
   'Cambio de pantalla', 'Display con lineas verticales y touch sin respuesta.', 'Cambio de pantalla y digitador.',
   30.00, 110.00, 0.00, 'NORMAL', 15, 2, NULL),
  (14, 19, 1, 'ENTREGADO', DATE_SUB(NOW(), INTERVAL 26 DAY), DATE_SUB(NOW(), INTERVAL 24 DAY), DATE_SUB(NOW(), INTERVAL 23 DAY), DATE_SUB(NOW(), INTERVAL 21 DAY),
   'La camara trasera no enfoca', 'Lente principal con microfractura en el vidrio.', 'Cambio del modulo de camara trasera.',
   35.00, 150.00, 0.00, 'NORMAL', 30, 2, NULL),
  ( 9, 12, 2, 'ENTREGADO', DATE_SUB(NOW(), INTERVAL 23 DAY), DATE_SUB(NOW(), INTERVAL 21 DAY), DATE_SUB(NOW(), INTERVAL 20 DAY), DATE_SUB(NOW(), INTERVAL 18 DAY),
   'Se reinicia solo', 'Fuente de alimentacion con ripple alto y proteccion disparada.', 'Se reemplazo la fuente por una nueva de 500W.',
   25.00,  80.00, 0.00, 'NORMAL', 30, 2, NULL),
  (15, 20, 1, 'ENTREGADO', DATE_SUB(NOW(), INTERVAL 19 DAY), DATE_SUB(NOW(), INTERVAL 17 DAY), DATE_SUB(NOW(), INTERVAL 16 DAY), DATE_SUB(NOW(), INTERVAL 9 DAY),
   'Se sobrecalienta al jugar', 'Pasta termica seca y disipador obstruido por polvo.', 'Limpieza, cambio de pasta termica y verificacion de temperaturas.',
   40.00, 180.00, 0.00, 'ALTA',   20, 2, NULL),
  ( 8, 42, 2, 'ENTREGADO', DATE_SUB(NOW(), INTERVAL 12 DAY), DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_SUB(NOW(), INTERVAL 9 DAY),  DATE_SUB(NOW(), INTERVAL 7 DAY),
   'No enciende la pantalla', 'Flex principal de imagen con pistas cortadas.', 'Cambio del flex principal de pantalla.',
   30.00, 110.00, 0.00, 'URGENTE', 30, 2, NULL),
  (12, 43, 1, 'ENTREGADO', DATE_SUB(NOW(), INTERVAL 9 DAY),  DATE_SUB(NOW(), INTERVAL 7 DAY),  DATE_SUB(NOW(), INTERVAL 6 DAY),  DATE_SUB(NOW(), INTERVAL 5 DAY),
   'La bateria dura 20 minutos', 'Celda de bateria con 780 ciclos de carga.', 'Cambio de bateria del equipo.',
   25.00,  95.00, 0.00, 'NORMAL', 60, 2, NULL),
  (16, 23, 2, 'ENTREGADO', DATE_SUB(NOW(), INTERVAL 16 DAY), DATE_SUB(NOW(), INTERVAL 14 DAY), DATE_SUB(NOW(), INTERVAL 13 DAY), DATE_SUB(NOW(), INTERVAL 11 DAY),
   'La bateria no carga al 100%', 'Celda con 402 ciclos y calibracion perdida.', 'Recalibracion de bateria y verificacion de ciclos.',
   40.00, 160.00, 0.00, 'NORMAL', 20, 2, NULL),
  ( 3, 39, 2, 'ENTREGADO', DATE_SUB(NOW(), INTERVAL 57 DAY), DATE_SUB(NOW(), INTERVAL 55 DAY), DATE_SUB(NOW(), INTERVAL 54 DAY), DATE_SUB(NOW(), INTERVAL 52 DAY),
   'No carga, puerto danado', 'Puerto USB-C con los pines rotos.', 'Cambio del puerto de carga.',
   25.00,  65.00, 0.00, 'NORMAL', 30, 2, NULL),
  ( 1, 40, 1, 'ENTREGADO', DATE_SUB(NOW(), INTERVAL 53 DAY), DATE_SUB(NOW(), INTERVAL 51 DAY), DATE_SUB(NOW(), INTERVAL 50 DAY), DATE_SUB(NOW(), INTERVAL 48 DAY),
   'El ventilador hace mucho ruido', 'Fan del disipador con ruido mecanico.', 'Cambio de ventilador y limpieza interna.',
   30.00,  95.00, 0.00, 'NORMAL', 90, 2, NULL),
  ( 4, 41, 3, 'ENTREGADO', DATE_SUB(NOW(), INTERVAL 50 DAY), DATE_SUB(NOW(), INTERVAL 48 DAY), DATE_SUB(NOW(), INTERVAL 47 DAY), DATE_SUB(NOW(), INTERVAL 45 DAY),
   'No enciende', 'Bateria agotada y boton de power sin respuesta.', 'Cambio de bateria y limpieza del conector.',
   30.00,  80.00, 0.00, 'NORMAL', 60, 2, NULL),
  -- Listas para entrega
  ( 7,  9, 2, 'LISTO', DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY), NULL,
   'No arranca y hace ruido al iniciar', 'Disco HDD con sectores danados y ruido mecanico.', 'Se clono el disco y se instalo un SSD NVMe.',
   30.00, 140.00, 0.00, 'NORMAL', 30, 2, 'Equipo probado y listo para recoger'),
  (13, 18, 3, 'LISTO', DATE_SUB(NOW(), INTERVAL 4 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY), NULL,
   'Puerto de carga danado', 'Flex de carga con pistas cortadas.', 'Cambio del flex de carga.',
   25.00,  60.00, 0.00, 'NORMAL', 30, 2, NULL),
  (10, 13, 2, 'LISTO', DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), NULL,
   'No enciende el microfono', 'Microfono principal deshabilitado por dano en el conector.', 'Cambio de microfono y prueba de grabacion.',
   30.00,  90.00, 0.00, 'ALTA',   30, 2, 'Cliente avisado por WhatsApp'),
  -- En reparacion
  ( 8, 28, 1, 'EN_REPARACION', DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY), NULL,
   'Se apaga al conectar el cargador', 'IC de control de carga con la soldadura fracturada.', 'En proceso de resoldado del IC de carga.',
   30.00, 110.00, 0.00, 'ALTA',   30, 2, NULL),
  (11, 29, 3, 'EN_REPARACION', DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 5 DAY), NULL,
   'No escribe en algunas teclas', 'Membrana del teclado con doble contactacion.', 'En proceso de reemplazo del teclado.',
   25.00,  95.00, 0.00, 'NORMAL', 30, 2, NULL),
  (14, 30, 2, 'EN_REPARACION', DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), NULL,
   'La bisagra esta suelta', 'Ejes de la bisagra desgastados y marco con stress marks.', 'En proceso de reemplazo de bisagra.',
   30.00, 130.00, 0.00, 'URGENTE',30, 2, 'Cliente con cita de recogida'),
  -- Presupuestadas
  (16, 27, 1, 'PRESUPUESTADO', DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), NULL,
   'Pantalla con rayas', 'Cristal del display con microfracturas en el sector superior.', 'Pendiente de aprobacion del cliente.',
   30.00, 120.00, 0.00, 'NORMAL', 30, 2, NULL),
  ( 7, 24, 2, 'PRESUPUESTADO', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 20 HOUR), DATE_SUB(NOW(), INTERVAL 12 HOUR), NULL,
   'Franja negra en la pantalla', 'Panel LCD con dano en el driver de imagen.', 'Pendiente de aprobacion del cliente.',
   25.00,  95.00, 0.00, 'NORMAL', 30, 2, NULL),
  (15, 26, 3, 'PRESUPUESTADO', DATE_SUB(NOW(), INTERVAL 4 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR), NULL,
   'Puerto Lightning no carga', 'Puerto Lightning con los pines doblados.', 'Pendiente de aprobacion del cliente.',
   30.00, 100.00, 0.00, 'NORMAL', 30, 2, NULL),
  -- En diagnostico
  (12, 25, 1, 'EN_DIAGNOSTICO', DATE_SUB(NOW(), INTERVAL 1 DAY), NULL, NULL, NULL,
   'No detecta el disco duro', NULL, NULL, 0.00, 0.00, 0.00, 'NORMAL', 30, 2, NULL),
  (15, 21, 2, 'EN_DIAGNOSTICO', DATE_SUB(NOW(), INTERVAL 6 HOUR), NULL, NULL, NULL,
   'Imprime con manchas', NULL, NULL, 0.00, 0.00, 0.00, 'BAJA', 30, 2, NULL),
  ( 9, 31, 3, 'EN_DIAGNOSTICO', DATE_SUB(NOW(), INTERVAL 3 HOUR), NULL, NULL, NULL,
   'No carga y la pantalla parpadea', NULL, NULL, 0.00, 0.00, 0.00, 'NORMAL', 30, 2, NULL),
  -- Recibidas, aun sin tecnico asignado
  ( 1, 32, NULL, 'RECIBIDO', DATE_SUB(NOW(), INTERVAL 5 HOUR), NULL, NULL, NULL,
   'No enciende tras mojarse', NULL, NULL, 0.00, 0.00, 0.00, 'ALTA',   30, 2, 'Cliente urijo del equipo con recibo'),
  ( 2, 33, NULL, 'RECIBIDO', DATE_SUB(NOW(), INTERVAL 9 HOUR), NULL, NULL, NULL,
   'Se apaga al desconectar el cargador', NULL, NULL, 0.00, 0.00, 0.00, 'NORMAL', 30, 2, NULL),
  ( 5, 34, NULL, 'RECIBIDO', DATE_SUB(NOW(), INTERVAL 2 HOUR), NULL, NULL, NULL,
   'El cargador no responde', NULL, NULL, 0.00, 0.00, 0.00, 'BAJA', 30, 2, NULL),
  (10, 35, NULL, 'RECIBIDO', DATE_SUB(NOW(), INTERVAL 1 DAY), NULL, NULL, NULL,
   'Pantalla con manchas', NULL, NULL, 0.00, 0.00, 0.00, 'NORMAL', 30, 2, NULL),
  ( 4, 36, NULL, 'RECIBIDO', DATE_SUB(NOW(), INTERVAL 20 HOUR), NULL, NULL, NULL,
   'No abre el explorador de archivos', NULL, NULL, 0.00, 0.00, 0.00, 'BAJA', 30, 2, 'Equipo corporativo, factura a nombre de la empresa'),
  ( 6, 37, NULL, 'RECIBIDO', DATE_SUB(NOW(), INTERVAL 40 HOUR), NULL, NULL, NULL,
   'El altavoz no suena', NULL, NULL, 0.00, 0.00, 0.00, 'NORMAL', 30, 2, NULL),
  -- Cancelada por el cliente
  ( 8, 38, NULL, 'CANCELADO', DATE_SUB(NOW(), INTERVAL 11 DAY), DATE_SUB(NOW(), INTERVAL 9 DAY), NULL, NULL,
   'Motherboard quemada', 'Placa madre con corto en el sector de alimentacion; el reemplazo superaba el 70% del equipo.', 'Orden cancelada por el cliente, no se realizo el trabajo.',
   25.00, 0.00, 0.00, 'NORMAL', 0, 2, 'Se informo el costo antes de cancelar');

-- 14.5 Repuestos aplicados a las ordenes -------------------------------------
--     Los id_orden van del 6 al 44: el 1 al 5 pertenecen a las ordenes de la
--     seccion 9, que ya consumieron sus repuestos.
INSERT INTO `detalle_servicio` (`id_orden`, `id_repuesto`, `concepto`, `descripcion`, `cantidad`) VALUES
  (12,  3, 'REPUESTO', 'Conector de carga USB-C',                    1),
  (14, 27, 'REPUESTO', 'Kit de rodillos Brother L2321',               1),
  (16, 17, 'REPUESTO', 'Pantalla con digitador para Moto G84',         1),
  (17, 13, 'REPUESTO', 'Camara trasera triple para iPhone 14',         1),
  (18, 18, 'REPUESTO', 'Fuente de poder 500W ATX',                    1),
  (20, 24, 'REPUESTO', 'Flex main OnePlus Nord 3',                    1),
  (21, 25, 'REPUESTO', 'Bateria HP Victus 15',                        1),
  (23,  3, 'REPUESTO', 'Conector de carga USB-C',                    1),
  (25, 26, 'REPUESTO', 'Bateria iPad 8va generacion',                  1),
  (26,  4, 'REPUESTO', 'SSD NVMe de 512GB para la migracion',         1),
  (27,  9, 'REPUESTO', 'Flex de carga Redmi Note',                    1),
  (28, 22, 'REPUESTO', 'Microfono principal iPhone 12 mini',           1),
  (30, 19, 'REPUESTO', 'Teclado Dell Inspiron 3520',                  1),
  (32, 23, 'REPUESTO', 'Pantalla iPad Air 5',                          1),
  (33, 20, 'REPUESTO', 'Pantalla Redmi Note 13',                       1),
  (34, 21, 'REPUESTO', 'Conector Lightning iPhone 15',                1);

-- Los triggers de RN-05 solo recalculan costo_final y saldo cuando la orden
-- recibe un UPDATE, de modo que despues de agregar los repuestos hay que
-- tocar cada orden para que su total incluya los conceptos nuevos.
UPDATE `orden_servicio` SET `observaciones` = `observaciones`;

-- 14.6 Pagos e ingresos --------------------------------------------------------
--     El trigger trg_pago_economia_ai emite el movimiento de INGRESO con la
--     fecha del pago, que es lo que alimenta la serie diaria y la comparacion
--     entre el mes en curso y el anterior. Las ordenes 6 a 25 se pagaron
--     completas; de las que siguen abiertas, solo tres tienen abono.
INSERT INTO `pago` (`id_orden`, `id_usuario`, `monto`, `fecha`, `metodo`, `referencia`) VALUES
  ( 6, 2, 150.00, DATE_SUB(NOW(), INTERVAL 48 DAY), 'YAPE',            'YAPE-77012'),
  ( 7, 2, 185.00, DATE_SUB(NOW(), INTERVAL 44 DAY), 'TARJETA_CREDITO', '****4417'),
  ( 8, 2, 115.00, DATE_SUB(NOW(), INTERVAL 40 DAY), 'TRANSFERENCIA',   'OP-99310'),
  ( 9, 2,  90.00, DATE_SUB(NOW(), INTERVAL 36 DAY), 'EFECTIVO',        'REC-A-118'),
  (10, 2, 130.00, DATE_SUB(NOW(), INTERVAL 33 DAY), 'YAPE',            'YAPE-77330'),
  (11, 2, 100.00, DATE_SUB(NOW(), INTERVAL 30 DAY), 'TARJETA_DEBITO',  '****8821'),
  (12, 2, 127.50, DATE_SUB(NOW(), INTERVAL 54 DAY), 'EFECTIVO',        'REC-A-120'),
  (13, 2,  95.00, DATE_SUB(NOW(), INTERVAL 56 DAY), 'EFECTIVO',        'REC-A-121'),
  (14, 2, 193.00, DATE_SUB(NOW(), INTERVAL 50 DAY), 'TARJETA_CREDITO', '****4417'),
  (15, 2, 105.00, DATE_SUB(NOW(), INTERVAL 27 DAY), 'YAPE',            'YAPE-77601'),
  (16, 2, 330.00, DATE_SUB(NOW(), INTERVAL 24 DAY), 'TARJETA_CREDITO', '****4417'),
  (17, 2, 460.00, DATE_SUB(NOW(), INTERVAL 21 DAY), 'TRANSFERENCIA',   'OP-99320'),
  (18, 2, 225.00, DATE_SUB(NOW(), INTERVAL 18 DAY), 'YAPE',            'YAPE-77702'),
  (19, 2, 220.00, DATE_SUB(NOW(), INTERVAL  9 DAY), 'TARJETA_CREDITO', '****4417'),
  (20, 2, 215.00, DATE_SUB(NOW(), INTERVAL  7 DAY), 'TARJETA_DEBITO',  '****8821'),
  (21, 2, 275.00, DATE_SUB(NOW(), INTERVAL  5 DAY), 'TARJETA_CREDITO', '****4417'),
  (22, 2, 200.00, DATE_SUB(NOW(), INTERVAL 11 DAY), 'TRANSFERENCIA',   'OP-99325'),
  (23, 2, 102.50, DATE_SUB(NOW(), INTERVAL 52 DAY), 'EFECTIVO',        'REC-A-119'),
  (24, 2, 125.00, DATE_SUB(NOW(), INTERVAL 48 DAY), 'YAPE',            'YAPE-77415'),
  (25, 2, 240.00, DATE_SUB(NOW(), INTERVAL 45 DAY), 'TRANSFERENCIA',   'OP-99311'),
  (26, 2, 200.00, DATE_SUB(NOW(), INTERVAL  4 HOUR), 'YAPE',          'YAPE-77810'),
  (28, 2, 120.00, DATE_SUB(NOW(), INTERVAL  2 HOUR), 'EFECTIVO',      'REC-B-140'),
  (30, 2, 100.00, DATE_SUB(NOW(), INTERVAL  1 DAY),  'YAPE',          'YAPE-77815');

-- Un comprobante por pago (uq_comprobante_pago), y solo para los que aun no
-- lo tengan: los cuatro pagos de la seccion 11 ya lo emitieron.
INSERT INTO `comprobante_pago` (`id_pago`, `tipo`, `total`)
  SELECT p.`id_pago`, 'BOLETA', p.`monto`
    FROM `pago` p
   WHERE p.`monto` < 200.00
     AND NOT EXISTS (SELECT 1 FROM `comprobante_pago` cp WHERE cp.`id_pago` = p.`id_pago`);

INSERT INTO `comprobante_pago` (`id_pago`, `tipo`, `total`)
  SELECT p.`id_pago`, 'FACTURA', p.`monto`
    FROM `pago` p
   WHERE p.`monto` >= 200.00
     AND NOT EXISTS (SELECT 1 FROM `comprobante_pago` cp WHERE cp.`id_pago` = p.`id_pago`);

-- 14.7 Egresos del periodo ---------------------------------------------------
--     Los egresos se cargan todos en la seccion 12, ya repartidos entre el mes
--     en curso y el anterior para que ambos periodos sean comparables.

-- 14.8 Mensajes de la bandeja -------------------------------------------------
INSERT INTO `mensaje` (`id_usuario`, `id_cliente`, `id_orden`, `canal`, `asunto`, `contenido`, `leido`, `fecha_envio`) VALUES
  (2,  7,  6, 'WHATSAPP', 'Equipo entregado',
     'Hola Diego, tu iPhone 13 ya esta listo para recoger en el taller.', 1, DATE_SUB(NOW(), INTERVAL 48 DAY)),
  (3,  8,  7, 'SISTEMA',  'Presupuesto enviado',
     'Se envio el presupuesto de la pantalla del Galaxy S22.', 0, DATE_SUB(NOW(), INTERVAL 44 DAY)),
  (2,  9,  9, 'SMS',      'Reparacion terminada',
     'Su Poco X5 Pro salio de taller, puede pasar a recogerlo.', 0, DATE_SUB(NOW(), INTERVAL 36 DAY)),
  (2, 10, 11, 'SISTEMA',  'Aviso de garantia',
     'La orden de su Galaxy Tab A9 tiene 60 dias de garantia vigente.', 0, DATE_SUB(NOW(), INTERVAL 6 DAY)),
  (2, 11,  8, 'WHATSAPP', 'Consulta de garantia',
     'La garantia de su laptop HP vence pronto. La revision es sin costo.', 0, DATE_SUB(NOW(), INTERVAL 3 DAY)),
  (3, 12, 35, 'SISTEMA',  'Equipo en diagnostico',
     'Su Acer Nitro V5 esta siendo revisado por el tecnico asignado.', 0, DATE_SUB(NOW(), INTERVAL 1 DAY)),
  (2, 13, 27, 'SISTEMA',  'Presupuesto disponible',
     'El presupuesto de su Redmi 13C ya esta disponible en el sistema.', 0, DATE_SUB(NOW(), INTERVAL 4 DAY)),
  (2, 14, 31, 'SISTEMA',  'Reparacion en curso',
     'Su Galaxy Z Flip 4 esta en proceso de reemplazo de bisagra.', 0, DATE_SUB(NOW(), INTERVAL 2 DAY));


-- -----------------------------------------------------------------------------
-- 15. AJUSTE DE LA SECUENCIA DE ORDENES
--     Las ordenes de prueba y el historial consumeson los correlativos desde
--     OS-000001, por lo que la siguiente orden debe seguir al ultimo insertado
--     y no volver a OS-000001.
-- -----------------------------------------------------------------------------
UPDATE `secuencia` SET `valor` = (SELECT COUNT(*) FROM `orden_servicio`) WHERE `nombre` = 'orden_servicio';

SET SQL_MODE = @OLD_SQL_MODE;

-- =============================================================================
--  FIN DE 03_seed.sql
--  Verificacion sugerida:
--    SELECT * FROM v_indicadores;
--    SELECT numero, estado, costo_final, total_pagado, saldo FROM v_orden_consolidada;
-- =============================================================================
