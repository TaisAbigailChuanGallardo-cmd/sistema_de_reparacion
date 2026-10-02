-- =============================================================================
--  SISTEMA DE GESTION INTEGRAL PARA UNA EMPRESA DE REPARACION
--  DE CELULARES Y EQUIPOS TECNOLOGICOS
-- =============================================================================
--  Archivo   : 01_schema.sql
--  Etapa     : 02 - Diseno de base de datos
--  Motor     : MySQL 8.0+ / 8.4
--  Fuente    : "Trabajo POO Taller - Modelo inicial del dominio y
--              especificacion de requerimientos" (Guia Practica N.02)
--
--  Este script NO contiene los triggers de negocio: esos estan en
--  02_triggers.sql, que implementa las reglas RN-01 a RN-07.
--
--  Orden de ejecucion:
--     01_schema.sql  ->  02_triggers.sql  ->  03_seed.sql
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET time_zone = '-05:00';

CREATE DATABASE IF NOT EXISTS `taller_reparacion`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `taller_reparacion`;

DROP TABLE IF EXISTS `orden_estado_historial`;
DROP TABLE IF EXISTS `secuencia`;
DROP TABLE IF EXISTS `parametro`;
DROP TABLE IF EXISTS `mensaje`;
DROP TABLE IF EXISTS `movimiento_economico`;
DROP TABLE IF EXISTS `comprobante_pago`;
DROP TABLE IF EXISTS `pago`;
DROP TABLE IF EXISTS `detalle_servicio`;
DROP TABLE IF EXISTS `orden_servicio`;
DROP TABLE IF EXISTS `repuesto`;
DROP TABLE IF EXISTS `proveedor`;
DROP TABLE IF EXISTS `tecnico`;
DROP TABLE IF EXISTS `equipo`;
DROP TABLE IF EXISTS `cliente`;
DROP TABLE IF EXISTS `plan_beneficio`;
DROP TABLE IF EXISTS `suscripcion`;
DROP TABLE IF EXISTS `plan`;
DROP TABLE IF EXISTS `usuario`;
DROP TABLE IF EXISTS `rol`;

SET FOREIGN_KEY_CHECKS = 1;


