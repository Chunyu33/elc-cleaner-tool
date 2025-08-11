import React from 'react';
// 当前使用了React v19, ant需要引入兼容包
import '@ant-design/v5-patch-for-react-19';
import { ConfigProvider } from 'antd';
import TitleBar from './components/TitleBar/TitleBar';
import Main from './components/Main/Main';

// 定义antd自定义主题
const customTheme = {
  token: {
    colorPrimary: '#4caf50', // 主色
    colorSuccess: '#52c41a', // 成功色
    colorWarning: '#faad14', // 警告色
    colorError: '#f5222d',   // 错误色
    colorInfo: '#1890ff',     // 信息色
    borderRadius: 4,         // 圆角大小
    colorBgContainer: '#ffffff', // 容器背景色
  },
};

export default function App() {
  return (
    <ConfigProvider theme={customTheme}>
      <div className="app-container">
        <TitleBar />
        <div className="main-content">
          <Main />
        </div>
      </div>
    </ConfigProvider>
  );
}
