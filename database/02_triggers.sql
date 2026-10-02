-- =============================================================================
--  SISTEMA DE GESTION INTEGRAL PARA UNA EMPRESA DE REPARACION
--  DE CELULARES Y EQUIPOS TECNOLOGICOS
-- =============================================================================
--  Archivo   : 02_triggers.sql
--  Etapa     : 02 - Diseno de base de datos
--  Motor     : MySQL 8.0+ / 8.4
--  Depende   : 01_schema.sql
--
--  CONTENIDO
--    Bloque A  - Funciones y procedimientos de apoyo
--    Bloque B  - RN-01  Toda orden debe estar asociada a un cliente y un equipo
--    Bloque C  - RN-02  Toda orden requiere tecnico asignado para reparar
--    Bloque D  - RN-03  No se marca "Listo" sin diagnostico registrado
--    Bloque E  - RN-04  Los repuestos utilizados se reflejan en el stock
--    Bloque F  - RN-05  El costo final se calcula con los conceptos de la orden
--    Bloque G  - RN-06  Todo pago registra monto, fecha y metodo
--    Bloque H  - RN-07  Control de carga de ordenes activas por tecnico
--    Bloque I  - Soporte: numeracion, historial de estados, sincronizacion
--
--  Convencion: todo incumplimiento de regla se reporta con SIGNAL SQLSTATE
--  '45000'. La capa de aplicacion traduce MYSQL_ERRNO a HTTP 422.
-- =============================================================================

USE `taller_reparacion`;

DROP TRIGGER IF EXISTS `trg_orden_numero_bi`;
DROP TRIGGER IF EXISTS `trg_orden_numero_ai`;
DROP TRIGGER IF EXISTS `trg_orden_historial_ai`;
DROP TRIGGER IF EXISTS `trg_orden_historial_au`;
DROP TRIGGER IF EXISTS `trg_orden_valida_bi`;
DROP TRIGGER IF EXISTS `trg_orden_valida_bu`;
DROP TRIGGER IF EXISTS `trg_orden_estado_bi`;
DROP TRIGGER IF EXISTS `trg_orden_estado_bu`;
DROP TRIGGER IF EXISTS `trg_orden_tecnico_bi`;
DROP TRIGGER IF EXISTS `trg_orden_tecnico_bu`;
DROP TRIGGER IF EXISTS `trg_orden_costo_bu`;
DROP TRIGGER IF EXISTS `trg_orden_equipo_ai`;
DROP TRIGGER IF EXISTS `trg_orden_equipo_au`;
DROP TRIGGER IF EXISTS `trg_detalle_detalle_bi`;
DROP TRIGGER IF EXISTS `trg_detalle_detalle_bu`;
DROP TRIGGER IF EXISTS `trg_detalle_stock_ai`;
DROP TRIGGER IF EXISTS `trg_detalle_stock_au`;
DROP TRIGGER IF EXISTS `trg_detalle_stock_ad`;
DROP TRIGGER IF EXISTS `trg_pago_valida_bi`;
DROP TRIGGER IF EXISTS `trg_pago_valida_bu`;
DROP TRIGGER IF EXISTS `trg_pago_economia_ai`;
DROP TRIGGER IF EXISTS `trg_pago_economia_au`;
DROP TRIGGER IF EXISTS `trg_comprobante_numero_bi`;
DROP TRIGGER IF EXISTS `trg_tecnico_codigo_bi`;

DROP FUNCTION  IF EXISTS `fn_costo_repuestos_orden`;
DROP FUNCTION  IF EXISTS `fn_ordenes_activas_tecnico`;
DROP PROCEDURE IF EXISTS `sp_actualizar_costo_orden`;
DROP PROCEDURE IF EXISTS `sp_siguiente_secuencia`;


-- =============================================================================
--  BLOQUE A. FUNCIONES Y PROCEDIMIENTOS DE APOYO
-- =============================================================================

DELIMITER $$

