import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { centsToDecimalString, decimalToCents, parseMoney } from "./money.ts";
import {
  OrderError,
  customerSortKey,
  orderByFor,
  orderWhere,
  parseOrderListQuery,
  priceOrder,
  toReceipt,
  validateOrderRequest,
} from "./orders.ts";
import { detectImageType, imageSize, validateImage } from "./images.ts";
import {
  DEFAULT_BOX_VIEW,
  compareCatalogOrder,
  displayStatus,
  duplicateData,
  isPurchasable,
  normalizeImageUrl,
  toAdminProduct,
  toPublicProduct,
  validateProductInput,
  type ProductRecord,
} from "./products.ts";

export function product(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: "chips",
    name: "Cookie Chips Clásica",
    description: "Masa dorada y chips de chocolate",
    priceCents: 500000,
    costCents: 250000,
    stock: 10,
    imageUrl: "/images/cookies/hero-cookie-cutout.png",
    category: "Cookies",
    status: "ACTIVE",
    featured: false,
    sortOrder: 1,
    ...DEFAULT_BOX_VIEW,
    createdAt: new Date("2026-09-01T12:00:00Z"),
    updatedAt: new Date("2026-09-01T12:00:00Z"),
    ...overrides,
  };
}

describe("dinero (centavos exactos)", () => {
  it("parsea importes sin errores de coma flotante", () => {
    assert.equal(parseMoney("5000"), 500000);
    assert.equal(parseMoney("5000.5"), 500050);
    assert.equal(parseMoney("0.10"), 10);
    assert.equal(parseMoney(19.99), 1999);
    assert.equal(parseMoney("0.1"), 10);
    for (const bad of ["", "-1", "1,5", "abc", "1.234", null, undefined, Number.NaN, -3]) assert.equal(parseMoney(bad), null);
  });
  it("0.1 + 0.2 da exacto en centavos", () => {
    assert.equal(centsToDecimalString((parseMoney("0.1") ?? 0) + (parseMoney("0.2") ?? 0)), "0.30");
  });
  it("convierte Decimal ↔ string sin Float", () => {
    assert.equal(centsToDecimalString(500050), "5000.50");
    assert.equal(centsToDecimalString(-150), "-1.50");
    assert.equal(decimalToCents("5000.50"), 500050);
    assert.equal(decimalToCents({ toFixed: () => "12.30" }), 1230);
    assert.equal(decimalToCents("-1.50"), -150);
  });
});

