import React from 'react';
import Game from './components/Game';
import { LanguageProvider } from './i18n/LanguageContext';  // Actualizar esta ruta

function App() {
  return (
    <div className="App">
      <LanguageProvider>
        <Game />
      </LanguageProvider>
    </div>
  );
}

export default App;