import React, { useState } from 'react';

const ChatMobile = ({ messages, onSend, teams }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onSend(inputValue);
      setInputValue('');
    }
  };

  return (
    <div className="fixed bottom-40 right-2 w-64 z-50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full bg-black bg-opacity-60 text-white text-xs py-2 px-3 rounded-t-lg text-left flex justify-between items-center"
      >
        Chat {isExpanded ? '▼' : '▲'}
      </button>
      
      {isExpanded && (
        <div className="bg-black bg-opacity-60 rounded-b-lg">
          <div className="h-32 overflow-y-auto p-2">
            {messages.map((msg, index) => (
              <div key={index} className="text-xs mb-1">
                <span className={`font-bold ${
                  teams.left.find(p => p.id === msg.playerId) 
                    ? 'text-blue-400'
                    : teams.right.find(p => p.id === msg.playerId)
                    ? 'text-red-400'
                    : 'text-green-400'
                }`}>
                  {msg.playerName}:
                </span>{' '}
                <span className="text-white">{msg.message}</span>
              </div>
            ))}
          </div>
          
          <form onSubmit={handleSubmit} className="p-2 border-t border-white border-opacity-10">
            <div className="flex gap-1">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="flex-1 bg-white bg-opacity-5 text-white text-xs p-2 rounded"
                placeholder="Mensaje..."
              />
              <button
                type="submit"
                className="bg-green-500 text-white text-xs px-3 rounded"
              >
                →
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default ChatMobile;