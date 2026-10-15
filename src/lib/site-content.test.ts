import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSiteImages } from "./site-content.ts";

describe("fotos del sitio (web)", () => {
  it("usa solo fotos subidas desde el panel; el resto queda con la original", () => {
    const url = "/api/public/images/img0000000001";
    assert.deepEqual(parseSiteImages({ images: { BOX_IMAGE: url } }), { BOX_IMAGE: url });
    assert.deepEqual(parseSiteImages({ images: { BOX_IMAGE: "https://otra-web.com/x.jpg", OTRA: url } }), {});
    assert.deepEqual(parseSiteImages({ texts: {} }), {});
    assert.deepEqual(parseSiteImages(null), {});
  });
});
