import React from 'react';
import { Menu, Dropdown, Button, Space } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import './TitleBar.css';

// 菜单配置
const menuConfig = [
  {
    title: '文件',
    items: [
      { label: '退出', action: () => window.api.exitApp() }
    ]
  },
  {
    title: '帮助',
    items: [
      { label: 'B站主页', action: () => window.api.openLink('https://space.bilibili.com/387797235') }
    ]
  }
];

// 动态生成 Menu
const buildMenu = (items) => (
  <Menu>
    {items.map((item, index) => (
      <Menu.Item key={index} onClick={item.action}>
        {item.label}
      </Menu.Item>
    ))}
  </Menu>
);

export default function TitleBar() {
  return (
    <div className="title-bar">
      {/* 左侧 Ant Design 下拉菜单 */}
      <div className="title-bar-left">
        <Space wrap>
          {menuConfig.map((menu, idx) => (
            <Dropdown arrow={false} key={idx} overlay={buildMenu(menu.items)} trigger={['hover']}>
              <Button type="text" style={{ color: 'white' }}>
                {menu.title}
              </Button>
            </Dropdown>
          ))}
        </Space>
      </div>

      {/* 中间标题 */}
      <div className="title-bar-center">CyCleaner</div>

      {/* 右侧窗口按钮 */}
      <div className="title-bar-right">
        <button onClick={() => window.api.minimize()}>—</button>
        <button onClick={() => window.api.maximize()}>⬜</button>
        <button onClick={() => window.api.close()}> × </button>
      </div>
    </div>
  );
}
