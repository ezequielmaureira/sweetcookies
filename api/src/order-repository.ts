import type { PrismaClient } from "./generated/prisma/client.ts";
import { toProductRecord } from "./catalog-repository.ts";
import { centsToDecimalString, decimalToCents } from "./money.ts";
import {
  OrderError,
  customerSortKey,
  orderByFor,
  orderWhere,
  priceOrder,
  toReceipt,
  type DeliveryMethod,
  type OrderListQuery,
  type OrderRequest,
  type OrderStatus,
  type PublicOrderReceipt,
} from "./orders.ts";
import { SETTINGS_ID } from "./settings.ts";

export type OrderSummaryRow = {
  id: string;
  number: number;
  createdAt: string;
  customerName: string;
  customerLastName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  deliveryMethod: DeliveryMethod;
  itemCount: number;
  total: string;
  profit: string;
  status: OrderStatus;
};

export type OrderDetail = OrderSummaryRow & {
  deliveryAddress: string | null;
  notes: string | null;
  items: {
    productId: string | null;
    productName: string;
    quantity: number;
    unitPrice: string;
    unitCost: string;
    subtotal: string;
    profit: string;
  }[];
};

export type OrderList = {
  summary: { orders: number; revenue: string; profit: string; items: number };
  orders: OrderSummaryRow[];
  page: number;
  pageSize: number;
  totalPages: number;
};

export type OrderRepository = {
  /** Crea el pedido de forma atómica (valida, calcula, guarda y descuenta stock). */
  create(request: OrderRequest): Promise<{ receipt: PublicOrderReceipt; whatsappNumber: string }>;
  list(query: OrderListQuery): Promise<OrderList>;
  get(id: string): Promise<OrderDetail | null>;
};

type Money = { toFixed(digits: number): string };
const money = (value: Money | null | undefined) => centsToDecimalString(value ? decimalToCents(value) : 0);

type OrderRow = {
  id: string;
  number: number;
  createdAt: Date;
  customerName: string;
  customerLastName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  deliveryMethod: DeliveryMethod;
  itemCount: number;
  total: Money;
  profit: Money;
  status: OrderStatus;
};

const toSummaryRow = (o: OrderRow): OrderSummaryRow => ({
  id: o.id,
  number: o.number,
  createdAt: o.createdAt.toISOString(),
  customerName: o.customerName,
  customerLastName: o.customerLastName,
  customerPhone: o.customerPhone,
  customerEmail: o.customerEmail,
  deliveryMethod: o.deliveryMethod,
  itemCount: o.itemCount,
  total: money(o.total),
  profit: money(o.profit),
  status: o.status,
});

/** Se lanza dentro de la transacción si otro pedido se llevó el stock entre la lectura y el descuento. */
class StockRaceError extends Error {}

export function createOrderRepository(prisma: PrismaClient): OrderRepository {
  return {
    async create(request) {
      const attempt = () =>
        prisma.$transaction(async (tx) => {
          const settings = await tx.siteSettings.findUnique({ where: { id: SETTINGS_ID } });
          if (settings && !settings.ordersEnabled) throw new OrderError("orders_paused");
          if (!settings?.whatsappNumber) throw new OrderError("whatsapp_not_configured");

          // 1-5) Productos reales + precio/costo de la base → snapshots y totales.
          const ids = request.items.map((i) => i.productId);
          const products = (await tx.product.findMany({ where: { id: { in: ids } } })).map(toProductRecord);
          const priced = priceOrder(request.items, products);

          // 8) Descuento de stock condicionado: solo si sigue ACTIVE y alcanza.
          //    Un UPDATE atómico por producto: con pedidos concurrentes nunca baja de 0
          //    (además hay un CHECK stock >= 0 en la base).
          for (const line of priced.lines) {
            const { count } = await tx.product.updateMany({
              where: { id: line.productId, status: "ACTIVE", stock: { gte: line.quantity } },
              data: { stock: { decrement: line.quantity } },
            });
            if (count !== 1) throw new StockRaceError();
          }

          // 6-7) Pedido + items con los valores históricos.
          const { customer } = request;
          const order = await tx.order.create({
            data: {
              customerName: customer.name,
              customerLastName: customer.lastName,
              customerPhone: customer.phone,
              customerEmail: customer.email,
              customerSortKey: customerSortKey(customer.name, customer.lastName),
              deliveryMethod: customer.deliveryMethod,
              deliveryAddress: customer.address,
              notes: customer.notes,
              total: centsToDecimalString(priced.totalCents),
              profit: centsToDecimalString(priced.profitCents),
              itemCount: priced.itemCount,
              items: {
                create: priced.lines.map((l) => ({
                  productId: l.productId,
                  productNameSnapshot: l.productNameSnapshot,
                  quantity: l.quantity,
                  unitPrice: centsToDecimalString(l.unitPriceCents),
                  unitCost: centsToDecimalString(l.unitCostCents),
                  subtotal: centsToDecimalString(l.subtotalCents),
                  profit: centsToDecimalString(l.profitCents),
                })),
              },
            },
            select: { id: true, number: true, itemCount: true },
          });

          return { receipt: toReceipt(order, priced), whatsappNumber: settings.whatsappNumber };
        });

      try {
        return await attempt();
      } catch (error) {
        if (!(error instanceof StockRaceError)) throw error;
        // Otro pedido ganó la carrera: se reintenta una vez leyendo el stock nuevo,
        // así el comprador recibe el detalle de qué producto se quedó sin stock.
        try {
          return await attempt();
        } catch (retryError) {
          if (retryError instanceof StockRaceError) throw new OrderError("invalid_items");
          throw retryError;
        }
      }
    },

    async list(query) {
      const where = orderWhere(query);
      const [aggregate, rows] = await Promise.all([
        prisma.order.aggregate({ where, _count: { _all: true }, _sum: { total: true, profit: true, itemCount: true } }),
        prisma.order.findMany({
          where,
          orderBy: orderByFor(query.sort),
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]);
      const count = aggregate._count._all;
      return {
        summary: {
          orders: count,
          revenue: money(aggregate._sum.total),
          profit: money(aggregate._sum.profit),
          items: aggregate._sum.itemCount ?? 0,
        },
        orders: rows.map(toSummaryRow),
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.max(1, Math.ceil(count / query.pageSize)),
      };
    },

    async get(id) {
      const order = await prisma.order.findUnique({ where: { id }, include: { items: { orderBy: { createdAt: "asc" } } } });
      if (!order) return null;
      return {
        ...toSummaryRow(order),
        deliveryAddress: order.deliveryAddress,
        notes: order.notes,
        items: order.items.map((item) => ({
          productId: item.productId,
          productName: item.productNameSnapshot,
          quantity: item.quantity,
          unitPrice: money(item.unitPrice),
          unitCost: money(item.unitCost),
          subtotal: money(item.subtotal),
          profit: money(item.profit),
        })),
      };
    },
  };
}
