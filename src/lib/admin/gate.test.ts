import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeAdminNext } from "./gate.ts";

describe("safeAdminNext", () => {
  it("acepta rutas del panel", () => {
    assert.equal(safeAdminNext("/admin/configuracion"), "/admin/configuracion");
    assert.equal(safeAdminNext("/admin"), "/admin");
  });
  it("rechaza destinos externos, raros o la propia pantalla de acceso", () => {
    for (const bad of [null, undefined, "", "https://evil.example", "//evil.example", "/", "/arma-tu-caja", "/admin/acceso", "/admin/acceso?next=/x"]) {
      assert.equal(safeAdminNext(bad), "/admin");
    }
  });
});