-- Parametros de negocio ajustables sin desplegar codigo. La RN-07 lee de aqui
-- el limite de ordenes activas por tecnico.
CREATE TABLE `parametro` (
  `nombre`      VARCHAR(50) NOT NULL,
  `valor`       VARCHAR(100) NOT NULL,
  `descripcion` VARCHAR(255) DEFAULT NULL,
  `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`nombre`)
) ENGINE=InnoDB;

INSERT INTO `parametro` (`nombre`, `valor`, `descripcion`) VALUES
  ('max_ordenes_por_tecnico', '5', 'RN-07: maximo de ordenes activas simultaneas por tecnico'),
  ('monto_minimo_diagnostico', '0.00', 'Cobro minimo por diagnostico'),
  ('dias_garantia_por_defecto', '30', 'Garantia por defecto de fabricacion');


-- Tabla tecnica de contadores. Resuelve la generacion del numero unico de
-- orden (RF-03) y de comprobante sin carreras bajo concurrencia: el trigger
-- toma un bloqueo de fila (SELECT ... FOR UPDATE) sobre la fila del contador.
CREATE TABLE `secuencia` (
  `nombre`   VARCHAR(40) NOT NULL,
  `valor`    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`nombre`)
) ENGINE=InnoDB;

INSERT INTO `secuencia` (`nombre`, `valor`) VALUES
  ('orden_servicio', 0),
  ('comprobante_boleta', 0),
  ('comprobante_factura', 0),
  ('tecnico', 0);


-- =============================================================================
--  SECCION 1. SEGURIDAD Y CONTROL DE ACCESO
--  Catalogo de clases: Rol, Usuario
-- =============================================================================

CREATE TABLE `rol` (
  `id_rol`      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nombre`      VARCHAR(50)  NOT NULL,
  `descripcion` VARCHAR(255) DEFAULT NULL,
  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_rol`),
  UNIQUE KEY `uq_rol_nombre` (`nombre`)
) ENGINE=InnoDB;

CREATE TABLE `usuario` (
  `id_usuario`    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nombre`        VARCHAR(120) NOT NULL,
  `email`         VARCHAR(150) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL COMMENT 'Hash bcrypt, nunca texto plano (RNF-02)',
  `telefono`      VARCHAR(20)  DEFAULT NULL,
  `id_rol`        INT UNSIGNED NOT NULL,
  `estado`        ENUM('ACTIVO','INACTIVO','BLOQUEADO') NOT NULL DEFAULT 'ACTIVO',
  `ultimo_acceso` DATETIME     DEFAULT NULL,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_usuario`),
  UNIQUE KEY `uq_usuario_email` (`email`),
  KEY `ix_usuario_rol` (`id_rol`),
  KEY `ix_usuario_estado` (`estado`),
  CONSTRAINT `fk_usuario_rol`
    FOREIGN KEY (`id_rol`) REFERENCES `rol` (`id_rol`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;


-- =============================================================================
--  SECCION 2. SUSCRIPCIONES Y PLANES
--  Catalogo de clases: Plan, Suscripcion
--  Multiplicidad: Usuario 1 -> 0..* Suscripcion ; Suscripcion 0..* -> 1 Plan
-- =============================================================================

CREATE TABLE `plan` (
  `id_plan`       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nombre`        VARCHAR(80)  NOT NULL,
  `descripcion`   VARCHAR(255) DEFAULT NULL,
  `precio`        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `periodicidad`  ENUM('MENSUAL','TRIMESTRAL','SEMESTRAL','ANUAL') NOT NULL DEFAULT 'MENSUAL',
  `activo`        TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_plan`),
  UNIQUE KEY `uq_plan_nombre` (`nombre`),
  KEY `ix_plan_activo` (`activo`)
) ENGINE=InnoDB;

CREATE TABLE `plan_beneficio` (
  `id_beneficio` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `id_plan`      INT UNSIGNED NOT NULL,
  `beneficio`    VARCHAR(150) NOT NULL,
  `activo`       TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (`id_beneficio`),
  UNIQUE KEY `uq_plan_beneficio` (`id_plan`, `beneficio`),
  CONSTRAINT `fk_plan_beneficio_plan`
    FOREIGN KEY (`id_plan`) REFERENCES `plan` (`id_plan`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `suscripcion` (
  `id_suscripcion` INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `id_usuario`     INT UNSIGNED  NOT NULL,
  `id_plan`        INT UNSIGNED  NOT NULL,
  `fecha_inicio`   DATE          NOT NULL,
  `fecha_fin`      DATE          DEFAULT NULL COMMENT 'NULL = suscripcion vigente',
  `monto`          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `estado`         ENUM('ACTIVA','SUSPENDIDA','CANCELADA','VENCIDA') NOT NULL DEFAULT 'ACTIVA',
  `created_at`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_suscripcion`),
  KEY `ix_suscripcion_usuario` (`id_usuario`),
  KEY `ix_suscripcion_plan` (`id_plan`),
  KEY `ix_suscripcion_estado` (`estado`),
  KEY `ix_suscripcion_vigencia` (`fecha_inicio`, `fecha_fin`),
  CONSTRAINT `fk_suscripcion_usuario`
    FOREIGN KEY (`id_usuario`) REFERENCES `usuario` (`id_usuario`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_suscripcion_plan`
    FOREIGN KEY (`id_plan`) REFERENCES `plan` (`id_plan`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;


-- =============================================================================
--  SECCION 3. CLIENTES Y EQUIPOS
--  Catalogo de clases: Cliente, Equipo
--  Multiplicidad: Cliente 1 -> 0..* Equipo
-- =============================================================================

CREATE TABLE `cliente` (
  `id_cliente`      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tipo_documento`  ENUM('DNI','CE','PASAPORTE','RUC') NOT NULL DEFAULT 'DNI',
  `numero_documento` VARCHAR(20) NOT NULL,
  `nombre`          VARCHAR(150) NOT NULL,
  `telefono`        VARCHAR(20)  NOT NULL,
  `email`           VARCHAR(150) DEFAULT NULL,
  `direccion`       VARCHAR(255) DEFAULT NULL,
  `referencia`      VARCHAR(255) DEFAULT NULL COMMENT 'Contacto de referencia',
  `activo`          TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_cliente`),
  UNIQUE KEY `uq_cliente_documento` (`numero_documento`),
  UNIQUE KEY `uq_cliente_email` (`email`),
  KEY `ix_cliente_nombre` (`nombre`),
  KEY `ix_cliente_activo` (`activo`),
  KEY `ix_cliente_telefono` (`telefono`)
) ENGINE=InnoDB;

CREATE TABLE `equipo` (
  `id_equipo`       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `id_cliente`      INT UNSIGNED NOT NULL,
  `tipo`            ENUM('CELULAR','TABLET','LAPTOP','COMPUTADORA','IMPRESORA','OTRO') NOT NULL,
  `marca`           VARCHAR(60)  NOT NULL,
  `modelo`          VARCHAR(80)  NOT NULL,
  `numero_serie`    VARCHAR(80)  NOT NULL,
  `color`           VARCHAR(40)  DEFAULT NULL,
  `anio`            SMALLINT UNSIGNED DEFAULT NULL,
  `falla_reportada` TEXT         DEFAULT NULL COMMENT 'Falla declarada por el cliente en recepcion (RF-02)',
  `estado`          ENUM('EN_TALLER','EN_DIAGNOSTICO','EN_REPARACION','LISTO','ENTREGADO','DE_BAJA') NOT NULL DEFAULT 'EN_TALLER',
  `accesorios_entregados` VARCHAR(255) DEFAULT NULL,
  `created_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_equipo`),
  UNIQUE KEY `uq_equipo_serie` (`numero_serie`),
  KEY `ix_equipo_cliente` (`id_cliente`),
  KEY `ix_equipo_estado` (`estado`),
  KEY `ix_equipo_marca_modelo` (`marca`, `modelo`),
  CONSTRAINT `fk_equipo_cliente`
    FOREIGN KEY (`id_cliente`) REFERENCES `cliente` (`id_cliente`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;


-- =============================================================================
--  SECCION 4. TECNICOS Y PROVEEDORES
--  Catalogo de clases: Tecnico, Proveedor
-- =============================================================================

CREATE TABLE `tecnico` (
  `id_tecnico`   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `codigo`       VARCHAR(20)  NOT NULL,
  `nombre`       VARCHAR(150) NOT NULL,
  `especialidad` VARCHAR(120) NOT NULL,
  `telefono`     VARCHAR(20)  DEFAULT NULL,
  `email`        VARCHAR(150) DEFAULT NULL,
  `activo`       TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_tecnico`),
  UNIQUE KEY `uq_tecnico_codigo` (`codigo`),
  KEY `ix_tecnico_especialidad` (`especialidad`),
  KEY `ix_tecnico_activo` (`activo`)
) ENGINE=InnoDB;

