// Puntos de Asistencia y Paradas en Ruta para el Simulador
const SIM_WAYPOINTS = [
  {
    id: 1,
    name: "Estación YPF 'El Desierto' - Km 64",
    distance: 12.0,
    biome: "desierto",
    roadCondition: "Asfalto seco con polvo",
    description: "Un surtidor solitario en la inmensidad. El viento patagónico silba en el casco. Puedes repostar nafta prémium, medir presión de neumáticos y limpiar la visera.",
    actions: [
      {
        text: "Cargar tanque lleno de nafta (18 Litros)",
        cost: 25,
        effect: (sim) => {
          sim.fuelLiters = 18.0;
          return "Tanque de combustible completado a 18 litros.";
        }
      },
      {
        text: "Calibrar presión de neumáticos a 32 PSI",
        cost: 5,
        effect: (sim) => {
          sim.tirePressure = 32.0;
          sim.handlingBonus = 1.0;
          return "Neumáticos inflados a 32 PSI. Agarre óptimo para la ruta.";
        }
      },
      {
        text: "Dejar enfriar el motor y tomar un café",
        cost: 8,
        effect: (sim) => {
          sim.engineTemp = 75.0;
          return "Temperatura de motor normalizada a 75°C. Listo para la siguiente etapa.";
        }
      },
      {
        text: "Volver a la ruta y arrancar marcha",
        cost: 0,
        isNext: true
      }
    ]
  },
  {
    id: 2,
    name: "Cuesta de Montaña 'El Caracol' - Km 140",
    distance: 16.0,
    biome: "montaña",
    roadCondition: "Curvas cerradas y pendientes",
    description: "Zona de curvas peligrosas de alta montaña. El motor trabaja forzado en 2ª y 3ª marcha. En la cima hay un taller de montaña con vista a las sierras.",
    actions: [
      {
        text: "Comprar bidón auxiliar de 5 Litros",
        cost: 20,
        effect: (sim) => {
          sim.fuelLiters = Math.min(18, sim.fuelLiters + 5);
          return "Agregaste 5 litros de reserva al tanque.";
        }
      },
      {
        text: "Revisar pastillas de freno y tensión de cadena",
        cost: 35,
        effect: (sim) => {
          sim.bikeHealth = 100;
          return "Mecánico revisó frenos y cadena. Seguridad al 100%.";
        }
      },
      {
        text: "Continuar el descenso hacia el valle",
        cost: 0,
        isNext: true
      }
    ]
  },
  {
    id: 3,
    name: "Paso de Bosque Húmedo - Km 210",
    distance: 14.0,
    biome: "bosque",
    roadCondition: "Pavimento mojado / llovizna",
    description: "El clima cambia de golpe: llovizna sobre el parabrisas y olor a tierra mojada. El asfalto resbala más, exige marchas intermedias y suavidad al doblar.",
    actions: [
      {
        text: "Parar en el parador de troncos a secarse y descansar",
        cost: 15,
        effect: (sim) => {
          sim.engineTemp = 70.0;
          return "Descanso reconfortante. El clima mejora ligeramente.";
        }
      },
      {
        text: "Llenar combustible para el último tramo",
        cost: 22,
        effect: (sim) => {
          sim.fuelLiters = 18.0;
          return "Tanque al máximo para llegar a destino.";
        }
      },
      {
        text: "Enfilar hacia la costa oceánica",
        cost: 0,
        isNext: true
      }
    ]
  },
  {
    id: 4,
    name: "Bahía del Faro del Fin del Mundo",
    distance: 18.0,
    biome: "costa",
    roadCondition: "Ruta costera con brisa marina",
    description: "¡Has completado la travesía! El rugido del mar acompaña el ralentí de tu moto. El odómetro marca cientos de kilómetros superados con precisión de piloto.",
    actions: [
      {
        text: "Apagar el motor y contemplar el mar",
        cost: 0,
        effect: (sim) => {
          sim.isVictory = true;
          return "¡Objetivo cumplido! Has dominado el simulador de ruta en moto.";
        }
      }
    ]
  }
];

window.WaypointSystem = {
  waypoints: SIM_WAYPOINTS,
  currentIndex: 0,

  getCurrent() {
    return this.waypoints[this.currentIndex];
  },

  advance() {
    if (this.currentIndex < this.waypoints.length - 1) {
      this.currentIndex++;
      return this.waypoints[this.currentIndex];
    }
    return null;
  }
};
