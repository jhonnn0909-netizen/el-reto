# DESIGN.md — Sistema de diseño de El Reto (MVP)

Fuente de verdad visual del frontend. Se basa en dos fuentes, en este
orden de prioridad ante cualquier diferencia:

1. **La muestra negro y oro aprobada como dirección por Jhon:**
   `~/workspace/your_files/el-reto-entornos-visuales/el-reto-negro-oro.html`
   (con sus fotos en `img/`). **Si el documento 04 y la muestra
   difieren, manda la muestra.**
2. **Documento 04 de diseño UX/UI:**
   `~/workspace/el-reto-documentacion/borradores/04-diseno-ux-ui.md`
   (§4 sistema de diseño, §5 componentes, §6 navegación, §7 responsive,
   §8 accesibilidad, §9 animación, §10 estados, §11 pantallas).

> **Estado (2026-11-10):** la identidad azul-violeta anterior queda
> SUSTITUIDA por negro y oro de lujo, APROBADA por Jhon. La muestra
> v4 fue rechazada por Jhon ("Espera espera, ese diseño no me gusta":
> el cuadro de personas en línea era muy grande y la página estaba
> mal organizada). Corregido en la muestra v7 y APROBADO por Jhon
> ("Sí me gusta así"). **La muestra v7 es la referencia final de
> organización:** lista en línea pequeña, angosta y FIJA a un lado
> (siempre visible al mover la pantalla), y todo el contenido
> centrado y bien distribuido. Referencia:
> `~/workspace/your_files/el-reto-entornos-visuales/el-reto-negro-oro-v7.html`.
> Los tokens están centralizados en `tailwind.config.js` y
> `globals.css` para que un cambio sea solo de tokens.

## 1. Identidad

- **Nombre:** «El Reto» (siempre con artículo y mayúsculas iniciales),
  en título, cabecera y pie.
- **Entorno visual: NEGRO Y ORO de lujo.** Negro profundo, dorado
  brillante, plateado para segundos lugares y detalles, colores
  brillantes. Atmósfera de gala nocturna: el oro es para el ganador.
- **Logo oficial:** VS cromado con rayos de neón (opción 1 elegida por
  Jhon), animado con pulso y brillo. Componente
  `src/components/Logo.tsx` (SVG propio, sin depender de archivos
  externos). **¡NO SE CAMBIA! Orden de Jhon (2026-11-10): el logo se
  queda exactamente como fue aprobado — no va en dorado, no se
  rediseña, no se le cambia la forma ni los rayos.** El negro y oro
  aplica solo al entorno. En portada y barra superior va animado; en
  el resto, versión pequeña y estática. Nunca como fondo ni como marca
  de agua sobre texto.
- **VÍDEO DE MANOS REALES EN MOVIMIENTO, nunca emojis, dibujos ni
  fotos quietas con CSS, para jugar:** las manos se sacuden juntas
  (piedra, papel, tijera) y revelan la jugada en vídeo real (ver
  §2.2). La cuenta atrás, el revelado y la celebración usan vídeos
  de manos reales en movimiento. Las fotos quietas SOLO valen para
  elegir la jugada (botones), nunca como animación de juego.
- **Ritual de inicio de ronda:** «¡PIEDRA! ¡PAPEL! ¡TIJERAS!» con la
  misma cadencia del prototipo, en dorado.
- **Celebración:** confeti DORADO al ganar y celebración final, con
  rayos de energía dorados detrás del ganador y brillo en la arena;
  discreto y desactivable en ajustes.
- **Tono:** directo, retador, festivo sin ser infantil. Frases cortas,
  segunda persona, sin jerga técnica («jugada sellada», no «hash
  comprometido»). Sin mayúsculas sostenidas salvo el ritual y la
  etiqueta «DEMO». Números con separador de miles es-ES (1.000).

## 2. Tokens de color (Tailwind: `tailwind.config.js`, prefijo `reto`)

