import type { Metadata, Viewport } from "next";
import Link from "next/link";
import shared from "@/components/challenge/Challenge.module.css";
import styles from "@/components/challenge/Bases.module.css";
import { getPublicSettings } from "@/lib/site-settings";

export const metadata: Metadata = {
  title: "Bases y condiciones — Sweet Click Challenge",
  description: "Borrador de las bases de los torneos Sweet Click Challenge (Río Cuarto).",
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
        <p className={styles.subtitle}>Sweet Click Challenge · Torneos</p>
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
            elegibilidad antes de recibir el premio.
          </p>
          <p>
            Antes de jugar, cada participante deja su usuario de Instagram (@), que tiene que ser suyo, su nombre y apellido y su número de WhatsApp, y
            acepta estas bases y el tratamiento de esos datos para la finalidad que se explica en el punto 13. Los tres datos son obligatorios. Quien ya
            participaba antes de este requisito los completa antes de su próxima partida, sin perder sus intentos ni sus resultados.
          </p>
        </section>

        <section>
          <h2>4. Torneos y fechas</h2>
          <p>
            El campeonato se organiza en torneos. Cada torneo tiene su propio nombre, su fecha y hora de inicio y de finalización, su premio y su cantidad de
            intentos, y todo eso se informa en la página antes de participar. Las fechas se rigen por la hora de Córdoba (America/Argentina/Cordoba) que
            registra el servidor de Sweet Cookies. Cada torneo tiene su propio ranking; los resultados de torneos anteriores se conservan.
          </p>
          <p>
            Solo se aceptan partidas oficiales que empiecen dentro del período del torneo. Una partida que empezó antes del cierre puede terminar sus 15
            segundos, con un margen técnico acotado para enviar el resultado.
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
            <li>Cada torneo establece cuántos intentos oficiales tiene cada participante, para todo el torneo.</li>
            <li>Los intentos no se renuevan por día ni pasan de un torneo a otro.</li>
            <li>Una partida oficial iniciada consume un intento aunque se abandone o se corte la conexión, salvo un error del servidor verificable.</li>
            <li>Cada @ participa desde un solo navegador. Usar otro @ o registrar varias cuentas para conseguir más intentos es motivo de descalificación.</li>
            <li>No hay partidas de práctica: toda partida es oficial, pertenece a un torneo activo y usa uno de tus intentos.</li>
            <li>Cuando usás todos tus intentos, ya no podés volver a jugar ese torneo.</li>
          </ul>
        </section>

        <section>
          <h2>7. Ganador y desempate</h2>
          <p>
            En el ranking cuenta el mejor resultado válido de cada participante en el torneo (no se suman los intentos). Si hay empate, gana quien consiguió
            primero esa puntuación, según la hora del servidor.
          </p>
        </section>

        <section>
          <h2>8. Premio</h2>
          <p>
            Cada torneo informa su premio antes de participar. Solo el primer puesto confirmado gana ese premio; el resto de los puestos no recibe premio. El
            premio no se puede cambiar por dinero. Una vez confirmado el ganador, Sweet Cookies lo contacta por el WhatsApp que dejó al registrarse para
            coordinar la verificación de sus datos y la entrega; no hace falta volver a cargarlos. Si un ganador no tiene esos datos registrados (por haber
            participado antes de este requisito), los deja desde el mismo navegador con el que jugó o escribe por Instagram a {instagram} desde la cuenta
            ganadora.
          </p>
          <p>La entrega del premio estará sujeta a la confirmación del ganador y a la verificación de los datos necesarios para coordinarla.</p>
          <p>
            Para que el torneo tenga un ganador con derecho al premio, deberá alcanzarse la cantidad mínima de participantes válidos indicada al momento de
            su publicación. Se considera participante válido a quien haya completado al menos una partida oficial válida y no haya sido descalificado. Si no
            se alcanza dicho mínimo, el torneo finalizará sin adjudicación del premio.
          </p>
          <p>
            El mínimo de cada torneo se informa en la página del torneo junto al premio, antes de participar, y no cambia una vez publicado. Cuentan las
            personas, no los intentos: quien juega varias partidas cuenta una sola vez. No cuentan quienes solo se registraron o abrieron un enlace, las
            partidas rechazadas en la revisión ni los participantes descalificados.
          </p>
          <p>Los torneos históricos de prueba (anteriores a los torneos reales) no entregan premios.</p>
          <p className={styles.pending}>A definir: forma de entrega en Río Cuarto y plazo para reclamar el premio.</p>
        </section>

        <section>
          <h2>9. Invitaciones a amigos</h2>
          <p>
            Podés invitar a tus amigos con tu enlace personal (WhatsApp, compartir o copiar). Invitar no da intentos, puntos, ventajas en el ranking ni
            premios: gana siempre el mejor resultado válido. Solo medimos cuántas personas abrieron tu enlace y cuántas se registraron desde él, para saber
            cómo se difunde el campeonato. El enlace no contiene datos personales.
          </p>
        </section>

        <section>
          <h2>10. Instagram</h2>
          <p>
            Para participar te invitamos a seguir a {instagram}. El sistema no comprueba automáticamente si seguís la cuenta: la página solo recuerda ese
            paso en tu navegador. Nunca vamos a pedir contraseñas ni acceso a cuentas.
          </p>
          <p>Esta promoción no está patrocinada, avalada ni administrada por Instagram ni por Meta, ni está asociada a ellas.</p>
        </section>

        <section>
          <h2>11. Verificación de la cuenta y de los datos</h2>
          <p>
            Sweet Cookies podrá verificar la autenticidad de la cuenta de Instagram utilizada para participar y la veracidad de los datos proporcionados
            por los participantes, especialmente por quien resulte ganador.
          </p>
          <p>
            La utilización de cuentas falsas, suplantación de identidad, información deliberadamente incorrecta o mecanismos fraudulentos podrá dar lugar a
            la descalificación, previa revisión del caso.
          </p>
          <p>La entrega del premio estará sujeta a la confirmación del ganador y a la verificación de los datos necesarios para coordinarla.</p>
          <p>
            Esta verificación la hace la organización de forma manual cuando resulta necesaria (por ejemplo, por mensaje de Instagram o de WhatsApp). No es
            automática y no usa servicios de Instagram, Meta ni de terceros.
          </p>
        </section>

        <section>
          <h2>12. Revisión de resultados y descalificación</h2>
          <p>
            La organización puede revisar resultados con patrones anormales (por ejemplo, programas que tocan solos, scripts, registros múltiples o datos
            falsos) y descalificar participaciones de forma justificada. Jugar muy rápido no es, por sí solo, motivo de descalificación. Compartir la conexión
            a internet (por ejemplo, en familia) tampoco lo es: solo se revisa. El ganador se confirma al cierre de cada torneo, recién después de esta revisión.
          </p>
        </section>

        <section>
          <h2>13. Datos personales y privacidad</h2>
          <p>
            <strong>Quién los administra:</strong> Sweet Cookies, organizadora del campeonato, es responsable de los datos que dejás para participar.
          </p>
          <p className={styles.pending}>A definir: nombre o razón social del responsable, CUIT y domicilio o medio de contacto formal.</p>
          <p>
            <strong>Qué datos recopilamos:</strong>
          </p>
          <ul>
            <li>Tu usuario de Instagram (@): se muestra en el ranking público junto con tu puntaje.</li>
            <li>Tu nombre y apellido y tu número de WhatsApp: nunca se publican ni aparecen en el ranking, en los enlaces para compartir ni en la página.</li>
            <li>
              Para cuidar el campeonato, la hora de cada partida y una huella cifrada de la conexión (no la dirección IP en sí). Sirve solo para detectar
              posibles registros duplicados.
            </li>
            <li>
              Si abrís un enlace de invitación, un identificador aleatorio guardado en tu navegador para no contar dos veces la misma visita. No usamos
              cookies publicitarias ni rastreo entre sitios.
            </li>
            <li>No pedimos DNI ni domicilio para participar.</li>
          </ul>
          <p>
            <strong>Para qué los usamos:</strong> únicamente para gestionar el campeonato (registrarte, cuidar que cada persona participe una sola vez y
            revisar los resultados) y para contactarte por WhatsApp si resultás ganador, para verificar tus datos y coordinar la entrega del premio. No
            usamos tu número para publicidad ni promociones: para eso te pediríamos un consentimiento aparte. No vendemos ni cedemos tus datos.
          </p>
          <p>
            <strong>Quién los ve:</strong> solo las personas autorizadas de Sweet Cookies, desde el panel de administración protegido. El número completo
            se muestra únicamente en los datos del ganador de cada torneo.
          </p>
          <p>
            <strong>Cuánto tiempo los conservamos:</strong> mientras participes en los torneos y, para quien gane, hasta completar la entrega del premio y
            durante el tiempo que exijan las obligaciones aplicables. Después se eliminan o se anonimizan.
          </p>
          <p className={styles.pending}>A definir: plazo concreto de conservación después de cada torneo.</p>
          <p>
            <strong>Tus derechos:</strong> podés pedir acceder a tus datos, corregirlos o eliminarlos escribiéndonos por Instagram a {instagram}. También
            podés corregir tu nombre y tu WhatsApp desde la página del campeonato, con el mismo navegador con el que participás. Si pedís eliminarlos, no
            vas a poder seguir jugando hasta volver a dejarlos; tus resultados en el ranking se conservan.
          </p>
          <p>
            La Agencia de Acceso a la Información Pública, en su carácter de órgano de control de la Ley N.º 25.326, tiene la atribución de atender las
            denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de
            protección de datos personales.
          </p>
        </section>

        <section>
          <h2>14. Suspensiones y cambios</h2>
          <p>
            Ante problemas técnicos u otras causas de fuerza mayor, la organización puede pausar o cancelar un torneo. Cualquier cambio en estas bases se publicará en
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
