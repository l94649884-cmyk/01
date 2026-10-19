# 参与力构 Lab

欢迎通过 GitHub Issues 报告问题，通过 Pull Request 提交改进。

## 开发与验证

1. Fork 仓库，从 `main` 新建功能分支。
2. 按 [README](README.md) 安装依赖并启动前后端。
3. 修改求解器时，附上可独立核算的结构算例、支座反力和内力期望值；修改编辑交互时，添加对应回归测试。
4. Windows 下执行 `powershell -ExecutionPolicy Bypass -File .\Test.ps1`，检查后端测试、前端单元测试、生产构建和浏览器测试。
5. 提交 PR，说明触发条件、修改后的行为和实际完成的验证。

浏览器测试在 8000 和 5173 端口运行。测试使用独立浏览器上下文；提交前请确认这些端口提供的是当前代码对应的服务。

macOS / Linux 可依次执行：

```bash
.venv/bin/python -m pytest backend
cd frontend
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

## 问题报告

请附上复现步骤、浏览器版本、预期结果和实际结果。力学问题尽量附上软件导出的最小 JSON 模型，以及手算或参考解。不要上传个人数据、密钥或无关文件。

## 开源范围

本仓库中的原创前端、后端、测试、示例、脚本和文档使用 [MIT License](LICENSE)。外部依赖仍遵循各自许可证。安装环境、缓存、运行日志与本地草稿不属于发布内容；软件不需要 API 密钥即可运行和求解。
