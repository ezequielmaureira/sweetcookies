-- Interruptor maestro "Pedidos activos" (antes "pedidos por WhatsApp").
-- RENAME: conserva el valor actual de cada instalación (sin pérdida de datos).
ALTER TABLE "site_settings" RENAME COLUMN "whatsapp_orders_enabled" TO "orders_enabled";

-- Mensaje opcional para el comprador cuando los pedidos están pausados.
ALTER TABLE "site_settings" ADD COLUMN "orders_disabled_message" VARCHAR(200);