| Token | Hex | Uso |
|---|---|---|
| `reto.bg` | `#050505` | Fondo principal (negro profundo) |
| `reto.surface` | `#120e06` | Tarjetas, paneles, modales (marrón-negro cálido) |
| `reto.elevated` | `#1c1608` | Menús, diálogos, barra de juego |
| `reto.gold` | `#f5c542` | Dorado brillante: acción principal, logo, victoria |
| `reto.goldLight` | `#ffe98a` | Dorado claro (degradados, brillos) |
| `reto.goldDark` | `#c9962e` | Dorado oscuro (degradados, bordes) |
| `reto.goldText` | `#fff7d6` | Dorado casi blanco (inicio del degradado de texto) |
| `reto.cream` | `#f5f0e1` | Texto principal (crema cálido) |
| `reto.silver` | `#c0c0c0` | Plateado: segundos lugares, detalles, botón fantasma |
| `reto.silverLight` | `#d7dbe0` | Plateado claro (texto secundario) |
| `reto.bronze` | `#8c5a2b` | Bronce oscuro (3.er lugar) |
| `reto.bronzeLight` | `#f0a35e` | Bronce claro (3.er lugar) |
| `reto.success` | `#22c55e` | Victoria, confirmación, «en línea» / LIBRE |
| `reto.warning` | `#f59e0b` | Espera, «por jugar», saldo demo bajo |
| `reto.error` | `#ef4444` | Derrota evitable, error, «sin conexión» |
| `reto.info` | `#3b82f6` | Avisos neutros, ayuda, JUGANDO |
| `reto.demo` | `#8b5cf6` | **Exclusivo de los créditos DEMO** (violeta). Excepción documentada: el dorado es el color del premio y del ganador; si los créditos DEMO fueran dorados, se confundirían con dinero/premio. La etiqueta DEMO mantiene su violeta propio para no leerse nunca como oro. |

Texto principal: crema `#f5f0e1`. Texto secundario: plateado claro
`#d7dbe0` o crema al 60%. **Reglas:** el color nunca es el único medio
para transmitir información (siempre texto + símbolo + color). No se
usan degradados sobre texto salvo el degradado dorado de titulares
(clase `.gold-text`). El símbolo `$` nunca acompaña a un saldo DEMO
sin la etiqueta.

### Degradados dorados (de la muestra)

- **Texto dorado (`.gold-text`):**
  `linear-gradient(180deg, #fff7d6 0%, #f5c542 45%, #c9962e 75%, #ffe98a 100%)`
  con `background-clip: text`.
- **Botón principal:** `linear-gradient(180deg, #ffe98a, #f5c542 55%, #c9962e)`,
  texto oscuro `#1a1206`, sombra dorada `0 6px 22px rgba(245,197,66,.4)`.
- **Botón fantasma:** fondo `rgba(255,255,255,.06)`, borde 1,5 px `#c0c0c0`,
  texto `#e8e8e8`.
- **Tarjeta:** fondo `rgba(18,14,6,.78)`, borde 1 px `rgba(245,197,66,.45)`,
  radio 18 px, `backdrop-filter: blur(8px)`.
- **Medalla 1.º:** `linear-gradient(180deg, #ffe98a, #c9962e)`.
- **Medalla 2.º:** `linear-gradient(180deg, #ffffff, #c0c0c0)`.
- **Medalla 3.º:** `linear-gradient(180deg, #f0a35e, #8c5a2b)`.
- **Avatar:** círculo con degradado dorado y texto oscuro `#1a1206`,
  borde 2 px `#fff3c4`; variante plateada (blanco → `#c0c0c0`).
- **Barra de progreso:** fondo `rgba(255,255,255,.15)`, relleno
  `linear-gradient(90deg, #c9962e, #ffe98a)`.

### 2.1 Fotos reales (en `apps/web/public/img/`)

| Archivo | Contenido | Uso |
|---|---|---|
| `casino.jpg` | Ruleta, ases, dados dorados y fichas de casino (versión web optimizada de `casino.png`) | Fondo fijo de toda la aplicación, con velo oscuro `linear-gradient(rgba(5,5,5,.42), rgba(5,5,5,.76))` encima para que el texto se lea |
| `casino.png` | Original de `casino.jpg` (5,5 MB) | Solo archivo fuente; en la web se usa `casino.jpg` |
| `trofeo.jpg` | Trofeo dorado sobre negro | Imagen principal de la portada y tarjeta del ganador; borde dorado 2 px + brillo dorado |
| `manos.png` | Dos manos reales: tijera contra piedra | Foto del duelo en la tarjeta de reto en vivo; la ANIMACIÓN del duelo es VÍDEO (ver §2.2), nunca esta foto movida con CSS |
| `mano-piedra.jpg` | Recorte de `manos.png`: puño (piedra) | SOLO botón para ELEGIR la jugada PIEDRA; nunca como animación de juego |
| `mano-papel.jpg` | Foto real generada a juego: palma abierta (papel) | SOLO botón para ELEGIR la jugada PAPEL; nunca como animación de juego |
| `mano-tijera.jpg` | Recorte de `manos.png`: dos dedos (tijera) | SOLO botón para ELEGIR la jugada TIJERA; nunca como animación de juego |