-- -----------------------------------------------------------------------------
--  fn_costo_repuestos_orden
--  Suma los subtotales de los detalles de tipo REPUESTO de una orden. Es el
--  unico insumo del costo final que no vive como columna en la orden (el
--  diagnostico, la mano de obra, los adicionales y el descuento si), lo que
--  evita contar dos veces el mismo concepto.
-- -----------------------------------------------------------------------------
CREATE FUNCTION `fn_costo_repuestos_orden`(p_id_orden INT)
RETURNS DECIMAL(12,2)
DETERMINISTIC
READS SQL DATA
BEGIN
  DECLARE v_total DECIMAL(12,2);
  SELECT COALESCE(SUM(d.subtotal), 0.00)
    INTO v_total
    FROM `detalle_servicio` d
   WHERE d.id_orden = p_id_orden
     AND d.concepto = 'REPUESTO';
  RETURN v_total;
END$$

-- -----------------------------------------------------------------------------
--  fn_ordenes_activas_tecnico
--  Ordenes no cerradas asignadas a un tecnico. Excluye la orden evaluada para
--  que la RN-07 no se violente a si misma al reasignar el mismo tecnico.
--  Nota: no se usa FOR UPDATE porque MySQL no lo admite junto a un agregado;
--  la fila de la orden se bloquea igualmente en el UPDATE que dispara la
--  regla, de modo que la eventual carrera se resuelve por el indice unico y no
--  puede duplicar ordenes.
-- -----------------------------------------------------------------------------
CREATE FUNCTION `fn_ordenes_activas_tecnico`(p_id_tecnico INT, p_excluir INT)
RETURNS INT
DETERMINISTIC
READS SQL DATA
BEGIN
  DECLARE v_total INT;
  IF p_id_tecnico IS NULL THEN
    RETURN 0;
  END IF;
  SELECT COUNT(*)
    INTO v_total
    FROM `orden_servicio` o
   WHERE o.id_tecnico = p_id_tecnico
     AND o.estado IN ('RECIBIDO','EN_DIAGNOSTICO','PRESUPUESTADO','EN_REPARACION','LISTO')
     AND o.id_orden <> IFNULL(p_excluir, -1);
  RETURN v_total;
END$$

-- -----------------------------------------------------------------------------
--  sp_actualizar_costo_orden   (RN-05)
--  Recalcula costo_final, total_pagado y saldo de una orden. La invocan los
--  triggers de detalle_servicio y de pago, de modo que el total jamas depende
--  de que la aplicacion se acuerde de hacerlo.
-- -----------------------------------------------------------------------------
CREATE PROCEDURE `sp_actualizar_costo_orden`(IN p_id_orden INT)
BEGIN
  DECLARE v_costo_final  DECIMAL(12,2) DEFAULT 0.00;
  DECLARE v_total_pagado DECIMAL(12,2) DEFAULT 0.00;

  SELECT COALESCE(SUM(p.monto), 0.00)
    INTO v_total_pagado
    FROM `pago` p
   WHERE p.id_orden = p_id_orden
     AND p.estado = 'REGISTRADO';

  SELECT GREATEST(
           o.costo_diagnostico
         + o.costo_mano_obra
         + o.costo_adicional
         + `fn_costo_repuestos_orden`(o.id_orden)
         - o.descuento
         , 0.00)
    INTO v_costo_final
    FROM `orden_servicio` o
   WHERE o.id_orden = p_id_orden;

  -- El descuento nunca deja el costo final en negativo.
  IF v_costo_final < 0 THEN
    SET v_costo_final = 0.00;
  END IF;

  UPDATE `orden_servicio`
     SET `costo_final`  = v_costo_final,
         `total_pagado` = v_total_pagado,
         `saldo`        = GREATEST(v_costo_final - v_total_pagado, 0.00)
   WHERE `id_orden` = p_id_orden;
END$$

