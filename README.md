# Animal Soccer Game

A real-time multiplayer soccer game where two teams of anthropomorphic animals compete in an exciting match. Players can choose between Mammals (blue team) or Reptiles (red team) and select different animal characters with unique characteristics.

![Game Screenshot](screenshot.png)

## Features

- **Real-time Multiplayer**: Play with friends in fast-paced matches
- **Team-based Gameplay**: Choose between two teams:
  - Mammals (Blue Team): Human and Pig characters
  - Reptiles (Red Team): Turtle and Lizard characters
- **Physics-based Ball Control**: Realistic ball physics with control mechanics
- **In-game Chat**: Communicate with other players during matches
- **Responsive Design**: Supports both desktop and mobile devices
- **Internationalization**: Multi-language support
- **Score Tracking**: First team to score 3 goals wins

## Technologies Used

- **Frontend**:
  - React
  - Babylon.js for 3D graphics
  - Socket.IO client for real-time communication
  - CSS for styling

- **Backend**:
  - Node.js
  - Express
  - Socket.IO for WebSocket handling
  - Custom physics engine

## Controls

### Desktop
- Movement: WASD or Arrow Keys
- Ball Control: Spacebar (hold to control, release to shoot)
- Chat: Enter to open chat, Enter to send message

### Mobile
- Movement: Virtual joystick
- Ball Control: Dedicated button
- Chat: Touch chat icon to expand/collapse

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Modern web browser with WebGL support

### Installation

1. Clone the repository:
```bash
git clone https://github.com/PitiGo/frontend_futball_3d_online.git
cd frontend_futball_3d_online
```

2. Install dependencies for both client and server:
```bash
# Install server dependencies
npm install

# Install client dependencies
cd client
npm install
```

3. Start the development server:
```bash
# Start the game server
npm run server

# In a separate terminal, start the client
npm run client
```

4. Open your browser and navigate to `http://localhost:3000`

## Gameplay

1. Enter your name to join
2. Select your team (Mammals or Reptiles)
3. Choose your character
4. Click "Ready" when you're prepared to play
5. The game starts when all players are ready
6. First team to score 3 goals wins!

## Game Mechanics

- Players can control the ball by holding the control button
- Ball control is limited to 3 seconds
- Physics-based collisions and momentum transfer
- Team coordination is key to victory
- Strategic positioning and passing are essential

## Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## Support

For support, please open an issue in the GitHub repository.
