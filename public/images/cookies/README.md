# Fotos de Sweet Cookies

Colocá acá las fotos reales. Se aceptan `.jpg`, `.jpeg`, `.png`, `.webp` o `.avif`
con estos nombres base (la extensión se detecta sola):

| Archivo                | Dónde se usa                                   |
| ---------------------- | ---------------------------------------------- |
| `hero-cookie-cutout`   | **Foto real** de una cookie **recortada sin fondo** (`.png`, vista cenital, ~1200 px). Es la que se "muerde" en la entrada al sitio y la del Hero (recomendado) |
| `hero-cookie`          | Foto cenital de una cookie para el hero (opcional\*) |
| `cookies-cream`        | Sabor Cookies & Cream                          |
| `red-velvet`           | Sabor Red Velvet                               |
| `pistacho`             | Sabor Pistacho                                 |
| `limon-frambuesa`      | Sabor Limón & Frambuesa                        |
| `chocotorta`           | Sabor Chocotorta                               |
| `franui`               | Sabor Estilo Franui                            |
| `box-cookies`          | Sección "Armá tu caja"                         |
| `logo-sweet-cookies`   | Logo del header (ideal: `.png` con fondo transparente) |

\* Orden de la cookie (entrada y Hero): `hero-cookie-cutout` → `hero-cookie` (recortada
en círculo) → primera foto de sabor disponible. Sin ninguna foto se muestra un
lugar neutro "Foto de la cookie" (nunca una cookie dibujada). El logo se usa solo en header,
footer y login: no define el estilo del resto del sitio.

Si falta alguna foto, la página muestra un placeholder neutro. Después de
agregar fotos, reiniciá `npm run dev` o volvé a correr `npm run build`.

Recomendado: fotos de producto de al menos 1600 px de lado, las cookies
centradas. Los sabores se recortan en formato 4:5 y la caja en 5:4.

## Origen de las fotos actuales

Todas salen de publicaciones reales de @sweet.cookies.rio4, recortadas sin la
interfaz de Instagram (sin barras, avatar, botones ni textos del post):

| Archivo                  | Publicación de origen                                  |
| ------------------------ | ------------------------------------------------------ |
| `hero-cookie-cutout.png` | Cookie clásica con chips (foto provista; sin fondo ni halo). Entrada y Hero |
| `red-velvet.jpg`         | Recorte de la Red Velvet sobre fondo liso              |
| `cookies-cream.jpg`      | Cookie con Oreo y crema                                |
| `pistacho.jpg`           | Dos cookies de pistacho en caja                        |
| `limon-frambuesa.jpg`    | Cookie de limón con chocolate blanco y frambuesa       |
| `chocotorta.jpg`         | Cookies Chocotorta                                     |
| `franui.jpg`             | Detalle de la cookie estilo Franui de la foto de caja  |
| `box-cookies.jpg`        | Caja con 2 Franui + 2 Chocotorta                       |
| `logo-sweet-cookies.png` | Logo real (sin cambios)                                |

Las mordidas de la entrada (`src/components/cookie/bites.ts`) están ajustadas a
`hero-cookie-cutout.png`: si se cambia esa foto, revisar las posiciones.