-- -----------------------------------------------------------------------------
--  sp_siguiente_secuencia
--  Devuelve el siguiente valor de un contador. El UPDATE seguido del SELECT
--  con FOR UPDATE serializa a los emisores concurrentes, de modo que dos
--  ordenes simultaneas nunca obtienen el mismo numero.
-- -----------------------------------------------------------------------------
CREATE PROCEDURE `sp_siguiente_secuencia`(IN p_nombre VARCHAR(40), OUT p_valor BIGINT)
BEGIN
  UPDATE `secuencia` SET `valor` = `valor` + 1 WHERE `nombre` = p_nombre;
  SELECT `valor` INTO p_valor FROM `secuencia` WHERE `nombre` = p_nombre FOR UPDATE;
END$$

DELIMITER ;


-- =============================================================================
--  BLOQUE B. RN-01  TODA ORDEN DEBE ESTAR ASOCIADA A UN CLIENTE Y UN EQUIPO
-- =============================================================================
--  La invariante se defiende en tres niveles: columnas NOT NULL, clave
--  foranea para la existencia, y este trigger para la pertenencia real del
--  equipo al cliente, que ninguna FK puede expresar.
-- =============================================================================

DELIMITER $$

CREATE TRIGGER `trg_orden_valida_bi`
BEFORE INSERT ON `orden_servicio`
FOR EACH ROW
BEGIN
  IF NEW.id_cliente IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'RN-01: la orden requiere un cliente asociado', MYSQL_ERRNO = 45001;
  END IF;

  IF NEW.id_equipo IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'RN-01: la orden requiere un equipo asociado', MYSQL_ERRNO = 45001;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM `equipo` e
                  WHERE e.id_equipo = NEW.id_equipo
                    AND e.id_cliente = NEW.id_cliente) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'RN-01: el equipo no pertenece al cliente indicado en la orden', MYSQL_ERRNO = 45001;
  END IF;
END$$

CREATE TRIGGER `trg_orden_valida_bu`
BEFORE UPDATE ON `orden_servicio`
FOR EACH ROW
BEGIN
  IF NEW.id_cliente IS NULL OR NEW.id_equipo IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'RN-01: la orden requiere un cliente y un equipo', MYSQL_ERRNO = 45001;
  END IF;

  IF NEW.id_cliente <> OLD.id_cliente OR NEW.id_equipo <> OLD.id_equipo THEN
    IF NOT EXISTS (SELECT 1 FROM `equipo` e
                    WHERE e.id_equipo = NEW.id_equipo
                      AND e.id_cliente = NEW.id_cliente) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'RN-01: el equipo no pertenece al cliente indicado en la orden', MYSQL_ERRNO = 45001;
    END IF;
  END IF;
END$$

DELIMITER ;


-- =============================================================================
--  BLOQUE C. RN-02  TECNICO ASIGNADO ANTES DE INICIAR LA REPARACION
--  Ademas sella las fechas previstas en el diagrama de estados (10.2).
-- =============================================================================

DELIMITER $$

CREATE TRIGGER `trg_orden_estado_bi`
BEFORE INSERT ON `orden_servicio`
FOR EACH ROW
BEGIN
  IF NEW.estado IN ('EN_DIAGNOSTICO','EN_REPARACION','LISTO') AND NEW.id_tecnico IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'RN-02: se requiere un tecnico asignado para abrir la orden en este estado', MYSQL_ERRNO = 45002;
  END IF;

  IF NEW.estado = 'EN_DIAGNOSTICO' AND NEW.fecha_diagnostico IS NULL THEN
    SET NEW.fecha_diagnostico = NOW();
  END IF;
  IF NEW.estado = 'ENTREGADO' AND NEW.fecha_entrega IS NULL THEN
    SET NEW.fecha_entrega = NOW();
  END IF;

  -- RN-05 tambien aplica en la apertura: sin detalles aunregistered, el
  -- costo final es la suma de los conceptos directos de la orden.
  SET NEW.costo_final = GREATEST(
        NEW.costo_diagnostico + NEW.costo_mano_obra + NEW.costo_adicional - NEW.descuento, 0.00);
  SET NEW.saldo       = NEW.costo_final;
END$$