### 2.2 Vídeos de manos reales (en `apps/web/public/video/`)

Toda animación de juego es VÍDEO de manos reales. Ninguna foto quieta
se mueve con CSS para simular juego (la animación `sacudida` de la
muestra queda PROHIBIDA para las manos; no existe en `tailwind.config.js`).

| Archivo | Contenido | Uso |
|---|---|---|
| `manos-rps-animacion.mp4` | Vídeo de referencia de Jhon (10 s, 1280×720): manos reales sacudiéndose y revelando tijera contra piedra | Referencia; la arena usa `manos-sacudida.mp4` + los clips de revelado |
| `manos-sacudida.mp4` | Recorte de 2 s del vídeo de referencia: los dos puños sacudiéndose (en bucle) | Cuenta atrás de cada ronda y espera de jugada; `loop`, `muted`, `playsInline`, sin controles |
| `revelar-piedra.mp4` | Una mano real: se sacude y se queda en puño (7 s, verificado) | Revelado de PIEDRA de un jugador; el lado del rival se espeja con `scaleX(-1)` (sigue siendo vídeo real) |
| `revelar-papel.mp4` | Una mano real: se sacude y abre la palma (7 s, verificado) | Revelado de PAPEL de un jugador |
| `revelar-tijera.mp4` | Una mano real: se sacude y abre dos dedos en V (7 s, verificado) | Revelado de TIJERA de un jugador |
| `manos-rps-rayos-brillos.mp4` | Vídeo de referencia de Jhon (10 s, 1280×720, 5,5 MB): manos reales con destellos dorados cayendo y rayos de energía al revelar tijera contra piedra | Celebración y revelado destacado (victoria); también como fondo de la pantalla de victoria |

Reglas de los vídeos: `muted`, `playsInline`, `preload="auto"` en la
arena (para que no haya espera al revelar); sin controles visibles; con
`prefers-reduced-motion` NO se reproducen: se muestra la foto del
gesto revelado (`mano-*.jpg`).

Reglas: las fotos se muestran con borde dorado (`rgba(245,197,66,.5)`)
y radio 12–20 px. La foto del duelo (`manos.png`) va en la tarjeta de
partida en vivo, como en la muestra. Los tres gestos usan SIEMPRE estas
fotos; nunca emojis ni ilustraciones dibujadas como gesto de juego.

### Estados de presencia (decisión aprobada, doc 04 §5.4)

| Estado | Color | Símbolo |
|---|---|---|
| LIBRE | verde | círculo lleno |
| EN LÍNEA | verde claro / neutro | círculo con borde |
| JUGANDO | azul | dos flechas / mando |
| POR JUGAR | ámbar | reloj |
| RETO PENDIENTE | rosado | sobre / campana |
| RETO GENERADO | violeta | rayo |
| POR INVITAR | distinto, aparte | persona con «+» |

La lista muestra contador de personas en línea y leyenda; la persona
por invitar aparece aparte, no mezclada con la lista general.

## 3. Tipografía y espaciado

- **Titular / display:** geométrica sin serifa, peso alto (sistema /
  Inter 800-900). Los titulares principales usan `.gold-text`.
  **Texto de interfaz:** sin serifa humanista (Inter 400/500/600/700).
  **Cifras:** monoespaciada solo para saldos, códigos de reto,
  contadores e historial de movimientos.
- **Escala (base 16 px):** Display 40/32 px (escritorio/móvil), H1
  28/24, H2 22/20, H3 18, cuerpo 16, secundario 14, micro 12 (nunca
  para información esencial). Interlineado mínimo 1,5 en cuerpo.