CREATE TABLE `proveedor` (
  `id_proveedor`   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ruc`            VARCHAR(20)  NOT NULL,
  `razon_social`   VARCHAR(180) NOT NULL,
  `contacto_nombre` VARCHAR(120) DEFAULT NULL,
  `telefono`       VARCHAR(20)  DEFAULT NULL,
  `email`          VARCHAR(150) DEFAULT NULL,
  `direccion`      VARCHAR(255) DEFAULT NULL,
  `activo`         TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_proveedor`),
  UNIQUE KEY `uq_proveedor_ruc` (`ruc`),
  KEY `ix_proveedor_razon` (`razon_social`)
) ENGINE=InnoDB;


-- =============================================================================
--  SECCION 5. INVENTARIO DE REPUESTOS
--  Catalogo de clases: Repuesto
--  Multiplicidad: DetalleServicio 0..* -> 1 Repuesto
-- =============================================================================

CREATE TABLE `repuesto` (
  `id_repuesto`    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `id_proveedor`   INT UNSIGNED  DEFAULT NULL,
  `codigo`         VARCHAR(30)   NOT NULL,
  `nombre`         VARCHAR(150)  NOT NULL,
  `descripcion`    VARCHAR(255)  DEFAULT NULL,
  `marca`          VARCHAR(60)   DEFAULT NULL,
  `stock`          INT           NOT NULL DEFAULT 0 COMMENT 'Existencia actual (RN-04)',
  `stock_minimo`   INT           NOT NULL DEFAULT 0 COMMENT 'Umbral de alerta de reposicion',
  `costo_unitario` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `activo`         TINYINT(1)    NOT NULL DEFAULT 1,
  `created_at`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_repuesto`),
  UNIQUE KEY `uq_repuesto_codigo` (`codigo`),
  KEY `ix_repuesto_proveedor` (`id_proveedor`),
  KEY `ix_repuesto_nombre` (`nombre`),
  KEY `ix_repuesto_stock` (`stock`),
  CONSTRAINT `fk_repuesto_proveedor`
    FOREIGN KEY (`id_proveedor`) REFERENCES `proveedor` (`id_proveedor`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `ck_repuesto_stock`      CHECK (`stock` >= 0),
  CONSTRAINT `ck_repuesto_costo`      CHECK (`costo_unitario` >= 0),
  CONSTRAINT `ck_repuesto_stock_min`  CHECK (`stock_minimo` >= 0)
) ENGINE=InnoDB;


-- =============================================================================
--  SECCION 6. ORDEN DE SERVICIO  (clase central del dominio)
--  Catalogo de clases: OrdenServicio
--  Diagrama de estados: RECIBIDO -> EN_DIAGNOSTICO -> PRESUPUESTADO
--                       -> EN_REPARACION -> LISTO -> ENTREGADO
--  Multiplicidades: Cliente 1 -> 1..* Orden ; Equipo 1 -> 0..* Orden
--                    Tecnico 1 -> 0..* Orden
-- =============================================================================

CREATE TABLE `orden_servicio` (
  `id_orden`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `numero`            VARCHAR(20)  NOT NULL DEFAULT '' COMMENT 'Numero unico de orden (RF-03); lo asigna el trigger trg_orden_numero',
  `id_cliente`        INT UNSIGNED NOT NULL,
  `id_equipo`         INT UNSIGNED NOT NULL,
  `id_tecnico`        INT UNSIGNED DEFAULT NULL COMMENT 'RN-02: obligatorio al entrar en EN_REPARACION',
  `id_usuario_registro` INT UNSIGNED DEFAULT NULL,
  `estado`            ENUM('RECIBIDO','EN_DIAGNOSTICO','PRESUPUESTADO','EN_REPARACION','LISTO','ENTREGADO','CANCELADO')
                      NOT NULL DEFAULT 'RECIBIDO',
  `fecha_recepcion`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_diagnostico` DATETIME     DEFAULT NULL,
  `fecha_aprobacion`  DATETIME     DEFAULT NULL,
  `fecha_entrega`     DATETIME     DEFAULT NULL,
  `falla_reportada`   TEXT         DEFAULT NULL,
  `diagnostico`       TEXT         DEFAULT NULL COMMENT 'RN-03: obligatorio para pasar a LISTO',
  `solucion`          TEXT         DEFAULT NULL,
  `costo_diagnostico` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `costo_mano_obra`   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `costo_adicional`   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `descuento`         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `costo_final`       DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'RN-05: lo calcula el trigger',
  `total_pagado`      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `saldo`             DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'costo_final - total_pagado',
  `prioridad`         ENUM('BAJA','NORMAL','ALTA','URGENTE') NOT NULL DEFAULT 'NORMAL',
  `garantia_dias`     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `observaciones`     TEXT         DEFAULT NULL,
  `created_at`        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_orden`),
  UNIQUE KEY `uq_orden_numero` (`numero`),
  KEY `ix_orden_cliente` (`id_cliente`),
  KEY `ix_orden_equipo` (`id_equipo`),
  KEY `ix_orden_tecnico` (`id_tecnico`),
  KEY `ix_orden_usuario` (`id_usuario_registro`),
  KEY `ix_orden_estado` (`estado`),
  KEY `ix_orden_recepcion` (`fecha_recepcion`),
  KEY `ix_orden_tecnico_estado` (`id_tecnico`, `estado`) COMMENT 'Acelera el conteo de la RN-07',
  KEY `ix_orden_saldo` (`saldo`) COMMENT 'Sustenta el reporte de cartera por cobrar',
  CONSTRAINT `fk_orden_cliente`
    FOREIGN KEY (`id_cliente`) REFERENCES `cliente` (`id_cliente`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_orden_equipo`
    FOREIGN KEY (`id_equipo`) REFERENCES `equipo` (`id_equipo`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_orden_tecnico`
    FOREIGN KEY (`id_tecnico`) REFERENCES `tecnico` (`id_tecnico`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_orden_usuario`
    FOREIGN KEY (`id_usuario_registro`) REFERENCES `usuario` (`id_usuario`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `ck_orden_montos` CHECK (
    `costo_diagnostico` >= 0 AND `costo_mano_obra` >= 0
    AND `costo_adicional` >= 0 AND `descuento` >= 0 AND `total_pagado` >= 0
  )
) ENGINE=InnoDB;


-- =============================================================================
--  SECCION 7. DETALLE DEL SERVICIO
--  Catalogo de clases: DetalleServicio
--  Resuelve la multiplicidad OrdenServicio 1 -> 0..* DetalleServicio -> 1 Repuesto
--  y es el origen del costo por repuestos de la RN-05.
-- =============================================================================

CREATE TABLE `detalle_servicio` (
  `id_detalle`      INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `id_orden`        INT UNSIGNED  NOT NULL,
  `id_repuesto`     INT UNSIGNED  DEFAULT NULL,
  `concepto`        ENUM('DIAGNOSTICO','REPUESTO','MANO_DE_OBRA','SERVICIO_ADICIONAL') NOT NULL,
  `descripcion`     VARCHAR(255)  NOT NULL,
  `cantidad`        INT           NOT NULL DEFAULT 1,
  `costo_unitario`  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `subtotal`        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `afecta_stock`    TINYINT(1)    NOT NULL DEFAULT 0,
  `created_at`      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_detalle`),
  KEY `ix_detalle_orden` (`id_orden`),
  KEY `ix_detalle_repuesto` (`id_repuesto`),
  KEY `ix_detalle_concepto` (`concepto`),
  CONSTRAINT `fk_detalle_orden`
    FOREIGN KEY (`id_orden`) REFERENCES `orden_servicio` (`id_orden`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_detalle_repuesto`
    FOREIGN KEY (`id_repuesto`) REFERENCES `repuesto` (`id_repuesto`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `ck_detalle_cantidad` CHECK (`cantidad` > 0),
  CONSTRAINT `ck_detalle_costo`     CHECK (`costo_unitario` >= 0)
) ENGINE=InnoDB;


-- =============================================================================
--  SECCION 8. PAGOS Y COMPROBANTES
--  Catalogo de clases: Pago, ComprobantePago
--  Multiplicidades: OrdenServicio 1 -> 0..* Pago ; Pago 1 -> 0..1 Comprobante
-- =============================================================================

CREATE TABLE `pago` (
  `id_pago`        INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `id_orden`       INT UNSIGNED  NOT NULL,
  `id_usuario`     INT UNSIGNED  DEFAULT NULL,
  `monto`          DECIMAL(12,2) NOT NULL,
  `fecha`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `metodo`         ENUM('EFECTIVO','TARJETA_DEBITO','TARJETA_CREDITO','TRANSFERENCIA','YAPE','PLIN','OTRO') NOT NULL,
  `referencia`     VARCHAR(60)   DEFAULT NULL,
  `estado`         ENUM('REGISTRADO','ANULADO') NOT NULL DEFAULT 'REGISTRADO',
  `observaciones`  VARCHAR(255)  DEFAULT NULL,
  `created_at`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_pago`),
  KEY `ix_pago_orden` (`id_orden`),
  KEY `ix_pago_usuario` (`id_usuario`),
  KEY `ix_pago_fecha` (`fecha`),
  KEY `ix_pago_metodo` (`metodo`),
  KEY `ix_pago_estado` (`estado`),
  CONSTRAINT `fk_pago_orden`
    FOREIGN KEY (`id_orden`) REFERENCES `orden_servicio` (`id_orden`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_pago_usuario`
    FOREIGN KEY (`id_usuario`) REFERENCES `usuario` (`id_usuario`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  -- RN-06: monto, fecha y metodo son obligatorios y el monto es positivo.
  CONSTRAINT `ck_pago_monto`  CHECK (`monto` > 0),
  CONSTRAINT `ck_pago_fecha`  CHECK (`fecha` IS NOT NULL),
  CONSTRAINT `ck_pago_metodo` CHECK (`metodo` IS NOT NULL)
) ENGINE=InnoDB;

-- Se crea despues de `pago` porque la multiplicidad del documento es
-- Pago 1 -> 0..1 ComprobantePago: la FK vive en el comprobante, con
-- UNIQUE en id_pago para que un pago nunca tenga dos comprobantes.
CREATE TABLE `comprobante_pago` (
  `id_comprobante` INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `id_pago`        INT UNSIGNED  NOT NULL,
  `tipo`           ENUM('BOLETA','FACTURA') NOT NULL,
  `numero`         VARCHAR(30)   NOT NULL,
  `fecha_emision`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `subtotal`       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `impuesto`       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `total`          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `estado`         ENUM('EMITIDO','ANULADO') NOT NULL DEFAULT 'EMITIDO',
  PRIMARY KEY (`id_comprobante`),
  UNIQUE KEY `uq_comprobante_pago` (`id_pago`),
  UNIQUE KEY `uq_comprobante_numero` (`numero`),
  KEY `ix_comprobante_fecha` (`fecha_emision`),
  CONSTRAINT `fk_comprobante_pago`
    FOREIGN KEY (`id_pago`) REFERENCES `pago` (`id_pago`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;


-- =============================================================================
--  SECCION 9. MOVIMIENTOS ECONOMICOS (ingresos y egresos consolidados)
--  Catalogo de clases: MovimientoEconomico
--  Se alimenta de los pagos registrados y de las compras/gastos.
-- =============================================================================

CREATE TABLE `movimiento_economico` (
  `id_movimiento`   INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `tipo`           ENUM('INGRESO','EGRESO') NOT NULL,
  `categoria`      ENUM('VENTA','ABONO','COMPRA_REPUESTO','GASTO_OPERATIVO','SERVICIO','IMPUESTO','OTRO') NOT NULL,
  `concepto`       VARCHAR(255) NOT NULL,
  `monto`          DECIMAL(12,2) NOT NULL,
  `fecha`          DATE          NOT NULL,
  `id_orden`       INT UNSIGNED  DEFAULT NULL,
  `id_pago`        INT UNSIGNED  DEFAULT NULL,
  `id_proveedor`   INT UNSIGNED  DEFAULT NULL,
  `comprobante`    VARCHAR(60)   DEFAULT NULL,
  `created_at`     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_movimiento`),
  KEY `ix_movimiento_tipo_fecha` (`tipo`, `fecha`),
  KEY `ix_movimiento_categoria` (`categoria`),
  KEY `ix_movimiento_orden` (`id_orden`),
  KEY `ix_movimiento_pago` (`id_pago`),
  KEY `ix_movimiento_proveedor` (`id_proveedor`),
  CONSTRAINT `fk_mov_orden`
    FOREIGN KEY (`id_orden`) REFERENCES `orden_servicio` (`id_orden`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_mov_pago`
    FOREIGN KEY (`id_pago`) REFERENCES `pago` (`id_pago`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_mov_proveedor`
    FOREIGN KEY (`id_proveedor`) REFERENCES `proveedor` (`id_proveedor`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `ck_movimiento_monto` CHECK (`monto` > 0)
) ENGINE=InnoDB;


-- =============================================================================
--  SECCION 10. COMUNICACION CON EL CLIENTE
--  Catalogo de clases: Mensaje
--  Multiplicidad: Usuario 1 -> 0..* Mensaje
-- =============================================================================

CREATE TABLE `mensaje` (
  `id_mensaje`   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `id_usuario`   INT UNSIGNED NOT NULL,
  `id_cliente`   INT UNSIGNED DEFAULT NULL,
  `id_orden`     INT UNSIGNED DEFAULT NULL,
  `canal`        ENUM('SISTEMA','EMAIL','SMS','WHATSAPP') NOT NULL DEFAULT 'SISTEMA',
  `asunto`       VARCHAR(150) NOT NULL,
  `contenido`    TEXT         NOT NULL,
  `leido`        TINYINT(1)   NOT NULL DEFAULT 0,
  `fecha_envio`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_mensaje`),
  KEY `ix_mensaje_usuario` (`id_usuario`),
  KEY `ix_mensaje_cliente` (`id_cliente`),
  KEY `ix_mensaje_orden` (`id_orden`),
  KEY `ix_mensaje_fecha` (`fecha_envio`),
  KEY `ix_mensaje_no_leido` (`leido`, `fecha_envio`),
  CONSTRAINT `fk_mensaje_usuario`
    FOREIGN KEY (`id_usuario`) REFERENCES `usuario` (`id_usuario`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_mensaje_cliente`
    FOREIGN KEY (`id_cliente`) REFERENCES `cliente` (`id_cliente`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_mensaje_orden`
    FOREIGN KEY (`id_orden`) REFERENCES `orden_servicio` (`id_orden`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;


-- =============================================================================
--  SECCION 11. HISTORIAL DE ESTADOS
--  Tabla de soporte del diagrama de estados (apartado 10.2 del documento).
--  Permite auditar cada transicion de la orden y alimentar el indicador
--  "tiempo de reparacion" (entrega - recepcion).
-- =============================================================================

CREATE TABLE `orden_estado_historial` (
  `id_historial`    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `id_orden`        INT UNSIGNED NOT NULL,
  `estado_anterior` ENUM('RECIBIDO','EN_DIAGNOSTICO','PRESUPUESTADO','EN_REPARACION','LISTO','ENTREGADO','CANCELADO')
                    NOT NULL,
  `estado_nuevo`    ENUM('RECIBIDO','EN_DIAGNOSTICO','PRESUPUESTADO','EN_REPARACION','LISTO','ENTREGADO','CANCELADO')
                    NOT NULL,
  `id_usuario`      INT UNSIGNED DEFAULT NULL,
  `fecha`           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `comentario`      VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`id_historial`),
  KEY `ix_historial_orden` (`id_orden`),
  KEY `ix_historial_fecha` (`fecha`),
  CONSTRAINT `fk_historial_orden`
    FOREIGN KEY (`id_orden`) REFERENCES `orden_servicio` (`id_orden`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_historial_usuario`
    FOREIGN KEY (`id_usuario`) REFERENCES `usuario` (`id_usuario`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;


-- =============================================================================
--  SECCION 12. VISTAS DE SOPORTE
-- =============================================================================

-- Vista reutilizable: orden + cliente + equipo + tecnico + economia.
CREATE OR REPLACE VIEW `v_orden_consolidada` AS
SELECT
  o.`id_orden`,
  o.`numero`,
  o.`estado`,
  o.`prioridad`,
  o.`fecha_recepcion`,
  o.`fecha_entrega`,
  TIMESTAMPDIFF(HOUR, o.`fecha_recepcion`, COALESCE(o.`fecha_entrega`, NOW())) AS horas_atencion,
  c.`id_cliente`,
  c.`nombre`  AS cliente,
  c.`telefono` AS cliente_telefono,
  e.`id_equipo`,
  e.`tipo`    AS equipo_tipo,
  CONCAT(e.`marca`, ' ', e.`modelo`) AS equipo,
  e.`numero_serie`,
  t.`id_tecnico`,
  t.`nombre`  AS tecnico,
  t.`especialidad`,
  o.`costo_diagnostico`,
  o.`costo_mano_obra`,
  o.`costo_adicional`,
  o.`descuento`,
  o.`costo_final`,
  o.`total_pagado`,
  o.`saldo`
FROM `orden_servicio` o
JOIN `cliente`  c ON c.`id_cliente` = o.`id_cliente`
JOIN `equipo`   e ON e.`id_equipo`  = o.`id_equipo`
LEFT JOIN `tecnico` t ON t.`id_tecnico` = o.`id_tecnico`;


-- Indicadores de gestion del apartado 13 del documento, ampliados para el
-- tablero de control: aparte de los totales, se compara el mes en curso con
-- el anterior para que cada tarjeta pueda mostrar su variacion porcentual.
CREATE OR REPLACE VIEW `v_indicadores` AS
SELECT
  (SELECT COUNT(*) FROM `orden_servicio`)                                        AS ordenes_totales,
  (SELECT COUNT(*) FROM `orden_servicio`
     WHERE `estado` NOT IN ('ENTREGADO','CANCELADO'))                           AS ordenes_activas,
  (SELECT COUNT(*) FROM `orden_servicio` WHERE `estado` = 'LISTO')               AS equipos_listos,
  (SELECT COUNT(*) FROM `orden_servicio` WHERE `estado` = 'EN_REPARACION')       AS en_reparacion,
  (SELECT COUNT(*) FROM `orden_servicio` WHERE `estado` = 'RECIBIDO')            AS por_recibir,
  (SELECT COUNT(*) FROM `orden_servicio` WHERE `saldo` > 0)                     AS cuentas_por_cobrar,
  (SELECT COALESCE(SUM(`saldo`),0) FROM `orden_servicio` WHERE `saldo` > 0)     AS saldo_por_cobrar,
  (SELECT COALESCE(SUM(`monto`),0) FROM `movimiento_economico` WHERE `tipo`='INGRESO') AS ingresos,
  (SELECT COALESCE(SUM(`monto`),0) FROM `movimiento_economico` WHERE `tipo`='EGRESO') AS egresos,

  -- Serie mensual: mes en curso contra mes anterior (tarjetas con variacion).
  (SELECT COALESCE(SUM(`monto`),0) FROM `movimiento_economico`
     WHERE `tipo` = 'INGRESO'
       AND `fecha` >= DATE_FORMAT(CURDATE(), '%Y-%m-01'))                        AS ingresos_mes,
  (SELECT COALESCE(SUM(`monto`),0) FROM `movimiento_economico`
     WHERE `tipo` = 'INGRESO'
       AND `fecha` >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')
       AND `fecha` <  DATE_FORMAT(CURDATE(), '%Y-%m-01'))                       AS ingresos_mes_anterior,
  (SELECT COALESCE(SUM(`monto`),0) FROM `movimiento_economico`
     WHERE `tipo` = 'EGRESO'
       AND `fecha` >= DATE_FORMAT(CURDATE(), '%Y-%m-01'))                        AS egresos_mes,
  (SELECT COUNT(*) FROM `orden_servicio`
     WHERE `fecha_recepcion` >= DATE_FORMAT(CURDATE(), '%Y-%m-01'))              AS ordenes_mes,
  (SELECT COUNT(*) FROM `orden_servicio`
     WHERE `fecha_recepcion` >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01')
       AND `fecha_recepcion` <  DATE_FORMAT(CURDATE(), '%Y-%m-01'))             AS ordenes_mes_anterior,
  (SELECT ROUND(COALESCE(AVG(`costo_final`), 0), 2) FROM `orden_servicio`
     WHERE `costo_final` > 0)                                                     AS ticket_promedio,

  -- Alertas operativas que alimentan la bandeja del tablero.
  (SELECT COUNT(*) FROM `repuesto` WHERE `stock` <= `stock_minimo`)             AS repuestos_por_reponer,
  (SELECT COUNT(*) FROM `repuesto` WHERE `stock` = 0)                          AS repuestos_agotados,
  (SELECT COUNT(*) FROM `repuesto`)                                            AS repuestos_totales,
  (SELECT COUNT(*) FROM `mensaje` WHERE `leido` = 0)                            AS mensajes_no_leidos,
  (SELECT COUNT(*) FROM `orden_servicio`
     WHERE `estado` = 'ENTREGADO'
       AND `garantia_dias` > 0
       AND DATE_ADD(`fecha_entrega`, INTERVAL `garantia_dias` DAY)
           BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 15 DAY))                   AS garantias_por_vencer,
  (SELECT COUNT(*) FROM `orden_servicio` WHERE `prioridad` IN ('ALTA','URGENTE')
     AND `estado` NOT IN ('ENTREGADO','CANCELADO'))                             AS ordenes_prioritarias,
  (SELECT COUNT(*) FROM `cliente`)                                              AS clientes_totales,
  (SELECT COUNT(*) FROM `cliente` WHERE `activo` = 1)                          AS clientes_activos,
  (SELECT COUNT(*) FROM `orden_servicio`
     WHERE `estado` = 'ENTREGADO'
       AND `fecha_entrega` >= DATE_FORMAT(CURDATE(), '%Y-%m-01'))               AS entregadas_mes,
  (SELECT ROUND(COALESCE(AVG(TIMESTAMPDIFF(HOUR, `fecha_recepcion`, `fecha_entrega`)), 0), 1)
     FROM `orden_servicio` WHERE `estado` = 'ENTREGADO'
       AND `fecha_entrega` >= DATE_FORMAT(CURDATE(), '%Y-%m-01'))               AS horas_promedio_entrega;

-- =============================================================================
--  FIN DE 01_schema.sql
--  Continuar con 02_triggers.sql
-- =============================================================================