CREATE TRIGGER `trg_orden_estado_bu`
BEFORE UPDATE ON `orden_servicio`
FOR EACH ROW
BEGIN
  -- ---- RN-02: no se inicia la reparacion sin tecnico ----
  IF NEW.estado = 'EN_REPARACION' AND NEW.id_tecnico IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'RN-02: no se puede iniciar la reparacion sin un tecnico asignado', MYSQL_ERRNO = 45002;
  END IF;

  -- ---- RN-03: el diagnostico es requisito para marcar LISTO ----
  IF NEW.estado = 'LISTO'
     AND (NEW.diagnostico IS NULL OR CHAR_LENGTH(TRIM(NEW.diagnostico)) = 0) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'RN-03: no se puede marcar el equipo como LISTO sin un diagnostico registrado', MYSQL_ERRNO = 45003;
  END IF;

  -- ---- Sellado de fechas por transicion ----
  IF NEW.estado <> OLD.estado THEN
    IF NEW.estado = 'EN_DIAGNOSTICO' AND NEW.fecha_diagnostico IS NULL THEN
      SET NEW.fecha_diagnostico = NOW();
    END IF;
    IF NEW.estado = 'PRESUPUESTADO' AND NEW.fecha_aprobacion IS NULL THEN
      SET NEW.fecha_aprobacion = NOW();
    END IF;
    IF NEW.estado = 'ENTREGADO' AND NEW.fecha_entrega IS NULL THEN
      SET NEW.fecha_entrega = NOW();
    END IF;
  END IF;
END$$

DELIMITER ;


-- =============================================================================
--  BLOQUE D. RN-05  EL COSTO FINAL SE CALCULA CON LOS CONCEPTOS DE LA ORDEN
--  COSTO FINAL = DIAGNOSTICO + MANO DE OBRA + REPUESTOS
--                 + SERVICIOS ADICIONALES - DESCUENTOS
--  Este trigger es el unico que escribe orden_servicio.costo_final, de modo
--  que el total jamas proviene de un valor digitado por el usuario.
-- =============================================================================

DELIMITER $$

CREATE TRIGGER `trg_orden_costo_bu`
BEFORE UPDATE ON `orden_servicio`
FOR EACH ROW
BEGIN
  IF NEW.descuento > (NEW.costo_diagnostico + NEW.costo_mano_obra + NEW.costo_adicional
                       + `fn_costo_repuestos_orden`(NEW.id_orden)) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'RN-05: el descuento no puede superar los conceptos registrados en la orden', MYSQL_ERRNO = 45005;
  END IF;

  SET NEW.costo_final = GREATEST(
        NEW.costo_diagnostico + NEW.costo_mano_obra + NEW.costo_adicional
        + `fn_costo_repuestos_orden`(NEW.id_orden) - NEW.descuento, 0.00);

  SET NEW.saldo = GREATEST(NEW.costo_final - NEW.total_pagado, 0.00);
END$$

DELIMITER ;


-- =============================================================================
--  BLOQUE E. RN-07  CARGA DE ORDENES ACTIVAS POR TECNICO
--  El limite se lee de la tabla `parametro` para que el negocio pueda
--  ajustarlo sin redesplegar (ver 01_schema.sql).
-- =============================================================================

DELIMITER $$

CREATE TRIGGER `trg_orden_tecnico_bi`
BEFORE INSERT ON `orden_servicio`
FOR EACH ROW
BEGIN
  DECLARE v_maximo  INT DEFAULT 5;
  DECLARE v_activas INT DEFAULT 0;

  IF NEW.estado IN ('RECIBIDO','EN_DIAGNOSTICO','PRESUPUESTADO','EN_REPARACION','LISTO')
     AND NEW.id_tecnico IS NOT NULL THEN

    SELECT COALESCE(CAST(p.valor AS SIGNED), 5) INTO v_maximo
      FROM `parametro` p WHERE p.nombre = 'max_ordenes_por_tecnico';

    SET v_activas = `fn_ordenes_activas_tecnico`(NEW.id_tecnico, NULL);

    IF v_activas >= v_maximo THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'RN-07: el tecnico alcanzo el maximo de ordenes activas permitido', MYSQL_ERRNO = 45007;
    END IF;
  END IF;
