# 未然 · 高校学生画像与预警平台

原生微信小程序 + 辅导员网页空框架，使用六名学生的本地 Mock 数据。

- **学生端**：用微信开发者工具导入仓库根目录，选择自己的测试号 AppID；编译后点击“本地模拟登录”即可体验。
- **辅导员端**：用浏览器打开 `weiran/counselor-web/index.html`，目前保留登录与五个业务页面的空框架。
- **运行说明与演示账号**：[项目说明](weiran/README.md)。
- **修复与验证情况**：[验收记录](weiran/docs/修复与验收记录.md)。
- **后续功能规划**：[学生成长支持与效果评估](weiran/docs/第4部分-功能拓展与计算方案.md)。

在仓库根目录运行回归测试（Node.js 18 或更新版本，无需安装第三方依赖）：

```text
node --test weiran/tests/mvp.test.cjs
```

Mock 数据唯一维护源为 `weiran/miniprogram/utils/mock.js`。修改后执行 `node weiran/scripts/export-mock.cjs` 同步 JSON。

当前微信登录体验只映射模拟学生，辅导员推送记录保存在本地，尚未接入正式身份绑定与跨端服务。备份压缩包及开发者工具本机配置不纳入版本管理。
