import type { Metadata, Viewport } from "next";
import Link from "next/link";
import shared from "@/components/challenge/Challenge.module.css";
import styles from "@/components/challenge/Bases.module.css";
import { getPublicSettings } from "@/lib/site-settings";

export const metadata: Metadata = {
  title: "Bases y condiciones — Sweet Click Challenge",
  description: "Borrador de las bases del campeonato semanal Sweet Click Challenge (Río Cuarto).",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#1c110b",
};

/** El usuario oficial sale de la configuración (SiteSettings), con el respaldo ya existente. */
export const revalidate = 60;

export default async function ChallengeRulesPage() {
  const { instagramHandle } = await getPublicSettings();
  const instagram = instagramHandle ?? "la cuenta oficial de Instagram de Sweet Cookies";

  return (
    <div className={shared.root}>
      <main id="contenido" className={styles.page}>
        <p className={styles.back}>
          <Link href="/campeonato">← Volver al campeonato</Link>
        </p>
        <h1 className={styles.title}>Bases y condiciones</h1>
        <p className={styles.subtitle}>Sweet Click Challenge · Campeonato semanal</p>
        <p className={styles.draft} role="note">
          BORRADOR sujeto a revisión antes del lanzamiento público. Los puntos marcados como &quot;a definir&quot; todavía no están decididos.
        </p>

        <section>
          <h2>1. Organizador</h2>
          <p>Sweet Cookies, emprendimiento de cookies artesanales de Río Cuarto, Córdoba, Argentina.</p>
          <p className={styles.pending}>A definir: datos del responsable y medio de contacto formal.</p>
        </section>

        <section>
          <h2>2. Participación gratuita</h2>
          <p>Participar es gratis y no requiere ninguna compra.</p>
        </section>

        <section>
          <h2>3. Quiénes pueden participar</h2>
          <p>
            Exclusivo para residentes de Río Cuarto, Córdoba. Al participar confirmás que vivís en Río Cuarto. La persona que gane deberá acreditar su
            elegibilidad antes de recibir el premio. Para competir solo se pide tu usuario de Instagram (@), que tiene que ser tuyo.
          </p>
        </section>

        <section>
          <h2>4. Duración</h2>
          <p>
            Cada edición es semanal: empieza el lunes a las 00:00 y termina el viernes a las 23:59:59, hora de Córdoba (America/Argentina/Cordoba). El
            sábado se anuncia el resultado, después de la revisión. El domingo la competencia está cerrada. Cada lunes empieza una edición nueva con el
            ranking en cero; los resultados anteriores se conservan.
          </p>
        </section>

        <section>
          <h2>5. Mecánica</h2>
          <ul>
            <li>Cada partida dura 15 segundos.</li>
            <li>Cada toque válido sobre la cookie es una mordida y suma un punto.</li>
            <li>30 mordidas equivalen a una cookie consumida.</li>
            <li>
              Por razones técnicas, dos toques muy seguidos (menos de 40 milésimas) cuentan como uno y no se cuentan más de 20 mordidas por segundo.
            </li>
            <li>El puntaje oficial lo calcula el servidor de Sweet Cookies.</li>
          </ul>
        </section>

        <section>
          <h2>6. Intentos</h2>
          <ul>
            <li>Cada participante tiene exactamente 3 intentos oficiales por edición semanal (no por día).</li>
            <li>Los intentos no se renuevan a medianoche: vuelven a ser 3 recién con la edición siguiente, el lunes.</li>
            <li>Una partida oficial iniciada consume un intento aunque se abandone o se corte la conexión, salvo un error del servidor verificable.</li>
            <li>Cada @ participa desde un solo navegador. Usar otro @ o registrar varias cuentas para conseguir más intentos es motivo de descalificación.</li>
            <li>
              La práctica es libre e ilimitada, aun sin participar: no usa intentos y no cuenta para el ranking. Se puede seguir practicando después de usar
              los 3 intentos.
            </li>
          </ul>
        </section>

        <section>
          <h2>7. Ganador y desempate</h2>
          <p>
            Gana la mejor partida válida de la semana de cada participante (no se suman los intentos). Si hay empate, gana quien consiguió primero esa
            puntuación, según la hora del servidor.
          </p>
        </section>

        <section>
          <h2>8. Premio</h2>
          <p>
            Solo el primer puesto confirmado gana una caja de 3 cookies. El segundo y el tercer puesto no reciben premio. El premio no se puede cambiar por
            dinero. Una vez confirmado, el ganador lo reclama desde el mismo navegador con el que jugó, dejando su nombre y su celular para que Sweet Cookies
            lo contacte. Si perdió el acceso, puede escribir por Instagram a {instagram} desde la cuenta ganadora para recuperarlo.
          </p>
          <p>Durante el período de prueba privada no se entregan premios reales.</p>
          <p className={styles.pending}>A definir: forma de entrega en Río Cuarto y plazo para reclamar el premio.</p>
        </section>

        <section>
          <h2>9. Instagram</h2>
          <p>
            Para participar te invitamos a seguir a {instagram}. No se comprueba automáticamente: la página solo recuerda ese paso en tu navegador. Para
            entregar el premio, la organización puede confirmar por mensaje de Instagram que la cuenta ganadora es de quien lo reclama. Nunca vamos a
            pedir contraseñas ni acceso a cuentas.
          </p>
          <p>Esta promoción no está patrocinada, avalada ni administrada por Instagram ni por Meta, ni está asociada a ellas.</p>
        </section>

        <section>
          <h2>10. Revisión de resultados y descalificación</h2>
          <p>
            La organización puede revisar resultados con patrones anormales (por ejemplo, programas que tocan solos, scripts, registros múltiples o datos
            falsos) y descalificar participaciones de forma justificada. Jugar muy rápido no es, por sí solo, motivo de descalificación. Compartir la conexión
            a internet (por ejemplo, en familia) tampoco lo es: solo se revisa. El ganador se confirma el sábado, recién después de esta revisión.
          </p>
        </section>

        <section>
          <h2>11. Datos personales</h2>
          <ul>
            <li>Para competir pedimos solo tu usuario de Instagram, que se muestra en el ranking público junto con tu puntaje.</li>
            <li>
              Para cuidar el campeonato registramos la hora de cada partida y una huella cifrada de la conexión (no la dirección IP en sí). Sirve solo para
              detectar posibles registros duplicados.
            </li>
            <li>Solo a quien gane le pedimos nombre y celular, para coordinar la entrega. Esos datos nunca se publican. No pedimos DNI ni domicilio.</li>
            <li>Podés pedir acceder, corregir o eliminar tus datos escribiéndonos a {instagram}.</li>
          </ul>
        </section>

        <section>
          <h2>12. Suspensiones y cambios</h2>
          <p>
            Ante problemas técnicos u otras causas de fuerza mayor, la organización puede pausar una edición. Cualquier cambio en estas bases se publicará en
            esta página.
          </p>
        </section>

        <p className={styles.back}>
          <Link href="/campeonato">← Volver al campeonato</Link>
        </p>
      </main>
    </div>
  );
}