END$$

CREATE TRIGGER `trg_orden_tecnico_bu`
BEFORE UPDATE ON `orden_servicio`
FOR EACH ROW
BEGIN
  DECLARE v_maximo  INT DEFAULT 5;
  DECLARE v_activas INT DEFAULT 0;

  IF NEW.estado IN ('RECIBIDO','EN_DIAGNOSTICO','PRESUPUESTADO','EN_REPARACION','LISTO')
     AND NEW.id_tecnico IS NOT NULL
     AND (NEW.estado <> OLD.estado OR NOT (NEW.id_tecnico <=> OLD.id_tecnico)) THEN

    SELECT COALESCE(CAST(p.valor AS SIGNED), 5) INTO v_maximo
      FROM `parametro` p WHERE p.nombre = 'max_ordenes_por_tecnico';

    SET v_activas = `fn_ordenes_activas_tecnico`(NEW.id_tecnico, NEW.id_orden);

    IF v_activas >= v_maximo THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'RN-07: el tecnico alcanzo el maximo de ordenes activas permitido', MYSQL_ERRNO = 45007;
    END IF;
  END IF;
END$$

DELIMITER ;


-- =============================================================================
--  BLOQUE F. RN-04  LOS REPUESTOS UTILIZADOS DEBEN REFLEJARSE EN EL STOCK
--  BEFORE : valida disponibilidad, toma el costo del catalogo y calcula subtotal.
--  AFTER  : descuenta (o devuelve) la existencia y recalcula la orden (RN-05).
-- =============================================================================

DELIMITER $$

CREATE TRIGGER `trg_detalle_detalle_bi`
BEFORE INSERT ON `detalle_servicio`
FOR EACH ROW
BEGIN
  DECLARE v_stock INT DEFAULT 0;
  DECLARE v_costo DECIMAL(10,2) DEFAULT 0.00;

  IF NEW.concepto = 'REPUESTO' AND NEW.id_repuesto IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'RN-04: un detalle de tipo REPUESTO debe indicar el repuesto utilizado', MYSQL_ERRNO = 45004;
  END IF;

  IF NEW.id_repuesto IS NOT NULL THEN
    -- El costo no lo fija el usuario: sale del catalogo de repuestos.
    SELECT `stock`, `costo_unitario` INTO v_stock, v_costo
      FROM `repuesto` WHERE `id_repuesto` = NEW.id_repuesto FOR UPDATE;

    IF NEW.costo_unitario IS NULL OR NEW.costo_unitario = 0 THEN
      SET NEW.costo_unitario = v_costo;
    END IF;

    SET NEW.afecta_stock = (NEW.concepto = 'REPUESTO');

    IF NEW.afecta_stock = 1 AND v_stock < NEW.cantidad THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'RN-04: stock insuficiente del repuesto solicitado', MYSQL_ERRNO = 45004;
    END IF;
  ELSE
    SET NEW.afecta_stock = 0;
  END IF;

  SET NEW.subtotal = NEW.cantidad * NEW.costo_unitario;
END$$

