#!/bin/bash

echo "开始部署..."

# 检查并安装 Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js 未安装，正在安装..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# 检查并安装 PM2
if ! command -v pm2 &> /dev/null; then
    echo "PM2 未安装，正在安装..."
    sudo npm install -g pm2
fi

# 检查并安装 pnpm
if ! command -v pnpm &> /dev/null; then
    echo "pnpm 未安装，正在安装..."
    sudo npm install -g pnpm
fi

# 安装项目依赖
echo "安装项目依赖..."
pnpm install

# 构建项目
echo "构建项目..."
pnpm build

# 使用 PM2 启动项目
echo "启动项目..."
pm2 start ecosystem.config.js --env production

# 保存 PM2 进程列表
echo "保存 PM2 进程列表..."
pm2 save

# 设置开机自启
echo "设置开机自启..."
pm2 startup

echo "部署完成！"
echo "可以使用 'pm2 status' 查看应用状态"
echo "使用 'pm2 logs' 查看应用日志" 