- **Espaciado:** unidad base 8 px, múltiplos de 4. Retícula de 12
  columnas en escritorio (ancho máximo de contenido 1.200 px), 8 en
  tableta, 4 en móvil. Márgenes laterales 16 px móvil / 24 px tableta /
  32 px escritorio.
- **Radio de borde:** 12 px tarjetas, 16 px paneles de juego, 999 px
  (píldora) en botones principales y etiquetas de estado, 8 px en
  campos de formulario. Las fotos usan 12–20 px (ver §2.1).
- **Objetivos táctiles:** mínimo 44 × 44 px en móvil; los gestos del
  juego, mínimo 72 px (las fotos de jugada son botones grandes).

## 4. Componentes (doc 04 §5.1 — inventario mínimo)

Botón principal (dorado) / secundario (fantasma plateado) / de peligro
/ de icono, enlace de texto, campo de texto, campo de contraseña
(mostrar/ocultar + fortaleza), selector, interruptor, casilla, tarjeta
(§2, degradados dorados), tarjeta de reto, avatar con inicial (círculo
dorado o plateado), insignia de estado, etiqueta DEMO (violeta, §2),
píldora de formato, marcador, fotos de jugada, barra de progreso
(dorada), modal de confirmación, aviso (toast), banner de alerta,
pantalla vacía, esqueleto de carga, paginación / «cargar más»,
pestañas, menú de usuario, barra de navegación, panel lateral de
personas en línea, indicador de conexión.

Reglas comunes (doc 04 §5.2–5.6):
- Una sola acción principal por pantalla (botón dorado); el botón
  principal tiene mínimo 160 px en escritorio y todo el ancho en móvil
  cuando es la acción principal de un formulario. Cargando: indicador
  giratorio + «Cargando…» / «Creando reto…», botón deshabilitado
  (nunca doble envío).
- Foco por teclado siempre visible (anillo de 2 px dorado, contraste 3:1).
- Formularios: etiqueta siempre visible encima del campo (el
  placeholder nunca la sustituye); el error va debajo del campo
  (color + icono + texto que dice qué está mal y cómo corregirlo);
  el envío con Intro funciona; los errores no borran lo escrito.
- Tarjetas: orden fijo título → dato principal → metadatos → acción.
  La tarjeta de reto muestra siempre creador, formato, premio DEMO
  (si lo hay), estado y tiempo desde su creación («hace 2 min»).
- Modal de confirmación: un solo propósito, título en forma de
  pregunta o acción, consecuencia en una frase, «Cancelar» (secundario,
  izquierda) y confirmación (principal dorado o de peligro, derecha).
  Foco atrapado; Escape cierra solo si no hay operación en curso.
  **Confirmación obligatoria antes de:** retirar créditos demo,
  eliminar la cuenta, cambiar el nombre de usuario, cancelar un reto
  en curso y cerrar sesión en otro dispositivo. Lista cerrada.

## 5. Navegación (doc 04 §6)

- **Móvil (< 768 px):** barra inferior fija con 4 destinos — Inicio,
  Jugar, Retos, Perfil (o «Entrar» si no hay sesión). La acción
  «Crear reto» es un botón flotante destacado (+) sobre la barra, en
  dorado.
- **Tableta (768–1.024 px):** barra superior con logo, Inicio, Jugar,
  Retos, Ranking y menú de usuario. Panel lateral de personas en línea
  a la derecha cuando hay espacio.
- **Escritorio (> 1.024 px):** barra superior con logo, navegación
  principal y menú de usuario; panel lateral de personas en línea a la
  derecha en el área de juegos.
- La página activa se marca con acento dorado + peso 600 +
  `aria-current="page"` (nunca solo con color). El botón «Atrás» del
  navegador funciona en todas las pantallas.
### 5.1 Panel lateral de personas en línea (muestra v7, APROBADA por Jhon 2026-11-10)

Referencia final de organización:
`~/workspace/your_files/el-reto-entornos-visuales/el-reto-negro-oro-v7.html`
("Sí me gusta así"). La v4 fue rechazada porque el cuadro era muy
grande y la página estaba mal organizada.

