# 调试指南 - 右键菜单功能

## 🐛 问题描述

错误信息：`Video generation error: Error: 未获取到任务ID`

## 🔍 问题分析

这个错误表明 API 调用成功，但返回的响应格式与预期不符。可能的原因：

1. **API 响应格式不同**：API 可能返回 `task_id` 而不是 `id`
2. **API 响应结构变化**：API 可能改变了响应结构
3. **网络或认证问题**：API 调用可能失败但没有抛出异常

## 🛠️ 修复措施

### 1. 增强错误处理

-   添加了详细的调试日志
-   支持多种 API 响应格式（`id` 和 `task_id`）
-   提供更详细的错误信息

### 2. 调试步骤

#### 步骤 1：检查控制台日志

1. 打开浏览器开发者工具（F12）
2. 切换到 Console 标签
3. 选中文本并右键选择"🎬 使用 Sora 生成视频"
4. 查看控制台输出的日志信息

#### 步骤 2：查看 API 响应

控制台会显示：

-   `Raw API response:` - 原始 API 响应
-   `API Response:` - 处理后的响应
-   `Unexpected API response format:` - 如果格式不匹配

#### 步骤 3：分析响应格式

根据控制台输出，检查 API 返回的数据结构：

**期望格式 1：**

```json
{
	"id": "task_123456",
	"status": "running",
	"progress": 0
}
```

**期望格式 2：**

```json
{
	"task_id": "task_123456",
	"status": "running",
	"progress": 0
}
```

**错误格式示例：**

```json
{
	"error": "Invalid API key",
	"message": "Authentication failed"
}
```

## 🔧 常见问题解决

### 问题 1：API 密钥错误

**症状**：返回 401 或 403 错误
**解决**：检查设置中的 API 密钥是否正确

### 问题 2：API 主机地址错误

**症状**：网络错误或 404 错误
**解决**：检查设置中的 API 主机地址

### 问题 3：请求参数错误

**症状**：返回 400 错误
**解决**：检查请求参数格式

### 问题 4：响应格式不匹配

**症状**：显示"未获取到任务 ID"
**解决**：根据控制台日志调整代码

## 📋 调试清单

-   [ ] 检查 API 密钥配置
-   [ ] 检查 API 主机地址配置
-   [ ] 查看控制台日志
-   [ ] 分析 API 响应格式
-   [ ] 检查网络连接
-   [ ] 验证请求参数

## 🚨 紧急修复

如果问题持续存在，可以尝试以下临时解决方案：

### 方案 1：手动检查 API 响应

```typescript
// 在 generateVideoFromSelection 方法中添加
console.log("Full response object:", JSON.stringify(response, null, 2));
```

### 方案 2：添加更多兼容性

```typescript
// 支持更多可能的响应格式
const taskId =
	response.id || response.task_id || response.taskId || response.request_id;
if (taskId) {
	await this.pollAndDownloadVideo(taskId, selection, editor);
} else {
	throw new Error(`未获取到任务ID。API响应: ${JSON.stringify(response)}`);
}
```

## 📞 获取帮助

如果问题仍然存在，请提供以下信息：

1. **控制台日志**：完整的错误日志
2. **API 响应**：`Raw API response` 的输出
3. **配置信息**：API 密钥和主机地址（隐藏敏感信息）
4. **网络状态**：是否能正常访问 API

## 🔄 测试步骤

1. **重新加载插件**：重启 Obsidian 或重新加载插件
2. **清除缓存**：清除浏览器缓存
3. **测试 API**：使用其他工具测试 API 连接
4. **逐步调试**：从简单的 API 调用开始

---

**修复状态**：✅ 已应用
**测试状态**：⏳ 待测试
**优先级**：🔴 高