describe("productos", () => {
  it("estado visual: ACTIVO, PAUSADO o SIN STOCK (calculado)", () => {
    assert.equal(displayStatus(product()), "ACTIVE");
    assert.equal(displayStatus(product({ stock: 0 })), "OUT_OF_STOCK");
    assert.equal(displayStatus(product({ status: "PAUSED", stock: 0 })), "PAUSED");
  });
  it("solo se compra si está activo, con stock y con precio", () => {
    assert.equal(isPurchasable(product()), true);
    assert.equal(isPurchasable(product({ stock: 0 })), false);
    assert.equal(isPurchasable(product({ status: "PAUSED" })), false);
    assert.equal(isPurchasable(product({ priceCents: 0 })), false);
  });
  it("la vista pública nunca expone costo ni ganancia", () => {
    const pub = toPublicProduct(product()) as Record<string, unknown>;
    assert.equal(pub.price, "5000.00");
    for (const secret of ["cost", "costCents", "unitProfit", "profit", "status", "sortOrder"]) assert.ok(!(secret in pub), secret);
  });
  it("la vista admin incluye costo y ganancia por unidad", () => {
    const admin = toAdminProduct(product());
    assert.equal(admin.cost, "2500.00");
    assert.equal(admin.unitProfit, "2500.00");
    assert.equal(admin.displayStatus, "ACTIVE");
  });
  it("destacados primero, después el orden del catálogo", () => {
    const list = [product({ id: "b", sortOrder: 1 }), product({ id: "c", sortOrder: 2, featured: true }), product({ id: "a", sortOrder: 0 })];
    assert.deepEqual(list.sort(compareCatalogOrder).map((p) => p.id), ["c", "a", "b"]);
  });
  it("valida la creación completa", () => {
    const ok = validateProductInput({ name: "  Double  Chocolate ", price: "6000", cost: 3000, stock: 12, featured: true }, false);
    assert.ok(ok.ok);
    if (ok.ok) {
      assert.equal(ok.data.name, "Double Chocolate");
      assert.equal(ok.data.priceCents, 600000);
      assert.equal(ok.data.costCents, 300000);
      assert.equal(ok.data.status, "ACTIVE");
      assert.equal(ok.data.imageUrl, null);
    }
    const bad = validateProductInput({ name: "", price: "-1", cost: "x", stock: -2 }, false);
    assert.ok(!bad.ok);
    if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ["cost", "name", "price", "stock"]);
  });
  it("la edición parcial solo toca lo enviado", () => {
    const patch = validateProductInput({ status: "PAUSED" }, true);
    assert.deepEqual(patch, { ok: true, data: { status: "PAUSED" } });
    assert.ok(!validateProductInput({}, true).ok);
    assert.ok(!validateProductInput({ stock: 1.5 }, true).ok);
    assert.ok(!validateProductInput({ featured: "si" }, true).ok);
  });
  it("imagen: ruta del sitio o https, nunca javascript:/http:", () => {
    assert.equal(normalizeImageUrl("/images/cookies/pistacho.jpg"), "/images/cookies/pistacho.jpg");
    assert.equal(normalizeImageUrl("https://cdn.example.com/a.jpg"), "https://cdn.example.com/a.jpg");
    for (const bad of ["javascript:alert(1)", "http://x.com/a.jpg", "//evil.com/a.jpg", "/../secret", "data:image/png;base64,AAA"]) {
      assert.equal(normalizeImageUrl(bad), null, bad);
    }
  });
  it("duplicar crea una copia pausada y sin destacar", () => {
    const copy = duplicateData(product({ featured: true }));
    assert.equal(copy.name, "Cookie Chips Clásica (copia)");
    assert.equal(copy.status, "PAUSED");
    assert.equal(copy.featured, false);
    assert.equal(copy.priceCents, 500000);
  });
});

describe("vista en caja", () => {
  it("al crear, el encuadre arranca centrado y sin imagen de caja", () => {
    const r = validateProductInput({ name: "Chips", price: "5000", cost: "2500", stock: 3 }, false);
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.data.boxImageUrl, null);
      assert.equal(r.data.boxImageScale, 1);
      assert.equal(r.data.boxImageX, 50);
      assert.equal(r.data.boxImageY, 50);
      assert.equal(r.data.boxImageRotation, 0);
    }
  });
  it("acepta encuadre dentro de rango e imagen de caja subida", () => {
    const r = validateProductInput(
      { boxImageUrl: "/api/public/images/cm123abc456def", boxImageScale: 1.456, boxImageX: 30, boxImageY: 72.5, boxImageRotation: -15 },
      true,
    );
    assert.deepEqual(r, {
      ok: true,
      data: { boxImageUrl: "/api/public/images/cm123abc456def", boxImageScale: 1.46, boxImageX: 30, boxImageY: 72.5, boxImageRotation: -15 },
    });
    assert.deepEqual(validateProductInput({ boxImageUrl: "" }, true), { ok: true, data: { boxImageUrl: null } });
  });
  it("rechaza valores fuera de rango", () => {
    const r = validateProductInput(
      { boxImageScale: 0.5, boxImageX: 101, boxImageY: -1, boxImageRotation: 12.5, boxImageUrl: "javascript:alert(1)" },
      true,
    );
    assert.ok(!r.ok);
    if (!r.ok) assert.deepEqual(Object.keys(r.errors).sort(), ["boxImageRotation", "boxImageScale", "boxImageUrl", "boxImageX", "boxImageY"]);
    assert.ok(!validateProductInput({ boxImageScale: 5 }, true).ok);
    assert.ok(!validateProductInput({ boxImageX: "50" }, true).ok);
  });
  it("la vista pública incluye el encuadre (no es dato sensible)", () => {
    const pub = toPublicProduct(product({ boxImageUrl: "/api/public/images/abcdefghijkl", boxImageScale: 1.5 }));
    assert.equal(pub.boxImageUrl, "/api/public/images/abcdefghijkl");
    assert.equal(pub.boxImageScale, 1.5);
  });
  it("duplicar conserva la vista en caja", () => {
    const copy = duplicateData(product({ boxImageScale: 2, boxImageX: 20 }));
    assert.equal(copy.boxImageScale, 2);
    assert.equal(copy.boxImageX, 20);
  });
});