- **Columna lateral derecha, ANGOSTA y compacta: 200 px de ancho,
  filas pequeñas** (SOLO nombre y estado: punto de color + nombre +
  insignia de estado, sin avatar; tarjeta del panel con `padding:
  8px 10px`, filas con `padding: 5px 0`). La v4 usaba 300 px; la v7
  aprobada usa 200 px. La lista no roba ancho ni protagonismo al
  contenido central.
- **FIJA:** no se va cuando se mueve la pantalla; se mantiene siempre
  visible a un lado (`position: fixed; top: 12px; right: max(16px,
  calc((100vw - 1080px) / 2 + 16px)); width: 200px; z-index: 5`).
  Siempre visible en la pantalla principal y en la partida
  (escritorio, ≥ 900 px: rejilla `minmax(0, 1fr) 200px`, `gap: 28px`,
  `align-items: start`).
- **TODO el resto del contenido va en la parte central, muy bien
  distribuido y centralizado** (envoltura centrada de ancho máximo
  1.080 px, `margin: 0 auto`). Encabezado centrado arriba y, debajo,
  en la columna central: partida en vivo, ranking, formatos y
  botones, todo centrado y con buen espacio entre secciones. Solo la
  pequeña lista va a un lado; nada más ocupa la columna lateral.
- **En el teléfono:** la lista queda **FIJA ARRIBA** (`position:
  sticky; top: 0; order: -1; z-index: 5; background: #0a0a0a`, como
  en la v7), para que nunca se pierda al bajar por la página. NO es
  un cajón que se abre y se cierra ni queda escondida abajo.
- Contenido: contador de personas en línea, lista con avatar, nombre
  e insignia de estado (LIBRE, EN LÍNEA, JUGANDO, POR JUGAR, RETO
  PENDIENTE, RETO GENERADO, POR INVITAR), leyenda de símbolos y,
  aparte, la persona por invitar. Cada LIBRE con botón «Retar».

- **El enlace de invitación a un reto lleva directamente a la partida**
  (ruta `/retos/invitar/:code`), sin pasar por la página de inicio.
- **Jugar no exige cuenta:** un visitante crea o acepta un reto con
  solo un nombre temporal (sesión de invitado, ver CONTRACTS.md §9).
  El registro aparece como mejora después de la primera partida.

## 6. Animaciones (doc 04 §9)

| Animación | Dónde | Duración |
|---|---|---|
| Pulso y brillo del logo VS (cromado con rayos de neón, SIN CAMBIOS) | Portada y barra superior | Bucle suave (2 s) |
| Rayos de energía dorados detrás del logo | Capa `.energy-rays` + `animate-rays-spin` DETRÁS del logo (el logo no cambia) | Giro lento (12 s) |
| Vídeo: manos sacudiéndose | Cuenta atrás de cada ronda (`manos-sacudida.mp4`, en bucle) y espera de jugada | 2 s en bucle |
| Vídeo: revelado de la jugada | Al revelar, un clip por jugador (`revelar-piedra/papel/tijera.mp4`) | 7 s por clip |
| Vídeo: duelo con rayos y brillos | Celebración y revelado destacado (`manos-rps-rayos-brillos.mp4`) | 10 s |
| Pulso de la insignia EN VIVO | Insignia «EN VIVO» de la partida | 1,4 s, en bucle |
| Cuenta atrás «¡PIEDRA! ¡PAPEL! ¡TIJERAS!» | Inicio de cada ronda, con el vídeo de manos sacudiéndose | ~600 ms por palabra |
| Revelado simultáneo | Al revelar las jugadas | Los dos clips de revelado a la vez; el ganador con rayos y brillo |
| Confeti dorado al ganar | Victoria de ronda y de partida | 1,5 s, discreto, desactivable |
| Destellos dorados (confeti de luz) | Fondo ambiental (pocos, lentos) y victoria (densos) | Caída 7 s, parpadeo 2,4 s |
| Rayos de energía dorados | Detrás de la arena al revelar y detrás del ganador en la celebración | Giro lento (12 s), brillo dorado |
| Transición de pantalla | Cambio de pantalla | 200 ms, fundido suave |
| Aviso (toast) | Éxito / error | 200 ms de entrada; desaparece a los 5 s |
| Esqueleto de carga | Listas mientras cargan | Pulso suave |

