# 插件安装指南

## 手动安装步骤

### 1. 构建插件

在项目根目录运行：

```bash
npm run build
```

### 2. 复制文件到 Obsidian 插件目录

将以下文件复制到您的 Obsidian 插件目录：

-   `main.js`
-   `manifest.json`
-   `styles.css`

目标目录应该是：

```
您的Obsidian库/.obsidian/plugins/ai-video-generator-obsidian/
```

### 3. 在 Obsidian 中启用插件

1. 打开 Obsidian 设置
2. 进入 "第三方插件" 页面
3. 找到 "AI Video Generator" 插件
4. 点击启用

### 4. 配置插件

1. 在设置中找到 "AI Video Generator"
2. 输入您的 API 密钥
3. 选择服务器地址
4. 配置其他参数

## 故障排除

### 如果出现 "ENOENT" 错误

1. 确保所有文件都复制到了正确的目录
2. 检查文件权限
3. 重新启动 Obsidian
4. 清除 Obsidian 缓存

### 如果插件没有出现在列表中

1. 检查 `manifest.json` 文件是否正确
2. 确保插件目录名称与 manifest.json 中的 id 匹配
3. 重新加载 Obsidian

### 开发模式

如果您在开发插件，可以使用：

```bash
npm run dev
```

这会自动监听文件变化并重新构建。
