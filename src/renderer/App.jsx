import React from 'react';
import TitleBar from './components/TitleBar/TitleBar';
import Main from './components/Main/Main';

export default function App() {
  return (
    <div className="app-container">
      <TitleBar />
      <div className="main-content">
        <Main />
      </div>
    </div>
  );
}