Reglas: una animación = un significado; rápida y corta (150–300 ms
en interfaz); sin bucle salvo el pulso del logo, los rayos, los
destellos y los vídeos de manos; ninguna animación bloquea un botón
ni retrasa una acción más de 300 ms. Las animaciones de juego son
VÍDEO, nunca una foto quieta movida con CSS.
**`prefers-reduced-motion: reduce`:** se desactivan el pulso del logo,
el confeti, los rayos de energía, los destellos, las animaciones de
entrada y los vídeos de manos (se muestra la foto del gesto
revelado);
la cuenta atrás se muestra como texto estático («PIEDRA · PAPEL ·
TIJERAS»); la jugada ganadora queda marcada con borde dorado +
etiqueta «Gana la ronda». Además, en ajustes hay interruptores para
reducir animaciones y desactivar el confeti.

## 7. Estados del sistema (doc 04 §10)

- **Carga:** esqueleto con la forma del contenido real (listas,
  paneles, tarjetas); indicador giratorio + texto solo para acciones
  («Creando reto…»). Si dura más de 3 s: «Está tardando más de lo
  normal. Revisa tu conexión.» + «Reintentar». Sin pantalla en blanco.
- **Vacío:** ilustración o foto + frase + siguiente paso en botón.
  Ejemplos: sin retos → foto de manos + «No hay retos públicos
  ahora mismo.» + «Crear un reto»; sin partidas → «Aún no has jugado
  ninguna partida.» + «Jugar ahora»; sin movimientos → moneda DEMO +
  «Aún no tienes movimientos.»; sin notificaciones → campana.
  Una pantalla vacía nunca es un error (sin color de error ni culpa).
- **Error:** dice qué pasó, por qué y qué hacer ahora; nunca muestra
  códigos técnicos; el formulario conserva lo escrito. Mensajes del
  doc 04 §10.3 (sin conexión, reto que ya no existe, rival
  desconectado, nombre ya en uso, contraseña incorrecta, saldo DEMO
  insuficiente, error del servidor).
- **Éxito:** toast breve + cambio visible en la pantalla. Nunca un
  modal para un éxito rutinario.
- **Sin conexión:** indicador fijo en la partida y el área de juegos
  («Conectado», «Reconectando…», «Sin conexión»). Si se pierde la
  conexión en una partida, queda en pausa visible («Esperando
  conexión…»), nunca se declara una derrota. Al reconectar, aviso
  «Conexión recuperada».

## 8. Reglas de la billetera DEMO en la interfaz (doc 04 §11.7, §13)

- Banner permanente en la parte superior de la billetera: «Billetera
  DEMO — Los créditos son virtuales y no tienen valor real. No se
  pueden cambiar por dinero.»
- Toda cifra de créditos lleva la etiqueta «DEMO» o «créditos DEMO»
  y el color propio (`reto.demo`, violeta; ver §2 por qué no es
  dorado); nunca aparece `$` junto a un saldo DEMO sin la etiqueta.
  No hay ningún texto que sugiera convertir créditos DEMO en dinero
  real («retirar dinero», «cobrar», «pago» no se aplican a créditos DEMO).
- Depósito y retiro muestran antes de confirmar: cantidad, saldo
  actual y saldo resultante. El retiro exige modal de confirmación.
- Saldo cero no es un error: «Tienes 0 créditos DEMO. Consigue
  créditos con un depósito demo.» + botón «Depositar (demo)».
- La página de inicio lleva el aviso visible y permanente: «Los
  créditos son virtuales (DEMO), sin valor real. Aquí no se juega
  con dinero real.»

## 9. Pantallas del MVP (doc 04 §11 — contenido y orden)

Todas con el entorno negro y oro de §1–§2 (fondo con `fondo.jpg`,
tarjetas oscuras con borde dorado, titulares en `.gold-text`,
botones dorados, fotos reales).

- **Inicio (`/`):** barra superior (logo VS dorado animado + «El Reto»,
  «Entrar» o avatar), titular «Reta a quien quieras. Gana en
  segundos.» (en dorado), subtítulo en una frase, foto del trofeo
  (`trofeo.jpg`) como imagen principal con borde dorado, acción
  principal «Jugar ahora» (dorada), secundaria «Ver retos públicos»
  (fantasma plateada), las tres fotos de jugada con su nombre, «Cómo
  funciona» en 3 pasos, hasta 3 retos públicos en vivo, aviso DEMO
  permanente, pie con centro de ayuda y nota de versión demo.
