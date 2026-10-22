# Windows 独立桌面窗口

基于 pywebview / Edge WebView2，复用现有前端和 FastAPI 求解器。PyInstaller 打包 Python、NumPy、SciPy 及前端生产文件；目标电脑无需 Python、Node.js 或手动启动服务。

桌面版固定使用 127.0.0.1:18764 和 `%LOCALAPPDATA%\LigouLab\WebView` 保存草稿；关闭窗口停止服务，二次启动激活已有窗口。端口被其他程序占用时明确报错，不连接未知服务。

## 源码构建

在项目根目录运行（先完成前端 `npm ci` 和 `npm run build`）：

```powershell
python -m venv .desktop-venv
.desktop-venv\Scripts\python.exe -m pip install -r desktop\requirements.txt
.desktop-venv\Scripts\python.exe desktop\build.py
```

产物在 `desktop/dist/LigouLab/`。完整复制该目录即可，入口为 `LigouLab.exe`。`_internal` 不能删除。系统需具备 Windows 10 / 11 x64 与 WebView2 Runtime。

开发启动：`.desktop-venv\Scripts\python.exe desktop\launcher.py`。

## 打包后验收

```powershell
desktop\dist\LigouLab\LigouLab.exe --self-test desktop\self-test-local\first.json
desktop\dist\LigouLab\LigouLab.exe --self-test desktop\self-test-local\second.json
```

每次启动均使用独立测试资料目录和 18765 端口。测试在真实 WebView 内执行 JSON 导入、三组标准梁算例和画布渲染，并直接检查打包求解器反力与弯矩。第二次报告还必须有 `draft_restored_after_restart: true`，验证关闭重启后的草稿保存。退出后确认测试端口已释放。

构建不修改网页版或求解算法。参考：[pywebview API](https://pywebview.flowrl.com/api/)、[PyInstaller 使用说明](https://www.pyinstaller.org/en/stable/usage.html)。

## 可携带压缩包

完成构建与两次桌面验收后，运行 `.desktop-venv\Scripts\python.exe desktop\package.py`。
产物为 `desktop/releases/LigouLab-Windows-x64.zip`，附 SHA-256 校验文件；打包过程检查 ZIP 完整性。
将 ZIP **全部解压**后双击 `LigouLab/LigouLab.exe`，不要直接在压缩包内运行或单独拷贝 EXE。
这是便携文件夹版本，不是安装向导；不修改注册表或申请管理员权限。

桌面验收还检查新版连续折杆入口、实时坐标面板，以及实际生成并求解 32 段抛物线拱。
