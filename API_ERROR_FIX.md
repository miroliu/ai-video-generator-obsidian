# API 错误处理修复

## 🐛 问题描述

用户遇到以下错误：

```
Unexpected API response format: {code: -1, data: null, msg: 'insufficient credits'}
Video generation error: Error: 未获取到任务ID。API响应: {"code":-1,"data":null,"msg":"insufficient credits"}
```

## 🔍 问题分析

1. **API 业务错误未处理**：代码只检查 HTTP 状态码，没有处理 API 返回的业务错误码
2. **错误信息不友好**：直接显示原始 API 响应，用户难以理解
3. **缺少错误分类**：没有针对不同错误类型提供相应的解决建议

## ✅ 修复方案

### 1. 添加 API 业务错误检查

在 `generateVideo` 和 `getVideoResult` 方法中添加业务错误检查：

```typescript
// 检查API业务错误
if (data && typeof data === "object") {
	// 检查是否有错误码
	if (data.code !== undefined && data.code !== 0 && data.code !== 200) {
		const errorMsg = data.msg || data.message || "未知错误";
		throw new Error(`API错误 (${data.code}): ${errorMsg}`);
	}

	// 检查是否有错误信息
	if (data.error) {
		throw new Error(`API错误: ${data.error}`);
	}
}
```

### 2. 统一错误处理

添加 `handleApiError` 方法，提供用户友好的错误信息：

```typescript
handleApiError(error: any): string {
    const errorMessage = error.message || error.toString();

    // 余额不足
    if (errorMessage.includes('insufficient credits') || errorMessage.includes('余额不足')) {
        return '账户余额不足，请充值后重试';
    }

    // API密钥相关错误
    if (errorMessage.includes('API密钥') || errorMessage.includes('unauthorized') || errorMessage.includes('401')) {
        return 'API密钥配置错误，请检查设置中的API密钥是否正确';
    }

    // 其他错误处理...
}
```

### 3. 更新错误处理调用

在所有相关方法中使用统一的错误处理：

```typescript
} catch (error) {
    console.error('Video generation error:', error);
    const friendlyMessage = this.handleApiError(error);
    new Notice(`生成失败: ${friendlyMessage}`);
}
```

## 🎯 修复效果

### 修复前

-   显示原始 API 响应：`{code: -1, data: null, msg: 'insufficient credits'}`
-   用户无法理解错误含义
-   没有解决建议

### 修复后

-   显示友好提示：`账户余额不足，请充值后重试`
-   针对不同错误类型提供具体建议
-   帮助用户快速定位和解决问题

## 📋 支持的错误类型

| 错误类型      | 检测关键词                         | 友好提示                                          |
| ------------- | ---------------------------------- | ------------------------------------------------- |
| 余额不足      | `insufficient credits`, `余额不足` | 账户余额不足，请充值后重试                        |
| API 密钥错误  | `API密钥`, `unauthorized`, `401`   | API 密钥配置错误，请检查设置中的 API 密钥是否正确 |
| API 主机错误  | `API主机`, `host`, `404`           | API 主机配置错误，请检查设置中的 API 主机地址     |
| 网络错误      | `HTTP error`, `network`, `timeout` | 网络连接错误，请检查网络连接或稍后重试            |
| 其他 API 错误 | `API错误`                          | 显示具体错误信息                                  |

## 🔧 技术实现

### 错误检查逻辑

1. **HTTP 状态码检查**：处理网络层面的错误
2. **API 业务码检查**：处理业务逻辑错误
3. **错误信息提取**：从 API 响应中提取具体错误信息

### 错误分类处理

1. **余额相关**：提示用户充值
2. **配置相关**：提示用户检查设置
3. **网络相关**：提示用户检查网络
4. **其他错误**：显示具体错误信息

### 用户体验优化

1. **友好提示**：将技术错误转换为用户可理解的语言
2. **解决建议**：针对不同错误提供相应的解决步骤
3. **错误日志**：保留详细错误信息用于调试

## 🚀 使用说明

修复后，当遇到 API 错误时：

1. **余额不足**：用户会看到"账户余额不足，请充值后重试"
2. **配置错误**：用户会看到具体的配置问题提示
3. **网络问题**：用户会看到网络连接相关的提示
4. **其他错误**：用户会看到具体的错误信息

## 📝 注意事项

1. **向后兼容**：保持原有错误处理逻辑的兼容性
2. **错误日志**：控制台仍会显示详细的错误信息用于调试
3. **扩展性**：可以轻松添加新的错误类型处理
4. **国际化**：错误提示使用中文，便于用户理解

---

**修复状态**：✅ 已完成
**测试状态**：⏳ 待测试
**优先级**：🔴 高
