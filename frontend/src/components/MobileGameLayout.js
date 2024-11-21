import React from 'react';
import MobileJoystick from './MobileJoystick';
import ChatMobile from './ChatMobile';

const MobileGameLayout = ({ 
  children, 
  chat, 
  playerInfo, 
  scoreBoard, 
  onDirectionChange,
  teams,
  onChatSend,
  chatMessages 
}) => {
  return (
    <div className="relative w-full h-full">
      {/* Meta tag para viewport móvil */}
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      
      {/* Contenedor principal del juego */}
      <div className="w-full h-full">
        {children}
      </div>

      {/* Scoreboard más compacto para móvil */}
      <div className="absolute top-2 left-0 right-0 flex justify-center">
        <div className="bg-black bg-opacity-60 rounded-lg p-2">
          {scoreBoard}
        </div>
      </div>

      {/* Info del jugador en formato compacto */}
      <div className="absolute top-16 left-2 right-2">
        <div className="bg-black bg-opacity-60 rounded-lg p-2 text-xs text-white">
          {playerInfo}
        </div>
      </div>

      {/* Joystick virtual */}
      <MobileJoystick onDirectionChange={onDirectionChange} />

      {/* Chat móvil */}
      <ChatMobile 
        messages={chatMessages}
        onSend={onChatSend}
        teams={teams}
      />

      {/* Botón minimizar chat */}
      <button 
        className="fixed top-2 right-2 bg-black bg-opacity-60 text-white text-xs p-2 rounded-lg"
        onClick={() => setChatVisible(!chatVisible)}
      >
        Chat
      </button>
    </div>
  );
};

export default MobileGameLayout;