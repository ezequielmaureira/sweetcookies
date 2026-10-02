import Image from "next/image";
import type { SiteTextGuide as Guide } from "@/lib/admin/site-text-guides";
import styles from "./Admin.module.css";

type Props = {
  guide: Guide;
  /** Número de cada campo (mismo número que en el formulario). */
  numbers: Record<string, number>;
};

/** "1" · "1 y 2" · "1–5": textos que aparecen en el mismo lugar comparten recuadro. */
function rangeLabel(ns: number[]): string {
  if (ns.length === 1) return String(ns[0]);
  const consecutive = ns.every((n, i) => i === 0 || n === ns[i - 1] + 1);
  if (consecutive && ns.length > 2) return `${ns[0]}–${ns[ns.length - 1]}`;
  return ns.length === 2 ? `${ns[0]} y ${ns[1]}` : ns.join(", ");
}

/**
 * Captura estática de una sección de la web con recuadros numerados sobre cada
 * texto editable. Solo es una referencia: no cambia mientras se escribe.
 */
export function SiteTextGuide({ guide, numbers }: Props) {
  const groups = new Map<string, { box: Guide["boxes"][string]; ns: number[] }>();
  for (const [key, box] of Object.entries(guide.boxes)) {
    const n = numbers[key];
    if (!n) continue;
    const id = `${box.x}:${box.y}:${box.w}:${box.h}`;
    const group = groups.get(id) ?? { box, ns: [] };
    group.ns.push(n);
    groups.set(id, group);
  }

  return (
    <figure className={styles.guide}>
      <div className={styles.guideFrame}>
        <Image src={guide.image} alt={guide.alt} width={guide.width} height={guide.height} sizes="(min-width: 760px) 680px, 92vw" className={styles.guideImage} />
        {[...groups.values()].map(({ box, ns }) => (
          <span
            key={ns.join("-")}
            className={styles.guideBox}
            style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
            aria-hidden="true"
          >
            <span className={styles.guideNumber}>{rangeLabel(ns.sort((a, b) => a - b))}</span>
          </span>
        ))}
      </div>
      <figcaption className={styles.help}>Referencia de la web. Los números coinciden con los campos de abajo.</figcaption>
    </figure>
  );
}