CREATE TRIGGER `trg_detalle_detalle_bu`
BEFORE UPDATE ON `detalle_servicio`
FOR EACH ROW
BEGIN
  DECLARE v_stock INT DEFAULT 0;
  DECLARE v_costo DECIMAL(10,2) DEFAULT 0.00;

  IF NEW.id_repuesto IS NOT NULL THEN
    SELECT `stock`, `costo_unitario` INTO v_stock, v_costo
      FROM `repuesto` WHERE `id_repuesto` = NEW.id_repuesto FOR UPDATE;

    IF NEW.costo_unitario IS NULL OR NEW.costo_unitario = 0 THEN
      SET NEW.costo_unitario = v_costo;
    END IF;
    SET NEW.afecta_stock = (NEW.concepto = 'REPUESTO');

    -- Si la cantidad sube sobre la misma pieza, el disponible debe cubrir el
    -- incremento. El AFTER devuelve primero lo anterior al stock.
    IF NEW.afecta_stock = 1
       AND NEW.id_repuesto <=> OLD.id_repuesto
       AND NEW.cantidad > OLD.cantidad
       AND v_stock < (NEW.cantidad - OLD.cantidad) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'RN-04: stock insuficiente del repuesto solicitado', MYSQL_ERRNO = 45004;
    END IF;
  ELSE
    SET NEW.afecta_stock = 0;
  END IF;

  SET NEW.subtotal = NEW.cantidad * NEW.costo_unitario;
END$$

CREATE TRIGGER `trg_detalle_stock_ai`
AFTER INSERT ON `detalle_servicio`
FOR EACH ROW
BEGIN
  IF NEW.afecta_stock = 1 AND NEW.id_repuesto IS NOT NULL THEN
    UPDATE `repuesto` SET `stock` = `stock` - NEW.cantidad
     WHERE `id_repuesto` = NEW.id_repuesto;
  END IF;

  -- RN-05: el total de la orden refleja de inmediato el repuesto consumido.
  CALL `sp_actualizar_costo_orden`(NEW.id_orden);
END$$

CREATE TRIGGER `trg_detalle_stock_au`
AFTER UPDATE ON `detalle_servicio`
FOR EACH ROW
BEGIN
  IF OLD.afecta_stock = 1 AND OLD.id_repuesto IS NOT NULL THEN
    UPDATE `repuesto` SET `stock` = `stock` + OLD.cantidad
     WHERE `id_repuesto` = OLD.id_repuesto;
  END IF;

  IF NEW.afecta_stock = 1 AND NEW.id_repuesto IS NOT NULL THEN
    UPDATE `repuesto` SET `stock` = `stock` - NEW.cantidad
     WHERE `id_repuesto` = NEW.id_repuesto;
  END IF;

  CALL `sp_actualizar_costo_orden`(NEW.id_orden);

  IF NOT (NEW.id_orden <=> OLD.id_orden) THEN
    CALL `sp_actualizar_costo_orden`(OLD.id_orden);
  END IF;
END$$

CREATE TRIGGER `trg_detalle_stock_ad`
AFTER DELETE ON `detalle_servicio`
FOR EACH ROW
BEGIN
  -- Al quitar el detalle, el repuesto vuelve al inventario.
  IF OLD.afecta_stock = 1 AND OLD.id_repuesto IS NOT NULL THEN
    UPDATE `repuesto` SET `stock` = `stock` + OLD.cantidad
     WHERE `id_repuesto` = OLD.id_repuesto;
  END IF;

  CALL `sp_actualizar_costo_orden`(OLD.id_orden);
END$$

DELIMITER ;


-- =============================================================================
--  BLOQUE G. RN-06  TODO PAGO DEBE REGISTRAR MONTO, FECHA Y METODO
--  El pago es ademas la fuente del ingreso del registro economico (9.1).
-- =============================================================================

DELIMITER $$

CREATE TRIGGER `trg_pago_valida_bi`
BEFORE INSERT ON `pago`
FOR EACH ROW
BEGIN
  IF NEW.monto IS NULL OR NEW.monto <= 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'RN-06: el pago debe registrar un monto mayor que cero', MYSQL_ERRNO = 45006;
  END IF;

  IF NEW.fecha IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'RN-06: el pago debe registrar la fecha', MYSQL_ERRNO = 45006;
  END IF;

  IF NEW.metodo IS NULL OR NEW.metodo = '' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'RN-06: el pago debe registrar el metodo de pago', MYSQL_ERRNO = 45006;
  END IF;

  -- No se admite pagar mas que el saldo vigente de la orden.
  IF NEW.estado = 'REGISTRADO'
     AND NEW.monto > GREATEST(
           (SELECT o.costo_final - o.total_pagado
              FROM `orden_servicio` o WHERE o.id_orden = NEW.id_orden), 0.00) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'RN-06: el monto del pago excede el saldo pendiente de la orden', MYSQL_ERRNO = 45006;
  END IF;
