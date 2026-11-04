# MotoTravel PRO: Simulador de Viajes en Moto 🏍️💨

Un **simulador realista en primera persona** de viajes y travesías en motocicleta de media/alta cilindrada (Trail 650cc). 

Diseñado con física de transmisión manual por marchas, cálculo de RPM del motor en tiempo real, temperatura de refrigeración, aceleración gradual, inclinación giroscópica de curva y navegación GPS en ruta.

---

## 🕹️ Mandos de Simulación

| Tecla | Función en la Moto |
|---|---|
| <kbd>W</kbd> o <kbd>⬆️</kbd> | Acelerador gradual (entrega de potencia según marcha) |
| <kbd>S</kbd> o <kbd>⬇️</kbd> | Freno combinado (freno delantero + trasero) |
| <kbd>A</kbd> / <kbd>D</kbd> o <kbd>⬅️</kbd> / <kbd>➡️</kbd> | Manillar e inclinación (*counter-steering*) |
| <kbd>E</kbd> | **Subir marcha** (1ª ➔ 2ª ➔ 3ª ➔ 4ª ➔ 5ª ➔ 6ª) |
| <kbd>Q</kbd> | **Bajar marcha** (6ª ➔ 5ª ... ➔ 1ª ➔ Neutro) |
| <kbd>L</kbd> | Encender / apagar haz de luces delanteras |
| <kbd>H</kbd> | Tocar bocina |

---

## ⚙️ Características del Simulador

1. **Cockpit en Primera Persona:**
   - Tablero digital con indicador de marcha activa (`N, 1, 2, 3, 4, 5, 6`).
   - Tacómetro digital de RPM con zona roja (*redline* a partir de 8.500 RPM).
   - Velocímetro digital en km/h.
   - Manillar, puños de goma, manetas de embrague y freno, y espejos retrovisores.
2. **Dinámica de Motor Realista:**
   - Si aceleras en una marcha alta a baja velocidad, el motor se ahoga (*bog down*).
   - Freno motor al soltar el acelerador o reducir de marcha.
   - Temperatura del motor: sube con altas revoluciones y baja con el viento de la marcha.
   - Gestión de litros reales de nafta y presión de neumáticos (PSI).
3. **Navegación GPS y Paradas de Ruta:**
   - Puntos de servicio YPF, talleres de alta montaña y refugios.
   - Decisiones mecánicas: calibrar PSI, repostar nafta prémium, dejar enfriar el motor o revisar frenos.
4. **Audio Procedural del Motor:**
   - Sonido modulado en tiempo real según RPM exactas, silbido del viento por aerodinámica y chirrido de neumáticos al frenar bruscamente.

---

## 🚀 Cómo Jugar

Abre en tu navegador:
👉 **[http://localhost:3000](http://localhost:3000)**
o ejecuta `node server.js` en la consola.
