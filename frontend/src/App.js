import React from 'react';
import Game from './components/Game';
import { LanguageProvider } from './i18n/LanguageContext';
import { BrowserRouter as Router } from 'react-router-dom';

function App() {
  return (
    <div className="App">
      <Router>
        <LanguageProvider>
          <Game />
        </LanguageProvider>
      </Router>
    </div>
  );
}

export default App;