- **Registro (`/registro`):** «Crea tu cuenta»; nombre de usuario
  (comprobación en vivo de disponibilidad) + ayuda; correo;
  contraseña con mostrar/ocultar + fortaleza; repetir contraseña;
  casilla de condiciones y privacidad; «Crear cuenta» (dorado);
  enlace a inicio de sesión. (Gmail como login social es posterior
  al MVP en código OAuth; ver CONTRACTS.md §9.2 y DECISIONS.md.)
- **Inicio de sesión (`/login`):** correo o nombre de usuario;
  contraseña; «¿Olvidaste tu contraseña?»; «Mantener la sesión»;
  «Entrar» (dorado); enlace a registro. Error genérico (sin decir
  qué falla). Con un enlace de reto pendiente, vuelve a ese reto,
  no al inicio.
- **Recuperación (`/recuperar`):** 3 pasos (solicitar → enlace con
  caducidad visible → nueva contraseña). Mensaje neutro (nunca
  confirma si un correo existe). Enlace de un solo uso; al cambiar la
  contraseña se cierran las demás sesiones.
- **Panel (`/panel`):** «Hola, [nombre]» + insignia de estado;
  tarjeta de saldo DEMO con «Depositar (demo)» / «Retirar (demo)» /
  «Ver historial»; retos activos; últimas 3 partidas; accesos rápidos
  (crear reto, ver retos, ranking, ayuda); vacío con «Aún no tienes
  partidas. Crea tu primer reto.»
- **Perfil (`/perfil`):** avatar con inicial (círculo dorado) + nombre
  + «Jugando desde [mes año]»; estadísticas (partidas, victorias,
  derrotas, empates, racha actual, mejor racha, nivel); datos
  editables (nombre visible con confirmación, correo); «Guardar
  cambios» (solo si hay cambios); enlaces a seguridad y a eliminar
  cuenta (con confirmación).
- **Billetera (`/billetera`):** banner DEMO, saldo grande con
  etiqueta DEMO violeta, botones depositar/retirar (demo), resumen
  del mes, últimos 5 movimientos + «Ver todo el historial».
- **Historial de movimientos (`/billetera/historial`):** lista
  cronológica (fecha, tipo con icono, descripción, importe con signo
  + etiqueta DEMO, saldo resultante); filtros por tipo y periodo;
  paginación «Cargar más» con contador «Mostrando X de Y».
- **Área de juegos (`/juegos`) y partida en vivo (`/partidas/:id`):**
  barra de partida («Salir» con confirmación si está en curso,
  píldora de formato, «Ronda 2 de 3»); marcador (avatar dorado /
  plateado + nombre, victorias, estado); zona del rival (vídeo de
  manos sacudiéndose mientras espera, estado «Jugada sellada» con
  candado cuando ya eligió, sin mostrar cuál); zona propia (las tres
  FOTOS de jugada como botones grandes, mínimo 72 px, con su nombre
  debajo — SOLO para elegir; la elegida queda «Tu jugada está
  sellada»); al revelar, un clip de vídeo por jugador
  (`revelar-*.mp4`, 7 s) con rayos dorados detrás del ganador; cuenta
  atrás dorada con el vídeo de manos sacudiéndose;
  resultado de la ronda («¡Tijera corta papel! Ganas la ronda.»);
  indicador de conexión siempre visible; al final: resultado
  («¡Ganaste 2 a 1!»), foto del trofeo, confeti dorado, rayos de
  energía dorados detrás del ganador y brillo en la arena,
  «Revancha» y «Volver a retos». Si un jugador tarda: «Esperando a tu rival…». Ayuda en una
  frase: «Ninguno ve la jugada del otro hasta que los dos han elegido.»
