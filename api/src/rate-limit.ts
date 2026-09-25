/**
 * Límite simple por clave (IP) en memoria, ventana deslizante.
 * Protege POST /api/orders: es público y descuenta stock, así que sin límite
 * alguien podría "reservar" todo el stock con pedidos falsos.
 * Es por instancia (Fly corre una máquina); no reemplaza un WAF.
 */
export type RateLimiter = { allow(key: string): boolean };

export function createRateLimiter({ limit, windowMs, now = Date.now }: { limit: number; windowMs: number; now?: () => number }): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    allow(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((at) => t - at < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.set(key, recent);
      // Limpieza ocasional para no crecer sin límite.
      if (hits.size > 5000) for (const [k, v] of hits) if (v.every((at) => t - at >= windowMs)) hits.delete(k);
      return true;
    },
  };
}
