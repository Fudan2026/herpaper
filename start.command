#!/bin/zsh
# 双击启动 PaperDesk 本地服务，并自动打开浏览器
cd "$(dirname "$0")" || exit 1
PORT=${1:-8765}
echo "PaperDesk 正在启动： http://127.0.0.1:$PORT"
echo "关闭此窗口或按 Ctrl+C 即可停止服务。"
( sleep 1; open "http://127.0.0.1:$PORT" ) &
python3 serve.py "$PORT"