- **Crear reto (`/retos/crear`):** «Tu nombre» (si no hay sesión);
  formato como 4 tarjetas seleccionables (1 ronda / mejor de 3 /
  mejor de 5 / libre, con una frase cada una; la seleccionada con
  fondo dorado); visibilidad (público / privado); premio DEMO
  opcional (por defecto 0, «El premio sale de tu saldo DEMO.»);
  resumen; «Crear reto y compartir» (dorado); tras crear: pantalla
  de espera con enlace de invitación, «Copiar enlace» y «Compartir
  por WhatsApp», estado «Esperando rival…» y «Cancelar reto» (con
  confirmación).
- **Retos disponibles (`/retos`) + personas en línea:** tarjetas con
  creador, formato (píldora), premio DEMO, «hace 2 min», estado y
  «Aceptar reto»; filtros por formato y por premio; panel lateral de
  personas en línea (contador, lista con avatar/nombre/insignia,
  leyenda, persona por invitar aparte; cada LIBRE con botón «Retar»).
- **Historial de partidas (`/partidas`):** fecha, rival, juego,
  formato, resultado (texto + icono + color), marcador final, premio
  DEMO; filtros por resultado, juego y periodo; detalle por rondas.
- **Notificaciones (`/notificaciones`):** campana con contador de no
  leídas; tipos «Te retaron», «Tu reto fue aceptado», «Tu rival está
  esperando», «Ganaste una partida», «Recibiste créditos DEMO», «Tu
  reto fue cancelado»; cada una lleva a su destino; «Marcar todas
  como leídas».
- **Centro de ayuda (`/ayuda`):** buscador «¿En qué te ayudamos?»;
  temas en tarjetas (empezar, retos y partidas, créditos DEMO, cuenta
  y nombre, conexión, seguridad); preguntas frecuentes con respuestas
  de máximo 3 frases; artículo con pasos numerados y «¿Te sirvió?
  Sí / No».
- **Configuración de seguridad (`/configuracion/seguridad`):**
  cambiar contraseña; sesiones activas con «Cerrar sesión» en cada
  una salvo la actual; interruptor de avisos de inicio de sesión en
  dispositivo nuevo; interruptores «Reducir animaciones» y
  «Desactivar confeti»; privacidad (quién puede retarte, perfil
  visible en el ranking); zona de peligro «Eliminar cuenta» con
  confirmación en dos pasos.
- **Ranking (`/ranking`):** tabla de posiciones con medallas
  oro/plata/bronce (1.º dorado, 2.º plateado, 3.º bronce), victorias,
  rachas y mejor racha, nivel (doc 04 D8: tabla como mínimo;
  insignias y niveles después).
- **Admin (`/admin`):** pantalla sobria (menos dorado, más aire), con
  el mismo sistema de componentes.

## 10. Accesibilidad (objetivo WCAG 2.2 AA, doc 04 §8)

- Contraste: texto normal 4,5:1; texto grande 3:1; texto principal
  objetivo 7:1; componentes 3:1; etiqueta DEMO y estados 4,5:1.
  (El dorado `#f5c542` sobre negro `#050505` supera 4,5:1 en texto
  grande; el texto crema `#f5f0e1` sobre negro supera 7:1. El texto
  oscuro `#1a1206` sobre botón dorado supera 7:1.)
- Todo alcanzable por teclado, en orden lógico; foco siempre visible
  (anillo dorado 2 px, 3:1); sin trampas de teclado. En el juego, las
  teclas 1/2/3 eligen piedra/papel/tijera y se anuncia en la pantalla.
- Un único H1 por pantalla; iconos sin texto con `aria-label` en
  español; las fotos de jugada llevan `alt` («Mano real: piedra»,
  etc.); cambios en vivo con `aria-live="polite"` (resultado final
  `assertive` breve); marcador y estado anunciados como texto
  («Ronda 2 de 3. Vas ganando 1 a 0.»); errores asociados a su campo
  (`aria-describedby`) y foco al primer campo con error.
- Victoria/derrota/empate y estados de presencia: texto + icono +
  color, nunca solo color. Enlaces subrayados, no solo de color.
- Texto ampliable al 200% sin perder contenido ni desplazamiento
  horizontal. Sin desplazamiento horizontal en ningún ancho. Tablas
  → tarjetas apiladas en móvil, con los mismos datos y orden.
- **No se declara conformidad formal WCAG** (exige auditoría
  documentada que aún no existe); el objetivo es el criterio de
  aceptación de cada pantalla.
