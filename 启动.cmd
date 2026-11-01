@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo 首次运行，正在安装依赖，请稍候...
  call npm install
)
echo 正在启动 AtomPDF...
start "AtomPDF 服务" /min cmd /c "npm run dev"
timeout /t 7 /nobreak >nul
start "" http://127.0.0.1:5174
echo 已在浏览器打开 http://127.0.0.1:5174
echo 关闭「AtomPDF 服务」窗口即可停止服务。
