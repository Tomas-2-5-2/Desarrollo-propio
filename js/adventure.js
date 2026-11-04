// Sistema Narrativo y Paradas de Aventura
const ADVENTURE_LOCATIONS = [
  {
    id: 1,
    name: "Estación 'El Solitario'",
    distance: 10,
    biome: "desierto",
    icon: "⛽",
    title: "Estación en medio de la estepa",
    description: "Una solitaria estación de servicio en medio del viento y la arena. El surtidor de nafta cruje con el viento y un perro dormita bajo el alero.",
    choices: [
      {
        text: "Cargar tanque completo de nafta",
        cost: 30,
        effect: (state) => {
          state.fuel = 100;
          return "Llenaste el tanque de combustible. ¡Listo para seguir!";
        }
      },
      {
        text: "Pedirle al mecánico que ajuste la cadena y frenos",
        cost: 40,
        effect: (state) => {
          state.health = Math.min(100, state.health + 30);
          return "El mecánico ajustó y lubricó la moto. Rueda mucho más suave.";
        }
      },
      {
        text: "Conversar con el camionero en el café",
        cost: 0,
        effect: (state) => {
          return "El camionero te advierte: 'Cuidado con el tramo que sigue, hay muchas piedras sueltas en la calzada'.";
        }
      },
      {
        text: "Volver a la ruta y continuar el viaje",
        cost: 0,
        isNext: true
      }
    ]
  },
  {
    id: 2,
    name: "Paso de las Altas Cumbres",
    distance: 14,
    biome: "montaña",
    icon: "🏔️",
    title: "Mirador de las Sierras",
    description: "El aire se vuelve frío y puro. Llegaste a lo más alto de la cuesta de montaña. La vista panorámica del valle quita el aliento. Hay un puesto de artesanos locales y un mirador.",
    choices: [
      {
        text: "Comprar un bidón de reserva de nafta y un café caliente",
        cost: 35,
        effect: (state) => {
          state.fuel = Math.min(100, state.fuel + 40);
          return "El café te revivió las manos y el bidón te dará tranquilidad.";
        }
      },
      {
        text: "Ayudar a otro motociclista varado",
        cost: 0,
        effect: (state) => {
          state.money += 25;
          return "Le prestaste una llave de bujías. Agradecido, te dio $25 para los peajes.";
        }
      },
      {
        text: "Revisar la moto por el esfuerzo de subida",
        cost: 20,
        effect: (state) => {
          state.health = Math.min(100, state.health + 25);
          return "Apretaste unos tornillos flojos por las vibraciones del ripio.";
        }
      },
      {
        text: "Comenzar el descenso hacia el valle",
        cost: 0,
        isNext: true
      }
    ]
  },
  {
    id: 3,
    name: "Camping Río Claro",
    distance: 12,
    biome: "bosque",
    icon: "🏕️",
    title: "Atardecer bajo los pinos",
    description: "Un sendero arbolado te lleva a la orilla de un río cristalino. El cielo se tiñe de violeta y naranja. Varios viajeros han armado carpas y hay un fogón encendido.",
    choices: [
      {
        text: "Armar campamento y descansar toda la noche",
        cost: 15,
        effect: (state) => {
          state.health = 100;
          return "Dormiste profundamente con el sonido del río. ¡Descanso total!";
        }
      },
      {
        text: "Compartir historias y comida junto al fogón",
        cost: 10,
        effect: (state) => {
          return "Un viajero veterano te comparte un atajo que te ahorrará desgaste en la próxima etapa.";
        }
      },
      {
        text: "Comprar provisiones y nafta suelta en el almacén de campo",
        cost: 40,
        effect: (state) => {
          state.fuel = 100;
          return "Tanque lleno y provisiones listas.";
        }
      },
      {
        text: "Cargar las alforjas y partir al amanecer",
        cost: 0,
        isNext: true
      }
    ]
  },
  {
    id: 4,
    name: "Ciudad Costera del Faro",
    distance: 15,
    biome: "costa",
    icon: "🌊",
    title: "¡El océano en el horizonte!",
    description: "Sientes el olor a salitre y brisa marina en el rostro. Finalmente superaste cientos de kilómetros de ruta. El faro ilumina la bahía. ¡Completaste la gran travesía en moto!",
    choices: [
      {
        text: "¡Festejar la llegada frente al mar!",
        cost: 0,
        effect: (state) => {
          state.isVictory = true;
          return "¡Misión cumplida! Has demostrado el temple de un verdadero motociclista aventurero.";
        }
      }
    ]
  }
];

window.AdventureSystem = {
  locations: ADVENTURE_LOCATIONS,
  currentLocationIndex: 0,

  getCurrentTarget() {
    return this.locations[this.currentLocationIndex] || null;
  },

  advanceLocation() {
    if (this.currentLocationIndex < this.locations.length - 1) {
      this.currentLocationIndex++;
      return this.locations[this.currentLocationIndex];
    }
    return null;
  }
};