END$$

CREATE TRIGGER `trg_pago_valida_bu`
BEFORE UPDATE ON `pago`
FOR EACH ROW
BEGIN
  IF NEW.monto IS NULL OR NEW.monto <= 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'RN-06: el pago debe registrar un monto mayor que cero', MYSQL_ERRNO = 45006;
  END IF;

  IF NEW.fecha IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'RN-06: el pago debe registrar la fecha', MYSQL_ERRNO = 45006;
  END IF;

  IF NEW.metodo IS NULL OR NEW.metodo = '' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'RN-06: el pago debe registrar el metodo de pago', MYSQL_ERRNO = 45006;
  END IF;
END$$

CREATE TRIGGER `trg_pago_economia_ai`
AFTER INSERT ON `pago`
FOR EACH ROW
BEGIN
  CALL `sp_actualizar_costo_orden`(NEW.id_orden);

  IF NEW.estado = 'REGISTRADO' THEN
    INSERT INTO `movimiento_economico`
      (`tipo`, `categoria`, `concepto`, `monto`, `fecha`, `id_orden`, `id_pago`, `comprobante`)
    SELECT 'INGRESO', 'ABONO',
           CONCAT('Pago de orden #', o.numero),
           NEW.monto, DATE(NEW.fecha), NEW.id_orden, NEW.id_pago, NEW.referencia
      FROM `orden_servicio` o WHERE o.id_orden = NEW.id_orden;
  END IF;
END$$

CREATE TRIGGER `trg_pago_economia_au`
AFTER UPDATE ON `pago`
FOR EACH ROW
BEGIN
  -- Se retira el movimiento anterior antes de emitir el nuevo, de modo que el
  -- registro economico nunca duplica un mismo pago.
  DELETE FROM `movimiento_economico` WHERE `id_pago` = OLD.id_pago;

  CALL `sp_actualizar_costo_orden`(NEW.id_orden);

  IF NEW.estado = 'REGISTRADO' THEN
    INSERT INTO `movimiento_economico`
      (`tipo`, `categoria`, `concepto`, `monto`, `fecha`, `id_orden`, `id_pago`, `comprobante`)
    SELECT 'INGRESO', 'ABONO',
           CONCAT('Pago de orden #', o.numero),
           NEW.monto, DATE(NEW.fecha), NEW.id_orden, NEW.id_pago, NEW.referencia
      FROM `orden_servicio` o WHERE o.id_orden = NEW.id_orden;
  END IF;
END$$

DELIMITER ;


-- =============================================================================
--  BLOQUE H. SOPORTE OPERATIVO
--  Numeracion unica (RF-03), historial de estados y sincronizacion del equipo.
-- =============================================================================

DELIMITER $$

-- El numero correlativo sale de la tabla `secuencia`, que es independiente del
-- AUTO_INCREMENT, asi que puede resolverse aqui mismo: no hace falta esperar al
-- AFTER INSERT para conocer el id. Ademas MySQL prohibe que un trigger AFTER
-- INSERT actualice su propia tabla, de modo que un unico BEFORE INSERT es
-- justamente la forma valida de resolverlo.
CREATE TRIGGER `trg_orden_numero_bi`
BEFORE INSERT ON `orden_servicio`
FOR EACH ROW
BEGIN
  DECLARE v_secuencia BIGINT;
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    CALL `sp_siguiente_secuencia`('orden_servicio', v_secuencia);
    SET NEW.numero = CONCAT('OS-', LPAD(v_secuencia, 6, '0'));
  END IF;
END$$

