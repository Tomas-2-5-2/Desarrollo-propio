# Ruta Abierta: Aventura en Moto 🏍️💨

Un videojuego de aventura y viajes en motocicleta en dos ruedas hacia lo desconocido. Explora rutas cambiantes, gestiona combustible y dinero, repara tu moto en talleres de paso y toma decisiones narrativas en cada estación del camino.

---

## 🌟 Características

- **Conducción en Ruta Dinámica:** Control de velocidad, frenada y maniobra inclinando la moto con física suave.
- **Biomas Cambiantes:** Desiertos áridos, pasos de alta montaña, caminos boscosos y costas marítimas.
- **Mecánicas de Aventura y Supervivencia:**
  - Gestión de **Combustible (Nafta)**: No te quedes sin nafta en medio de la estepa.
  - Estado y durabilidad de la **Moto**: Esquiva baches y piedras en la calzada para no destrozar la suspensión.
  - **Dinero**: Para repostar, descansar en campings o pagarle a mecánicos en la ruta.
- **Paradas de Aventura y Diálogos:** Encuentros con otros viajeros, camioneros y mecánicos locales con múltiples decisiones.
- **Efectos de Sonido Procedurales:** Motor, bocina y choques generados en tiempo real mediante la Web Audio API (sin descargas externas).

---

## 🎮 Controles

| Tecla | Acción |
|---|---|
| `⬆️` o `W` | Acelerar moto |
| `⬇️` o `S` | Frenar |
| `⬅️` / `➡️` o `A` / `D` | Girar e inclinar moto |
| `Espacio` o `H` | Tocar bocina |

---

## 🚀 Cómo Jugar

No requiere compilación ni dependencias pesadas:
1. Simplemente haz doble clic en `index.html` para abrirlo en cualquier navegador web moderno (Chrome, Edge, Firefox, Brave).
2. O bien, levanta un servidor local:
   ```bash
   npx serve .
   ```

---

## 📁 Estructura del Proyecto

```
desarrollo-propio/
├── index.html         # Estructura del juego, HUD y modales
├── style.css          # Estilos visuales y diseño responsive
├── js/
│   ├── audio.js       # Sintetizador de audio con Web Audio API
│   ├── adventure.js   # Sistema narrativo, paradas y decisiones
│   └── game.js        # Motor de juego, física y render en Canvas
├── .gitignore         # Archivos temporales ignorados
└── README.md          # Documentación del proyecto
```
