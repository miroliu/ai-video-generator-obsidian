# 故障排除指南

## 错误：ENOENT: no such file or directory, open 'sora2/main.js'

这个错误表明 Obsidian 在寻找一个名为 `sora2` 的插件，但我们的插件 ID 是 `ai-video-generator-obsidian`。

### 解决方案：

#### 1. 完全清理 Obsidian 缓存

```bash
# 关闭 Obsidian
# 删除以下目录（如果存在）：
# [您的库]/.obsidian/plugins/sora2/
# [您的库]/.obsidian/plugins/obsidian-video-generator/
# [您的库]/.obsidian/plugins/ai-video-generator-obsidian/
```

#### 2. 重新构建插件

```bash
npm run build
```

#### 3. 正确安装插件

将以下文件复制到：

```
[您的库]/.obsidian/plugins/ai-video-generator-obsidian/
├── main.js
├── manifest.json
└── styles.css
```

#### 4. 重启 Obsidian

-   完全关闭 Obsidian
-   重新启动
-   在设置中启用 "AI Video Generator" 插件

### 如果问题仍然存在：

#### 检查 Obsidian 日志

1. 打开 Obsidian 设置
2. 进入 "关于" 页面
3. 点击 "打开开发者工具"
4. 查看控制台错误信息

#### 手动清理步骤

1. 关闭 Obsidian
2. 删除 `.obsidian/plugins/` 目录下的所有相关插件文件夹
3. 删除 `.obsidian/workspace.json` 文件（这会重置工作区）
4. 重新启动 Obsidian
5. 重新安装插件

#### 验证插件文件

确保以下文件存在且内容正确：

-   `main.js` - 应该包含编译后的代码
-   `manifest.json` - 应该包含正确的插件 ID
-   `styles.css` - 应该包含样式定义

### 常见问题：

**Q: 插件没有出现在插件列表中**
A: 检查 `manifest.json` 文件是否正确，确保插件目录名称与 manifest.json 中的 id 匹配

**Q: 启用插件时出现错误**
A: 检查 `main.js` 文件是否存在且可读，确保没有语法错误

**Q: 插件界面不显示**
A: 检查 `styles.css` 文件是否存在，确保样式正确加载

### 开发模式调试：

```bash
npm run dev
```

这会启动开发模式，自动监听文件变化并重新构建。