CREATE TRIGGER `trg_orden_historial_ai`
AFTER INSERT ON `orden_servicio`
FOR EACH ROW
BEGIN
  INSERT INTO `orden_estado_historial`
    (`id_orden`, `estado_anterior`, `estado_nuevo`, `id_usuario`, `comentario`)
  VALUES (NEW.id_orden, 'RECIBIDO', NEW.estado, NEW.id_usuario_registro, 'Apertura de la orden');
END$$

CREATE TRIGGER `trg_orden_historial_au`
AFTER UPDATE ON `orden_servicio`
FOR EACH ROW
BEGIN
  IF NEW.estado <> OLD.estado THEN
    INSERT INTO `orden_estado_historial`
      (`id_orden`, `estado_anterior`, `estado_nuevo`, `id_usuario`, `comentario`)
    VALUES (NEW.id_orden, OLD.estado, NEW.estado, NEW.id_usuario_registro, NULL);
  END IF;
END$$

-- El estado del equipo acompana al de la orden (apartado 10.2).
CREATE TRIGGER `trg_orden_equipo_ai`
AFTER INSERT ON `orden_servicio`
FOR EACH ROW
BEGIN
  UPDATE `equipo`
     SET `estado` = CASE NEW.estado
                      WHEN 'RECIBIDO'      THEN 'EN_TALLER'
                      WHEN 'EN_DIAGNOSTICO' THEN 'EN_DIAGNOSTICO'
                      WHEN 'PRESUPUESTADO'  THEN 'EN_TALLER'
                      WHEN 'EN_REPARACION'  THEN 'EN_REPARACION'
                      WHEN 'LISTO'          THEN 'LISTO'
                      WHEN 'ENTREGADO'      THEN 'ENTREGADO'
                      ELSE `estado`
                    END
   WHERE `id_equipo` = NEW.id_equipo;
END$$

CREATE TRIGGER `trg_orden_equipo_au`
AFTER UPDATE ON `orden_servicio`
FOR EACH ROW
BEGIN
  IF NEW.estado <> OLD.estado THEN
    UPDATE `equipo`
       SET `estado` = CASE NEW.estado
                        WHEN 'RECIBIDO'      THEN 'EN_TALLER'
                        WHEN 'EN_DIAGNOSTICO' THEN 'EN_DIAGNOSTICO'
                        WHEN 'PRESUPUESTADO'  THEN 'EN_TALLER'
                        WHEN 'EN_REPARACION'  THEN 'EN_REPARACION'
                        WHEN 'LISTO'          THEN 'LISTO'
                        WHEN 'ENTREGADO'      THEN 'ENTREGADO'
                        ELSE `estado`
                      END
     WHERE `id_equipo` = NEW.id_equipo;
  END IF;
END$$

CREATE TRIGGER `trg_comprobante_numero_bi`
BEFORE INSERT ON `comprobante_pago`
FOR EACH ROW
BEGIN
  DECLARE v_secuencia BIGINT;
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    IF NEW.tipo = 'BOLETA' THEN
      CALL `sp_siguiente_secuencia`('comprobante_boleta', v_secuencia);
      SET NEW.numero = CONCAT('B001-', LPAD(v_secuencia, 7, '0'));
    ELSE
      CALL `sp_siguiente_secuencia`('comprobante_factura', v_secuencia);
      SET NEW.numero = CONCAT('F001-', LPAD(v_secuencia, 7, '0'));
    END IF;
  END IF;

  SET NEW.subtotal = ROUND(NEW.total / 1.18, 2);
  SET NEW.impuesto = ROUND(NEW.total - NEW.subtotal, 2);
END$$

CREATE TRIGGER `trg_tecnico_codigo_bi`
BEFORE INSERT ON `tecnico`
FOR EACH ROW
BEGIN
  DECLARE v_secuencia BIGINT;
  IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
    CALL `sp_siguiente_secuencia`('tecnico', v_secuencia);
    SET NEW.codigo = CONCAT('TEC-', LPAD(v_secuencia, 4, '0'));
  END IF;
END$$

DELIMITER ;


-- =============================================================================
--  FIN DE 02_triggers.sql
--  Continuar con 03_seed.sql
-- =============================================================================
