import React from 'react';
// 当前使用了React v19, ant需要引入兼容包
import '@ant-design/v5-patch-for-react-19';
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