/** PNG de 1×1 válido. */
export const PNG_1x1 = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
  (ch) => ch.charCodeAt(0),
);

describe("imágenes subidas", () => {
  it("detecta el tipo por contenido y lee dimensiones", () => {
    assert.equal(detectImageType(PNG_1x1), "image/png");
    assert.deepEqual(imageSize(PNG_1x1, "image/png"), { width: 1, height: 1 });
    assert.equal(detectImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
    assert.equal(detectImageType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  });
  it("rechaza vacíos, tipos no permitidos, tipos que no coinciden y archivos grandes", () => {
    assert.deepEqual(validateImage(new Uint8Array(), "image/png"), { ok: false, error: "empty" });
    assert.deepEqual(validateImage(new TextEncoder().encode("<svg onload=alert(1)>"), "image/svg+xml"), { ok: false, error: "unsupported_type" });
    assert.deepEqual(validateImage(PNG_1x1, "image/jpeg"), { ok: false, error: "type_mismatch" });
    assert.deepEqual(validateImage(new Uint8Array(1_600_000), "image/png"), { ok: false, error: "too_large" });
    const ok = validateImage(PNG_1x1, "image/png");
    assert.ok(ok.ok && ok.type === "image/png" && ok.width === 1);
  });
});

describe("pedidos: validación", () => {
  const customer = { name: " Juan ", lastName: "Pérez", phone: "+54 9 358 412-3456", email: "Juan@Mail.com ", deliveryMethod: "PICKUP" };

  it("normaliza cliente y suma cantidades del mismo producto", () => {
    const r = validateOrderRequest({ items: [{ productId: "chips", quantity: 2 }, { productId: "chips", quantity: 1 }], customer });
    assert.ok(r.ok);
    if (r.ok) {
      assert.deepEqual(r.data.items, [{ productId: "chips", quantity: 3 }]);
      assert.equal(r.data.customer.name, "Juan");
      assert.equal(r.data.customer.phone, "5493584123456");
      assert.equal(r.data.customer.email, "juan@mail.com");
      assert.equal(r.data.customer.address, null);
    }
  });
  it("rechaza pedido vacío, cantidades inválidas y datos faltantes", () => {
    const bad = (body: unknown) => {
      const r = validateOrderRequest(body);
      return r.ok ? {} : r.errors;
    };
    assert.ok(bad({ items: [], customer }).items);
    assert.ok(bad({ items: [{ productId: "chips", quantity: 0 }], customer }).items);
    assert.ok(bad({ items: [{ productId: "chips", quantity: 2.5 }], customer }).items);
    assert.ok(bad({ items: [{ productId: "chips", quantity: 1 }], customer: { ...customer, name: "" } }).name);
    assert.ok(bad({ items: [{ productId: "chips", quantity: 1 }], customer: { ...customer, email: "no-es-mail" } }).email);
    assert.ok(bad({ items: [{ productId: "chips", quantity: 1 }], customer: { ...customer, deliveryMethod: "DELIVERY" } }).address);
  });
  it("ignora precios o ganancias que mande el cliente", () => {
    const r = validateOrderRequest({ items: [{ productId: "chips", quantity: 1, price: 1, profit: 999 }], customer, total: 1 });
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(r.data.items, [{ productId: "chips", quantity: 1 }]);
  });
});

describe("pedidos: cálculo con snapshots", () => {
  it("subtotal, total y ganancia salen de la base", () => {
    const priced = priceOrder(
      [
        { productId: "chips", quantity: 2 },
        { productId: "double", quantity: 1 },
      ],
      [product(), product({ id: "double", name: "Double Chocolate", priceCents: 600050, costCents: 300025 })],
    );
    assert.equal(priced.totalCents, 2 * 500000 + 600050);
    assert.equal(priced.profitCents, 2 * 250000 + 300025);
    assert.equal(priced.itemCount, 3);
    assert.deepEqual(priced.lines[0], {
      productId: "chips",
      productNameSnapshot: "Cookie Chips Clásica",
      quantity: 2,
      unitPriceCents: 500000,
      unitCostCents: 250000,
      subtotalCents: 1000000,
      profitCents: 500000,
    });
    const receipt = toReceipt({ id: "o1", number: 1001, itemCount: 3 }, priced) as unknown as Record<string, unknown>;
    assert.equal(receipt.total, "16000.50");
    assert.ok(!("profit" in receipt));
    assert.ok(JSON.stringify(receipt).indexOf("unitCost") === -1);
  });
  it("sin stock suficiente, pausado o inexistente → rechaza TODO el pedido", () => {
    const attempt = (items: { productId: string; quantity: number }[], products: ProductRecord[]) => {
      try {
        priceOrder(items, products);
        return null;
      } catch (error) {
        assert.ok(error instanceof OrderError);
        return error.problems;
      }
    };
    assert.deepEqual(attempt([{ productId: "chips", quantity: 11 }], [product()]), [
      { productId: "chips", name: "Cookie Chips Clásica", reason: "insufficient_stock", available: 10 },
    ]);
    assert.equal(attempt([{ productId: "chips", quantity: 1 }], [product({ status: "PAUSED" })])?.[0].reason, "unavailable");
    assert.equal(attempt([{ productId: "chips", quantity: 1 }], [product({ stock: 0 })])?.[0].reason, "unavailable");
    assert.equal(attempt([{ productId: "nope", quantity: 1 }], [])?.[0].reason, "not_found");
    // Uno bien y uno mal: no hay pedido parcial.
    assert.equal(attempt([{ productId: "chips", quantity: 1 }, { productId: "nope", quantity: 1 }], [product()])?.length, 1);
  });
});

describe("pedidos: filtros del admin", () => {
  it("parsea búsqueda, fechas (días de Argentina), orden y página", () => {
    const q = parseOrderListQuery(new URLSearchParams("q=  Juan   Pérez &from=2026-09-01&to=2026-09-30&sort=profit_desc&page=2"));
    assert.equal(q.q, "Juan Pérez");
    assert.equal(q.from?.toISOString(), "2026-09-01T03:00:00.000Z");
    assert.equal(q.to?.toISOString(), "2026-10-01T03:00:00.000Z");
    assert.equal(q.sort, "profit_desc");
    assert.equal(q.page, 2);
    const d = parseOrderListQuery(new URLSearchParams("sort=DROP TABLE&from=ayer&page=-4"));
    assert.equal(d.sort, "recent");
    assert.equal(d.from, null);
    assert.equal(d.page, 1);
  });
  it("cada criterio de orden va a la base con desempate estable", () => {
    assert.deepEqual(orderByFor("recent")[0], { createdAt: "desc" });
    assert.deepEqual(orderByFor("oldest")[0], { createdAt: "asc" });
    assert.deepEqual(orderByFor("total_desc")[0], { total: "desc" });
    assert.deepEqual(orderByFor("total_asc")[0], { total: "asc" });
    assert.deepEqual(orderByFor("profit_desc")[0], { profit: "desc" });
    assert.deepEqual(orderByFor("profit_asc")[0], { profit: "asc" });
    assert.deepEqual(orderByFor("customer_asc")[0], { customerSortKey: "asc" });
    assert.deepEqual(orderByFor("customer_desc")[0], { customerSortKey: "desc" });
  });
  it("búsqueda: cada palabra en nombre/apellido/email/teléfono, sin mayúsculas", () => {
    const where = orderWhere({ q: "juan 358-412", from: null, to: null }) as { AND: { OR: Record<string, unknown>[] }[] };
    assert.equal(where.AND.length, 2);
    assert.deepEqual(where.AND[0].OR[0], { customerName: { contains: "juan", mode: "insensitive" } });
    assert.deepEqual(where.AND[1].OR.at(-1), { customerPhone: { contains: "358412", mode: "insensitive" } });
    assert.deepEqual(orderWhere({ q: null, from: null, to: null }), {});
  });
  it("clave de orden por cliente en minúsculas", () => {
    assert.equal(customerSortKey("Ana", "Zapata"), "ana zapata");
    assert.equal(customerSortKey("juan", null), "juan");
  });
});
