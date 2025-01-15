// Objeto con todas las traducciones del juego
const translations = {
  en: {
    // Login Screen
    login: {
      title: "Join the game",
      namePlaceholder: "Enter your name",
      playButton: "Play",
      errors: {
        nameLength: "Name must be at least 2 characters long",
        maxLength: "Name cannot be longer than 15 characters"
      }
    },

    // Loading Screen
    loading: {
      title: "Mammals vs Reptiles",
      loading: "Loading Game...",
      preparingResources: "Preparing game resources. Please wait...",
      tips: [
        "💡 Use WASD or arrow keys to move",
        "⚽ Hit the ball to score goals",
        "🤝 Cooperate with your team to win",
        "🎯 Aim your shots at the goal"
      ]
    },

    // Team Selection Screen
    teamSelection: {
      selectTeam: "Select your Team",
      selectCharacter: "Select your Character",
      prepareToPlay: "Get ready to play",
      mammals: "Mammals",
      reptiles: "Reptiles",
      team: "Team",
      noPlayers: "No players",
      you: "You",
      gameInProgress: "Game in Progress",
      gameInProgressMessage: "Sorry, there's a game in progress at the moment. Please try joining later when the current match is finished.",
      tryAgain: "Try Again",
      joinMammals: "Join Mammals",
      joinReptiles: "Join Reptiles",
      yourCharacter: "Your Character",


      // Characters
      characters: {
        rabbit: {
          name: "Rabbit",
          description: "Balanced player"
        },
        pig: {
          name: "Pig",
          description: "Rock old glory"
        },
        turtle: {
          name: "Turtle",
          description: "Balanced player"
        },
        lizard: {
          name: "Lizard",
          description: "Strong and resistant"
        }
      },

      // Ready states
      ready: "READY",
      cancel: "CANCEL",
      waitingPlayers: "⌛ Waiting for all players to be ready...",
      selectTeamContinue: "👈 Select a team to continue",
      selectCharacterPrompt: "👆 Select a character for",
      pressReady: "✨ Press READY when you're ready!"
    },

    // Game UI
    gameUI: {
      connected: "Connected",
      disconnected: "Disconnected",
      controls: "Controls",
      moveInstructions: "Use WASD or ↑←↓→ to move",
      ballControlInstructions: "SPACE to control the ball (max 3s). Release SPACE to shoot",
      chatPlaceholder: "Write a message...",
      goal: "GOAL!",
      mammalTeam: "MAMMAL TEAM!",
      reptileTeam: "REPTILE TEAM!",
      victory: "VICTORY!",
      finalScore: "FINAL SCORE",
      unknown: "Unknown",
      players: "Players" ,
      mobileMovementInstructions: "Use joystick to move" ,
      mobileChatInstructions: "Tap chat to write" ,
      chatExpanded: "Chat ▼",
      writeMessage: "Write a message...",
      enterToSend: "Press Enter to send messages",
    }
  },

  es: {
    // Pantalla de inicio de sesión
    login: {
      title: "Unirse al juego",
      namePlaceholder: "Ingresa tu nombre",
      playButton: "Jugar",
      errors: {
        nameLength: "El nombre debe tener al menos 2 caracteres",
        maxLength: "El nombre no puede tener más de 15 caracteres"
      }
    },

    // Pantalla de carga
    loading: {
      title: "Mamíferos vs Reptiles",
      loading: "Cargando el Juego...",
      preparingResources: "Preparando los recursos del juego. Por favor, espera un momento...",
      tips: [
        "💡 Usa las teclas WASD o las flechas para moverte",
        "⚽ Golpea la pelota para hacer goles",
        "🤝 Coopera con tu equipo para ganar",
        "🎯 Apunta bien tus tiros a la portería"
      ]
    },

    // Pantalla de selección de equipo
    teamSelection: {
      selectTeam: "Selecciona tu Equipo",
      selectCharacter: "Selecciona tu Personaje",
      prepareToPlay: "Prepárate para jugar",
      mammals: "Mamíferos",
      reptiles: "Reptiles",
      team: "Equipo",
      noPlayers: "Sin jugadores",
      you: "Tú",
      gameInProgress: "Partida en Curso",
      gameInProgressMessage: "Lo sentimos, hay una partida en curso en este momento. Por favor, intenta unirte más tarde cuando la partida actual haya terminado.",
      tryAgain: "Volver a Intentar",
      joinMammals: "Unirse a Mamíferos",
      joinReptiles: "Unirse a Reptiles",
      yourCharacter: "Tu personaje",

      // Personajes
      characters: {
        rabbit: {
          name: "Conejo",
          description: "Jugador equilibrado"
        },
        pig: {
          name: "Cerdo",
          description: "Vieja gloria del Rock"
        },
        turtle: {
          name: "Tortuga",
          description: "Jugador equilibrado"
        },
        lizard: {
          name: "Lagarto",
          description: "Fuerte y resistente"
        }
      },

      // Estados de preparación
      ready: "COMENZAR",
      cancel: "CANCELAR",
      waitingPlayers: "⌛ Esperando a que todos los jugadores estén listos...",
      selectTeamContinue: "👈 Selecciona un equipo para continuar",
      selectCharacterPrompt: "👆 Selecciona un personaje para el",
      pressReady: "✨ ¡Pulsa COMENZAR cuando estés listo!"
    },

    // Interfaz del juego
    gameUI: {
      connected: "Conectado",
      disconnected: "Desconectado",
      controls: "Controles",
      moveInstructions: "Usa WASD o ↑←↓→ para moverte",
      ballControlInstructions: "ESPACIO para controlar el balón (máx 3s). Suelta ESPACIO para disparar",
      chatPlaceholder: "Escribe un mensaje...",
      goal: "¡GOL!",
      mammalTeam: "¡EQUIPO MAMÍFEROS!",
      reptileTeam: "¡EQUIPO REPTILES!",
      victory: "¡VICTORIA!",
      finalScore: "RESULTADO FINAL",
      unknown:  "Desconocido",
      players: "Jugadores",
      mobileMovementInstructions: "Usa el joystick para moverte",
      mobileChatInstructions: "Toca el chat para escribir",
      chatExpanded: "Chat ▼",
      writeMessage: "Escribe un mensaje...",
      enterToSend: "Presiona Enter para enviar mensajes",
    }
  }
};

export default translations;