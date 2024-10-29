import React from 'react';

const LoadingScreen = () => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex flex-col items-center justify-center z-50">
      <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
      <h2 className="text-white text-2xl font-bold">Loading Game...</h2>
      <p className="text-gray-400 mt-2">Please wait while the game resources are being loaded</p>
    </div>
  );
};

export default LoadingScreen;