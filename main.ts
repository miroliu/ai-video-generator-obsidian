import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, ItemView, WorkspaceLeaf } from 'obsidian';

// API主机配置接口
interface ApiHostConfig {
	id: string;
	name: string;
	url: string;
	enabled: boolean;
	description?: string;
}

// AI模型配置接口
interface ModelConfig {
	id: string;
	name: string;
	value: string;
	enabled: boolean;
	description?: string;
	isCustom: boolean;
}

// 插件设置接口
interface VideoGeneratorSettings {
	// API 配置
	apiKey: string;
	apiHost: string;
	apiHosts: ApiHostConfig[];
	selectedApiHost: string;
	
	// 视频生成默认参数
	defaultAspectRatio: string;
	defaultDuration: number;
	defaultSize: string;
	defaultModel: string;
	
	// 高级配置
	useWebhook: boolean;
	webhookUrl: string;
	pollingInterval: number;
	maxPollingAttempts: number;
	
	// UI 配置
	showRibbonIcon: boolean;
	showStatusBar: boolean;
	modalWidth: string;
	modalHeight: string;
	
	// 视频质量选项
	availableAspectRatios: string[];
	availableDurations: number[];
	availableSizes: string[];
	availableModels: string[];
	
	// AI模型管理
	modelConfigs: ModelConfig[];
}

// 默认设置
const DEFAULT_SETTINGS: VideoGeneratorSettings = {
	// API 配置
	apiKey: '',
	apiHost: 'https://grsai.dakka.com.cn',
	apiHosts: [
		{
			id: 'default',
			name: '国内直连',
			url: 'https://grsai.dakka.com.cn',
			enabled: true,
			description: '国内服务器，访问速度快'
		},
		{
			id: 'overseas',
			name: '海外服务器',
			url: 'https://api.grsai.com',
			enabled: true,
			description: '海外服务器，稳定性好'
		}
	],
	selectedApiHost: 'default',
	
	// 视频生成默认参数
	defaultAspectRatio: '16:9',
	defaultDuration: 10,
	defaultSize: 'small',
	defaultModel: 'sora-2',
	
	// 高级配置
	useWebhook: false,
	webhookUrl: '',
	pollingInterval: 2000,
	maxPollingAttempts: 150,
	
	// UI 配置
	showRibbonIcon: true,
	showStatusBar: true,
	modalWidth: '600px',
	modalHeight: 'auto',
	
	// 视频质量选项
	availableAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
	availableDurations: [5, 10, 15, 30, 60],
	availableSizes: ['small', 'medium', 'large'],
	availableModels: ['sora-2', 'sora-1.5', 'runway-gen3'],
	
	// AI模型管理
	modelConfigs: [
		{
			id: 'sora-2',
			name: 'Sora 2.0',
			value: 'sora-2',
			enabled: true,
			description: 'OpenAI最新视频生成模型',
			isCustom: false
		},
		{
			id: 'sora-1.5',
			name: 'Sora 1.5',
			value: 'sora-1.5',
			enabled: true,
			description: 'OpenAI视频生成模型',
			isCustom: false
		},
		{
			id: 'runway-gen3',
			name: 'Runway Gen-3',
			value: 'runway-gen3',
			enabled: true,
			description: 'Runway公司视频生成模型',
			isCustom: false
		}
	]
}

// API响应接口
interface VideoGenerationResponse {
	id: string;
	results?: Array<{ url: string }>;
	progress?: number;
	status?: 'running' | 'succeeded' | 'failed' | 'completed' | 'success' | 'error';
	state?: string;
	task_status?: string;
	failure_reason?: string;
	error?: string;
	message?: string;
	video_url?: string;
	url?: string;
	data?: {
		url?: string;
		[key: string]: any;
	};
	[key: string]: any; // 允许其他字段
}

// 视频生成请求接口
interface VideoGenerationRequest {
	model: string;
	prompt: string;
	url?: string;
	aspectRatio?: string;
	duration?: number;
	size?: string;
	imageUrl?: string;
	webHook?: string;
	shutProgress?: boolean;
}

export default class VideoGeneratorPlugin extends Plugin {
	settings: VideoGeneratorSettings;

	async onload() {
		await this.loadSettings();

		// 注册侧边栏视图
		this.registerView('video-generator-view', (leaf) => new VideoGeneratorView(leaf, this));

		// 添加左侧功能区图标（如果启用）
		if (this.settings.showRibbonIcon) {
			const ribbonIconEl = this.addRibbonIcon('video', 'AI Video Generator', (evt: MouseEvent) => {
				this.openVideoGeneratorSidebar();
			});
			ribbonIconEl.addClass('video-generator-ribbon-class');
		}

		// 添加状态栏项目（如果启用）
		if (this.settings.showStatusBar) {
		const statusBarItemEl = this.addStatusBarItem();
			statusBarItemEl.setText('AI Video Generator');
		}

		// 添加命令
		this.addCommand({
			id: 'open-video-generator',
			name: 'Generate AI Video',
			callback: () => {
				this.openVideoGeneratorSidebar();
			}
		});

		// 添加编辑器命令
		this.addCommand({
			id: 'generate-video-from-selection',
			name: 'Generate video from selected text',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const selection = editor.getSelection();
				if (selection.trim()) {
					this.openVideoGeneratorSidebar(selection);
				} else {
					new Notice('请先选择要生成视频的文本');
				}
			}
		});

		// 添加右键菜单
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor, view) => {
				const selection = editor.getSelection();
				if (selection.trim()) {
					menu.addItem((item) => {
						item
							.setTitle('🎬 使用Sora生成视频')
							.setIcon('video')
							.onClick(async () => {
								await this.generateVideoFromSelection(selection, editor);
							});
					});
				}
			})
		);

		// 添加设置页面
		this.addSettingTab(new VideoGeneratorSettingTab(this.app, this));
	}

	// 打开视频生成侧边栏
	async openVideoGeneratorSidebar(initialPrompt: string = '') {
		const existingLeaf = this.app.workspace.getLeavesOfType('video-generator-view')[0];
		
		if (existingLeaf) {
			// 如果侧边栏已经存在，激活它
			this.app.workspace.revealLeaf(existingLeaf);
			// 更新初始提示词
			const view = existingLeaf.view as VideoGeneratorView;
			view.initialPrompt = initialPrompt;
			// 重新打开以更新内容
			await view.onOpen();
		} else {
			// 创建新的侧边栏
			const leaf = this.app.workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: 'video-generator-view', active: true });
				const view = leaf.view as VideoGeneratorView;
				view.initialPrompt = initialPrompt;
				await view.onOpen();
			}
		}
	}

	// 从选中文本生成视频并下载
	async generateVideoFromSelection(selection: string, editor: Editor) {
		// 检查API密钥
		if (!this.settings.apiKey) {
			new Notice('请先在设置中配置API密钥');
			return;
		}

		// 显示生成开始通知
		new Notice('开始生成视频，请稍候...');

		try {
			// 构建请求参数
			const request: VideoGenerationRequest = {
				model: this.settings.defaultModel,
				prompt: selection.trim(),
				aspectRatio: this.settings.defaultAspectRatio,
				duration: this.settings.defaultDuration,
				size: this.settings.defaultSize,
				shutProgress: false
			};

		// 调用API生成视频
		const response = await this.generateVideo(request);
		
		// 添加调试信息
		console.log('API Response:', response);
		
		// 检查响应格式并提取任务ID
		let taskId: string | null = null;
		
		if (response && typeof response === 'object') {
			const resp = response as any;
			
			// 检查标准格式: {id: "..."}
			if (resp.id) {
				taskId = resp.id;
			}
			// 检查嵌套格式: {data: {id: "..."}}
			else if (resp.data && resp.data.id) {
				taskId = resp.data.id;
			}
			// 检查其他可能的格式
			else if (resp.task_id) {
				taskId = resp.task_id;
			}
			// 检查data.task_id格式
			else if (resp.data && resp.data.task_id) {
				taskId = resp.data.task_id;
			}
			// 检查data.taskId格式
			else if (resp.data && resp.data.taskId) {
				taskId = resp.data.taskId;
			}
			
			// 添加更详细的调试信息
			console.log('Command API Response structure:', {
				hasId: !!resp.id,
				hasData: !!resp.data,
				dataId: resp.data?.id,
				dataTaskId: resp.data?.taskId,
				dataTask_id: resp.data?.task_id,
				fullResponse: resp
			});
		}
		
		if (taskId) {
			// 开始轮询结果
			await this.pollAndDownloadVideo(taskId, selection, editor);
		} else {
			// 提供更详细的错误信息
			console.error('Unexpected API response format:', response);
			
			// 尝试从data中提取更多信息
			const resp = response as any;
			let errorDetails = '';
			
			if (resp.data) {
				errorDetails = `\nData内容: ${JSON.stringify(resp.data)}`;
			}
			if (resp.msg) {
				errorDetails += `\n消息: ${resp.msg}`;
			}
			if (resp.code !== undefined) {
				errorDetails += `\n代码: ${resp.code}`;
			}
			
			throw new Error(`未获取到任务ID。API响应: ${JSON.stringify(response)}${errorDetails}`);
		}

		} catch (error) {
			console.error('Video generation error:', error);
			const friendlyMessage = this.handleApiError(error);
			new Notice(`生成失败: ${friendlyMessage}`);
		}
	}

	// 轮询视频生成结果并下载
	async pollAndDownloadVideo(id: string, originalText: string, editor: Editor) {
		let pollCount = 0;
		const maxAttempts = this.settings.maxPollingAttempts;
		
		const pollInterval = setInterval(async () => {
			pollCount++;
			
			// 检查是否超过最大尝试次数
			if (pollCount > maxAttempts) {
				clearInterval(pollInterval);
				new Notice('轮询超时，请稍后手动检查结果');
				return;
			}

			try {
				const result = await this.getVideoResult(id);
				
				// 添加调试日志
				console.log('Video generation result (context menu):', result);
				
				// 更新进度通知
				const progress = result.progress || 0;
				new Notice(`生成进度: ${progress}% (${pollCount}/${maxAttempts})`);

				// 检查生成状态 - 支持多种状态字段
				const status = result.status || result.state || result.task_status;
				console.log('Video generation status (context menu):', status, 'progress:', progress);
				
				if (status === 'succeeded' || status === 'completed' || status === 'success' || progress === 100) {
					clearInterval(pollInterval);
					await this.handleVideoSuccess(result, originalText, editor);
					new Notice('视频生成成功！');
				} else if (status === 'failed' || status === 'error') {
					clearInterval(pollInterval);
					const errorMsg = result.failure_reason || result.error || result.message || '未知错误';
					new Notice(`生成失败: ${errorMsg}`);
				}
			} catch (error) {
				console.error('Polling error:', error);
				clearInterval(pollInterval);
				const friendlyMessage = this.handleApiError(error);
				new Notice(`获取结果失败: ${friendlyMessage}`);
			}
		}, this.settings.pollingInterval);
	}

	// 处理视频生成成功
	async handleVideoSuccess(result: VideoGenerationResponse, originalText: string, editor: Editor) {
		// 支持多种API响应结构
		let videoUrl = null;
		
		// 尝试从不同字段获取视频URL
		if (result.results && result.results.length > 0) {
			videoUrl = result.results[0].url;
		} else if (result.video_url) {
			videoUrl = result.video_url;
		} else if (result.url) {
			videoUrl = result.url;
		} else if (result.data && result.data.url) {
			videoUrl = result.data.url;
		}

		if (videoUrl) {
			// 下载视频到本地
			const localPath = await this.downloadVideo(videoUrl, originalText);
			
			// 只使用文件名，不包含路径
			const fileName = localPath.split('/').pop() || localPath;
			// 使用 Obsidian 标准的视频引用格式 ![[filename.mp4]]
			const videoMarkdown = `\n\n![[${fileName}]]\n\n`;
			editor.replaceSelection(videoMarkdown);
			
			new Notice('视频已下载并插入到笔记中');
		} else {
			// 如果没有找到视频URL，显示调试信息
			console.error('未找到视频URL，API响应结构:', result);
			new Notice('视频生成成功，但未找到视频URL，请检查API响应结构');
		}
	}

	// 下载视频到本地
	async downloadVideo(videoUrl: string, originalText: string): Promise<string> {
		try {
			// 获取当前活动文件
			const activeFile = this.app.workspace.getActiveFile();
			if (!activeFile) {
				throw new Error('没有找到当前活动文件');
			}
			
			// 获取当前文件的目录路径
			const currentDir = activeFile.parent?.path || '';
			
			// 生成文件名（基于原始文本的前20个字符）
			const fileName = `sora-video-${originalText.substring(0, 20).replace(/[^\w\s]/gi, '').replace(/\s+/g, '-')}-${Date.now()}.mp4`;
			
			// 在当前文件同级目录创建 aivideo 文件夹
			const aivideoFolder = currentDir ? `${currentDir}/aivideo` : 'aivideo';
			const folderPath = `${aivideoFolder}/${fileName}`;
			
			// 检查文件夹是否存在，如果不存在则创建
			const folderExists = await this.app.vault.adapter.exists(aivideoFolder);
			if (!folderExists) {
				await this.app.vault.createFolder(aivideoFolder);
			}
			
			// 下载视频文件
			const response = await fetch(videoUrl);
			if (!response.ok) {
				throw new Error(`下载失败: ${response.status} ${response.statusText}`);
			}
			
			const arrayBuffer = await response.arrayBuffer();
			
			// 保存到 aivideo 文件夹
			await this.app.vault.adapter.writeBinary(folderPath, arrayBuffer);
			
			new Notice(`视频已下载到: ${folderPath}`);
			return folderPath;
		} catch (error) {
			console.error('Download error:', error);
			new Notice('视频下载失败，但链接已插入到笔记中');
			throw error;
		}
	}

	onunload() {
		// 清理资源
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// 获取当前选中的API主机
	getCurrentApiHost(): string {
		// console.log('Getting API host, settings:', {
		// 	selectedApiHost: this.settings.selectedApiHost,
		// 	apiHosts: this.settings.apiHosts,
		// 	apiHost: this.settings.apiHost
		// });
		
		const selectedHost = this.settings.apiHosts.find(host => host.id === this.settings.selectedApiHost);
		// console.log('Selected host:', selectedHost);
		
		if (selectedHost && selectedHost.enabled) {
			// console.log('Using selected host:', selectedHost.url);
			return selectedHost.url;
		}
		
		// 回退到默认设置
		// console.log('Using fallback host:', this.settings.apiHost);
		if (!this.settings.apiHost) {
			throw new Error('API主机地址未配置');
		}
		return this.settings.apiHost;
	}

	// 处理API错误，提供用户友好的错误信息
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
		
		// API主机相关错误
		if (errorMessage.includes('API主机') || errorMessage.includes('host') || errorMessage.includes('404')) {
			return 'API主机配置错误，请检查设置中的API主机地址';
		}
		
		// 网络连接错误
		if (errorMessage.includes('HTTP error') || errorMessage.includes('network') || errorMessage.includes('timeout')) {
			return '网络连接错误，请检查网络连接或稍后重试';
		}
		
		// API业务错误
		if (errorMessage.includes('API错误')) {
			// 提取具体的错误信息，去掉"API错误: "前缀
			return errorMessage.replace('API错误: ', '').replace('API错误 (', '').replace(/\): /, ': ');
		}
		
		// 其他错误
		return errorMessage;
	}

	// API调用方法
	async generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
		// 验证API配置
		if (!this.settings.apiKey) {
			throw new Error('API密钥未配置，请在设置中配置API密钥');
		}

		const currentHost = this.getCurrentApiHost();
		if (!currentHost) {
			throw new Error('API主机地址未配置');
		}

		const url = `${currentHost}/v1/video/sora-video`;
		console.log('Making API request to:', url);
		
		const headers = {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${this.settings.apiKey}`
		};

		// 设置默认模型
		if (!request.model) {
			request.model = this.settings.defaultModel;
		}

		// 处理图片URL - 如果imageUrl存在，将其映射到url字段
		if (request.imageUrl && request.imageUrl.trim()) {
			request.url = request.imageUrl.trim();
		}
		// 清理undefined字段
		if (request.imageUrl === undefined) {
			delete request.imageUrl;
		}

		// 如果使用webhook，设置webhook参数
		if (this.settings.useWebhook && this.settings.webhookUrl) {
			request.webHook = this.settings.webhookUrl;
		} else {
			request.webHook = '-1'; // 使用轮询方式
		}

		// 清理请求对象，移除undefined字段
		const cleanRequest = Object.fromEntries(
			Object.entries(request).filter(([_, value]) => value !== undefined)
		);
		
		console.log('Sending request:', cleanRequest);

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: headers,
				body: JSON.stringify(cleanRequest)
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
			}

			const data = await response.json();
			console.log('Raw API response:', data);
			
			// 检查API业务错误
			if (data && typeof data === 'object') {
				// 检查是否有错误码
				if (data.code !== undefined && data.code !== 0 && data.code !== 200) {
					const errorMsg = data.msg || data.message || '未知错误';
					throw new Error(`API错误 (${data.code}): ${errorMsg}`);
				}
				
				// 检查是否有错误信息
				if (data.error) {
					throw new Error(`API错误: ${data.error}`);
				}
			}
			
			return data;
		} catch (error) {
			console.error('Video generation error:', error);
			throw error;
		}
	}

	// 获取视频生成结果
	async getVideoResult(id: string): Promise<VideoGenerationResponse> {
		const currentHost = this.getCurrentApiHost();
		if (!currentHost) {
			throw new Error('API主机地址未配置');
		}
		
		const url = `${currentHost}/v1/draw/result`;
		// console.log('Making result request to:', url, 'with id:', id);
		
		const headers = {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${this.settings.apiKey}`
		};

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: headers,
				body: JSON.stringify({ id })
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
			}

			const data = await response.json();
			
			// 检查API业务错误
			if (data && typeof data === 'object') {
				// 检查是否有错误码
				if (data.code !== undefined && data.code !== 0 && data.code !== 200) {
					const errorMsg = data.msg || data.message || '未知错误';
					throw new Error(`API错误 (${data.code}): ${errorMsg}`);
				}
				
				// 检查是否有错误信息
				if (data.error) {
					throw new Error(`API错误: ${data.error}`);
				}
			}
			
			return data.data || data;
		} catch (error) {
			console.error('Get video result error:', error);
			throw error;
		}
	}
}

// 视频生成模态框
class VideoGeneratorModal extends Modal {
	plugin: VideoGeneratorPlugin;
	initialPrompt: string;

	constructor(app: App, plugin: VideoGeneratorPlugin, initialPrompt: string = '') {
		super(app);
		this.plugin = plugin;
		this.initialPrompt = initialPrompt;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// 设置模态框样式 - 自适应屏幕大小
		const screenWidth = window.innerWidth;
		const screenHeight = window.innerHeight;
		
		// 根据屏幕大小动态调整模态框尺寸
		let modalWidth = '600px';
		let modalHeight = 'auto';
		
		if (screenWidth <= 768) {
			// 手机屏幕
			modalWidth = '95vw';
			modalHeight = '90vh';
		} else if (screenWidth <= 1024) {
			// 平板屏幕
			modalWidth = '85vw';
			modalHeight = '85vh';
		} else if (screenWidth <= 1440) {
			// 小桌面屏幕
			modalWidth = '75vw';
			modalHeight = '80vh';
		} else {
			// 大桌面屏幕
			modalWidth = '65vw';
			modalHeight = '75vh';
		}
		
		// 应用用户自定义设置（如果设置了的话）
		if (this.plugin.settings.modalWidth && this.plugin.settings.modalWidth !== '600px') {
			modalWidth = this.plugin.settings.modalWidth;
		}
		if (this.plugin.settings.modalHeight && this.plugin.settings.modalHeight !== 'auto') {
			modalHeight = this.plugin.settings.modalHeight;
		}
		
		contentEl.style.width = modalWidth;
		contentEl.style.height = modalHeight;
		contentEl.style.maxWidth = '95vw';
		contentEl.style.maxHeight = '95vh';
		contentEl.style.minWidth = '300px';
		contentEl.style.minHeight = '400px';
		contentEl.style.overflowY = 'auto';
		contentEl.style.padding = '20px';
		contentEl.style.boxSizing = 'border-box';
		contentEl.style.position = 'relative';

		// 创建模态框标题
		contentEl.createEl('h2', { text: 'AI Video Generator' });

		// 检查API密钥
		if (!this.plugin.settings.apiKey) {
			contentEl.createEl('div', { 
				text: '请先在设置中配置API密钥',
				cls: 'video-generator-error'
			});
			return;
		}

		// 提示词输入
		const promptContainer = contentEl.createDiv('video-generator-prompt-container');
		promptContainer.style.marginBottom = '15px';
		const promptLabel = promptContainer.createEl('label', { text: '视频描述 (Prompt):' });
		promptLabel.style.display = 'block';
		promptLabel.style.marginBottom = '5px';
		promptLabel.style.fontWeight = 'bold';
		const promptInput = promptContainer.createEl('textarea', {
			placeholder: '描述您想要生成的视频内容...',
			value: this.initialPrompt
		});
		promptInput.setAttr('rows', '4');
		promptInput.style.width = '50%';
		promptInput.style.maxWidth = '100%';
		promptInput.style.boxSizing = 'border-box';
		promptInput.style.resize = 'vertical';
		promptInput.style.minHeight = screenWidth <= 768 ? '60px' : '80px';
		promptInput.style.maxHeight = screenHeight <= 600 ? '120px' : '200px';
		promptInput.style.padding = screenWidth <= 768 ? '6px' : '8px';
		promptInput.style.border = '1px solid #ddd';
		promptInput.style.borderRadius = '4px';
		promptInput.style.fontSize = screenWidth <= 768 ? '14px' : '16px';

		// 参考图片URL输入
		const imageContainer = contentEl.createDiv('video-generator-image-container');
		imageContainer.style.marginBottom = '15px';
		const imageLabel = imageContainer.createEl('label', { text: '参考图片URL (可选):' });
		imageLabel.style.display = 'block';
		imageLabel.style.marginBottom = '5px';
		imageLabel.style.fontWeight = 'bold';
		const imageInput = imageContainer.createEl('input', {
			type: 'text',
			placeholder: 'https://example.com/image.jpg'
		});
		imageInput.style.width = '50%';
		imageInput.style.maxWidth = '100%';
		imageInput.style.boxSizing = 'border-box';
		imageInput.style.padding = screenWidth <= 768 ? '6px' : '8px';
		imageInput.style.border = '1px solid #ddd';
		imageInput.style.borderRadius = '4px';
		imageInput.style.fontSize = screenWidth <= 768 ? '14px' : '16px';

		// 视频参数设置
		const paramsContainer = contentEl.createDiv('video-generator-params-container');
		paramsContainer.style.display = 'flex';
		paramsContainer.style.flexDirection = 'column';
		paramsContainer.style.gap = screenWidth <= 768 ? '15px' : '20px';
		paramsContainer.style.marginBottom = screenWidth <= 768 ? '15px' : '20px';
		
		// 模型选择
		const modelContainer = paramsContainer.createDiv('video-generator-param');
		modelContainer.style.display = 'flex';
		modelContainer.style.flexDirection = 'column';
		const modelLabel = modelContainer.createEl('label', { text: 'AI模型:' });
		modelLabel.style.fontWeight = 'bold';
		modelLabel.style.marginBottom = '5px';
		const modelSelect = modelContainer.createEl('select');
		modelSelect.style.width = '50%';
		modelSelect.style.boxSizing = 'border-box';
		modelSelect.style.padding = screenWidth <= 768 ? '8px' : '12px';
		modelSelect.style.border = '1px solid #ddd';
		modelSelect.style.borderRadius = '4px';
		modelSelect.style.fontSize = screenWidth <= 768 ? '14px' : '16px';
		modelSelect.style.minHeight = screenWidth <= 768 ? '44px' : '48px';
		const enabledModels = this.plugin.settings.modelConfigs.filter(model => model.enabled);
		for (const model of enabledModels) {
			const option = modelSelect.createEl('option', { value: model.value, text: model.name });
			if (model.value === this.plugin.settings.defaultModel) {
				option.selected = true;
			}
		}

		// 视频比例
		const aspectRatioContainer = paramsContainer.createDiv('video-generator-param');
		aspectRatioContainer.style.display = 'flex';
		aspectRatioContainer.style.flexDirection = 'column';
		const aspectRatioLabel = aspectRatioContainer.createEl('label', { text: '视频比例:' });
		aspectRatioLabel.style.fontWeight = 'bold';
		aspectRatioLabel.style.marginBottom = '5px';
		const aspectRatioSelect = aspectRatioContainer.createEl('select');
		aspectRatioSelect.style.width = '50%';
		aspectRatioSelect.style.boxSizing = 'border-box';
		aspectRatioSelect.style.padding = screenWidth <= 768 ? '8px' : '12px';
		aspectRatioSelect.style.border = '1px solid #ddd';
		aspectRatioSelect.style.borderRadius = '4px';
		aspectRatioSelect.style.fontSize = screenWidth <= 768 ? '14px' : '16px';
		aspectRatioSelect.style.minHeight = screenWidth <= 768 ? '44px' : '48px';
		for (const ratio of this.plugin.settings.availableAspectRatios) {
			const option = aspectRatioSelect.createEl('option', { 
				value: ratio, 
				text: `${ratio} ${this.getAspectRatioDescription(ratio)}` 
			});
			if (ratio === this.plugin.settings.defaultAspectRatio) {
				option.selected = true;
			}
		}

		// 视频时长
		const durationContainer = paramsContainer.createDiv('video-generator-param');
		durationContainer.style.display = 'flex';
		durationContainer.style.flexDirection = 'column';
		const durationLabel = durationContainer.createEl('label', { text: '视频时长:' });
		durationLabel.style.fontWeight = 'bold';
		durationLabel.style.marginBottom = '5px';
		const durationSelect = durationContainer.createEl('select');
		durationSelect.style.width = '50%';
		durationSelect.style.boxSizing = 'border-box';
		durationSelect.style.padding = screenWidth <= 768 ? '8px' : '12px';
		durationSelect.style.border = '1px solid #ddd';
		durationSelect.style.borderRadius = '4px';
		durationSelect.style.fontSize = screenWidth <= 768 ? '14px' : '16px';
		durationSelect.style.minHeight = screenWidth <= 768 ? '44px' : '48px';
		for (const duration of this.plugin.settings.availableDurations) {
			const option = durationSelect.createEl('option', { 
				value: duration.toString(), 
				text: `${duration}秒` 
			});
			if (duration === this.plugin.settings.defaultDuration) {
				option.selected = true;
			}
		}

		// 视频清晰度
		const sizeContainer = paramsContainer.createDiv('video-generator-param');
		sizeContainer.style.display = 'flex';
		sizeContainer.style.flexDirection = 'column';
		const sizeLabel = sizeContainer.createEl('label', { text: '视频清晰度:' });
		sizeLabel.style.fontWeight = 'bold';
		sizeLabel.style.marginBottom = '5px';
		const sizeSelect = sizeContainer.createEl('select');
		sizeSelect.style.width = '50%';
		sizeSelect.style.boxSizing = 'border-box';
		sizeSelect.style.padding = screenWidth <= 768 ? '8px' : '12px';
		sizeSelect.style.border = '1px solid #ddd';
		sizeSelect.style.borderRadius = '4px';
		sizeSelect.style.fontSize = screenWidth <= 768 ? '14px' : '16px';
		sizeSelect.style.minHeight = screenWidth <= 768 ? '44px' : '48px';
		for (const size of this.plugin.settings.availableSizes) {
			const option = sizeSelect.createEl('option', { 
				value: size, 
				text: `${this.getSizeDescription(size)} (${size})` 
			});
			if (size === this.plugin.settings.defaultSize) {
				option.selected = true;
			}
		}

		// 生成按钮
		const buttonContainer = contentEl.createDiv('video-generator-button-container');
		buttonContainer.style.textAlign = 'left';
		buttonContainer.style.marginBottom = '20px';
		const generateButton = buttonContainer.createEl('button', { text: '生成视频' });
		generateButton.addClass('video-generator-button');
		generateButton.style.padding = screenWidth <= 768 ? '8px 20px' : '10px 30px';
		generateButton.style.fontSize = screenWidth <= 768 ? '14px' : '16px';
		generateButton.style.backgroundColor = '#4CAF50';
		generateButton.style.color = 'white';
		generateButton.style.border = 'none';
		generateButton.style.borderRadius = '5px';
		generateButton.style.cursor = 'pointer';
		generateButton.style.width = screenWidth <= 768 ? '100%' : 'auto';
		generateButton.style.minHeight = screenWidth <= 768 ? '44px' : 'auto';

		// 进度显示区域
		const progressContainer = contentEl.createDiv('video-generator-progress-container');
		progressContainer.style.display = 'none';
		progressContainer.style.textAlign = 'left';
		progressContainer.style.maxWidth = '80px';
		progressContainer.style.backgroundColor = '#f0f0f0';
		progressContainer.style.borderRadius = '5px';
		progressContainer.style.marginBottom = '20px';
		progressContainer.style.width = '80px';

		// 结果显示区域
		const resultContainer = contentEl.createDiv('video-generator-result-container');
		resultContainer.style.display = 'none';
		resultContainer.style.textAlign = 'left';
		resultContainer.style.padding = '10px';
		resultContainer.style.backgroundColor = '#e8f5e8';
		resultContainer.style.borderRadius = '5px';
		resultContainer.style.marginBottom = '20px';

		// 生成按钮点击事件
		generateButton.addEventListener('click', async () => {
			const prompt = promptInput.value.trim();
			if (!prompt) {
				new Notice('请输入视频描述');
				return;
			}

			// 显示进度区域
			progressContainer.style.display = 'block';
			progressContainer.innerHTML = '<div class="video-generator-progress">正在生成视频...</div>';
			resultContainer.style.display = 'none';
			generateButton.disabled = true;
			generateButton.textContent = '生成中...';

			// 记录开始时间，确保进度条至少显示2秒
			const startTime = Date.now();
			const minDisplayTime = 2000; // 2秒

			try {
				// 构建请求参数
				const request: VideoGenerationRequest = {
					model: modelSelect.value,
					prompt: prompt,
					aspectRatio: aspectRatioSelect.value,
					duration: parseInt(durationSelect.value),
					size: sizeSelect.value,
					shutProgress: false
				};

				// 如果有参考图片
				if (imageInput.value.trim()) {
					request.url = imageInput.value.trim();
				}

				// 调用API
				const response = await this.plugin.generateVideo(request);
				
				// console.log('Modal API Response:', response);
				
				// 检查响应格式并提取任务ID
				let taskId: string | null = null;
				
				if (response && typeof response === 'object') {
					const resp = response as any;
					
					// 检查标准格式: {id: "..."}
					if (resp.id) {
						taskId = resp.id;
					}
					// 检查嵌套格式: {data: {id: "..."}}
					else if (resp.data && resp.data.id) {
						taskId = resp.data.id;
					}
					// 检查其他可能的格式
					else if (resp.task_id) {
						taskId = resp.task_id;
					}
					// 检查data.task_id格式
					else if (resp.data && resp.data.task_id) {
						taskId = resp.data.task_id;
					}
					// 检查data.taskId格式
					else if (resp.data && resp.data.taskId) {
						taskId = resp.data.taskId;
					}
					
					// console.log('Response structure:', {
					// 	hasId: !!resp.id,
					// 	hasData: !!resp.data,
					// 	dataId: resp.data?.id,
					// 	dataTaskId: resp.data?.taskId,
					// 	dataTask_id: resp.data?.task_id,
					// 	fullResponse: resp
					// });
				}
				
				if (taskId) {
					// 开始轮询结果
					this.pollVideoResult(taskId, progressContainer, resultContainer, generateButton, startTime, minDisplayTime);
				} else {
					// 提供更详细的错误信息
					console.error('Unexpected API response format:', response);
					
					// 尝试从data中提取更多信息
					const resp = response as any;
					let errorDetails = '';
					
					if (resp.data) {
						errorDetails = `\nData内容: ${JSON.stringify(resp.data)}`;
					}
					if (resp.msg) {
						errorDetails += `\n消息: ${resp.msg}`;
					}
					if (resp.code !== undefined) {
						errorDetails += `\n代码: ${resp.code}`;
					}
					
					throw new Error(`未获取到任务ID。API响应: ${JSON.stringify(response)}${errorDetails}`);
				}

			} catch (error) {
				console.error('Video generation error:', error);
				const friendlyMessage = this.plugin.handleApiError(error);
				new Notice(`生成失败: ${friendlyMessage}`);
				
				// 确保最小显示时间
				const elapsedTime = Date.now() - startTime;
				if (elapsedTime < minDisplayTime) {
					await new Promise(resolve => setTimeout(resolve, minDisplayTime - elapsedTime));
				}
				
				// 显示错误信息
				progressContainer.innerHTML = `<div class="video-generator-error">生成失败: ${friendlyMessage}</div>`;
				
				// 恢复按钮状态
				generateButton.disabled = false;
				generateButton.textContent = '生成视频';
				
				// 不要隐藏进度容器，让用户看到错误信息
				// progressContainer.style.display = 'none';
			}
		});
	}

	// 轮询视频生成结果
	async pollVideoResult(id: string, progressContainer: HTMLElement, resultContainer: HTMLElement, generateButton: HTMLButtonElement, startTime: number, minDisplayTime: number) {
		let pollCount = 0;
		const maxAttempts = this.plugin.settings.maxPollingAttempts;
		
		const pollInterval = setInterval(async () => {
			pollCount++;
			
			// 检查是否超过最大尝试次数
			if (pollCount > maxAttempts) {
				clearInterval(pollInterval);
				progressContainer.innerHTML = `<div class="video-generator-error">轮询超时，请稍后手动检查结果</div>`;
				generateButton.disabled = false;
				generateButton.textContent = '生成视频';
				new Notice('轮询超时，请稍后手动检查结果');
				return;
			}

			try {
				const result = await this.plugin.getVideoResult(id);
				
				// 添加调试日志
				console.log('Video generation result:', result);
				
				// 更新进度 - 添加动画效果
				const progress = result.progress || 0;
				const progressText = progress > 0 ? `生成进度: ${progress}%` : '正在生成视频...';
				progressContainer.innerHTML = `<div class="video-generator-progress">${progressText} (${pollCount}/${maxAttempts})</div>`;

				// 检查生成状态 - 支持多种状态字段
				const status = result.status || result.state || result.task_status;
				console.log('Video generation status:', status, 'progress:', progress);
				
				if (status === 'succeeded' || status === 'completed' || status === 'success' || progress === 100) {
					clearInterval(pollInterval);
					
					// 确保最小显示时间
					const elapsedTime = Date.now() - startTime;
					if (elapsedTime < minDisplayTime) {
						progressContainer.innerHTML = `<div class="video-generator-progress">生成完成，正在处理...</div>`;
						await new Promise(resolve => setTimeout(resolve, minDisplayTime - elapsedTime));
					}
					
					this.showVideoResult(result, resultContainer);
					generateButton.disabled = false;
					generateButton.textContent = '生成视频';
					progressContainer.style.display = 'none';
					new Notice('视频生成成功！');
				} else if (status === 'failed' || status === 'error') {
					clearInterval(pollInterval);
					const errorMsg = result.failure_reason || result.error || result.message || '未知错误';
					
					// 确保最小显示时间
					const elapsedTime = Date.now() - startTime;
					if (elapsedTime < minDisplayTime) {
						await new Promise(resolve => setTimeout(resolve, minDisplayTime - elapsedTime));
					}
					
					progressContainer.innerHTML = `<div class="video-generator-error">生成失败: ${errorMsg}</div>`;
					generateButton.disabled = false;
					generateButton.textContent = '生成视频';
					new Notice(`生成失败: ${errorMsg}`);
				}
			} catch (error) {
				console.error('Polling error:', error);
				clearInterval(pollInterval);
				
				// 确保最小显示时间
				const elapsedTime = Date.now() - startTime;
				if (elapsedTime < minDisplayTime) {
					await new Promise(resolve => setTimeout(resolve, minDisplayTime - elapsedTime));
				}
				
				// 显示错误信息
				progressContainer.innerHTML = `<div class="video-generator-error">获取结果失败: ${error.message}</div>`;
				
				// 恢复按钮状态
				generateButton.disabled = false;
				generateButton.textContent = '生成视频';
				
				// 不要隐藏进度容器，让用户看到错误信息
				// progressContainer.style.display = 'none';
			}
		}, this.plugin.settings.pollingInterval);
	}

	// 提取视频URL的通用函数
	extractVideoUrl(result: any): string | null {
		console.log('Extracting video URL from result:', result);
		
		// 常见的视频URL字段名
		const possibleFields = [
			'video_url', 'videoUrl', 'url', 'video', 'output_url', 'outputUrl',
			'file_url', 'fileUrl', 'download_url', 'downloadUrl', 'media_url', 'mediaUrl'
		];
		
		// 检查顶级字段
		for (const field of possibleFields) {
			if (result[field] && typeof result[field] === 'string' && result[field].trim()) {
				console.log(`Found video URL in field '${field}':`, result[field]);
				return result[field].trim();
			}
		}
		
		// 检查嵌套对象
		const nestedObjects = ['data', 'result', 'response', 'output', 'file', 'media'];
		for (const objKey of nestedObjects) {
			if (result[objKey] && typeof result[objKey] === 'object') {
				for (const field of possibleFields) {
					if (result[objKey][field] && typeof result[objKey][field] === 'string' && result[objKey][field].trim()) {
						console.log(`Found video URL in '${objKey}.${field}':`, result[objKey][field]);
						return result[objKey][field].trim();
					}
				}
			}
		}
		
		// 检查数组结果
		if (result.results && Array.isArray(result.results) && result.results.length > 0) {
			for (const item of result.results) {
				if (item && typeof item === 'object') {
					for (const field of possibleFields) {
						if (item[field] && typeof item[field] === 'string' && item[field].trim()) {
							console.log(`Found video URL in results[].${field}:`, item[field]);
							return item[field].trim();
						}
					}
				}
			}
		}
		
		// 检查files数组
		if (result.files && Array.isArray(result.files) && result.files.length > 0) {
			for (const file of result.files) {
				if (file && typeof file === 'object') {
					for (const field of possibleFields) {
						if (file[field] && typeof file[field] === 'string' && file[field].trim()) {
							console.log(`Found video URL in files[].${field}:`, file[field]);
							return file[field].trim();
						}
					}
				}
			}
		}
		
		console.log('No video URL found in result');
		return null;
	}

	// 显示视频结果
	showVideoResult(result: VideoGenerationResponse, resultContainer: HTMLElement) {
		console.log('=== 模态框视频结果调试 ===');
		console.log('Result object:', result);
		console.log('Result type:', typeof result);
		console.log('Result keys:', Object.keys(result || {}));
		
		resultContainer.style.display = 'block';
		resultContainer.innerHTML = '';

		// 使用通用函数提取视频URL - 直接实现
		let videoUrl: string | null = null;
				
				// 支持多种字段名和嵌套结构
				const possibleFields = [
					'video_url', 'videoUrl', 'url', 'video', 'output_url', 'file_url',
					'videoUrl', 'video_path', 'download_url', 'media_url'
				];
				
				// 检查直接字段
				for (const field of possibleFields) {
					if (result[field] && typeof result[field] === 'string' && result[field].startsWith('http')) {
						videoUrl = result[field];
						console.log(`Found video URL in field '${field}':`, videoUrl);
						break;
					}
				}
				
				// 检查嵌套对象
				if (!videoUrl) {
					const nestedObjects = ['data', 'result', 'output', 'file', 'response'];
					for (const obj of nestedObjects) {
						if (result[obj] && typeof result[obj] === 'object') {
							for (const field of possibleFields) {
								if (result[obj][field] && typeof result[obj][field] === 'string' && result[obj][field].startsWith('http')) {
									videoUrl = result[obj][field];
									console.log(`Found video URL in nested field '${obj}.${field}':`, videoUrl);
									break;
								}
							}
							if (videoUrl) break;
						}
					}
				}
				
				// 检查数组结果
				if (!videoUrl) {
					const arrayFields = ['results', 'files', 'videos', 'data'];
					for (const field of arrayFields) {
						if (Array.isArray(result[field]) && result[field].length > 0) {
							const firstItem = result[field][0];
							if (firstItem && typeof firstItem === 'object') {
								for (const urlField of possibleFields) {
									if (firstItem[urlField] && typeof firstItem[urlField] === 'string' && firstItem[urlField].startsWith('http')) {
										videoUrl = firstItem[urlField];
										console.log(`Found video URL in array field '${field}[0].${urlField}':`, videoUrl);
										break;
									}
								}
								if (videoUrl) break;
							}
						}
					}
				};
		
		console.log('Final video URL:', videoUrl);
		console.log('VideoUrl type:', typeof videoUrl);
		console.log('VideoUrl length:', videoUrl ? videoUrl.length : 'N/A');

		if (videoUrl && videoUrl !== 'undefined' && videoUrl.trim() !== '') {
			// 创建视频预览
			const videoElement = resultContainer.createEl('video') as HTMLVideoElement;
			console.log('Setting video src to:', videoUrl);
			videoElement.src = videoUrl;
			videoElement.controls = true;
			videoElement.style.width = '80px';
			videoElement.style.minWidth = '80px';
			videoElement.style.maxWidth = '80px';
			videoElement.style.display = 'block';

			// 创建下载按钮
			const downloadButton = resultContainer.createEl('button', { text: '下载到 aiviode 文件夹' });
			downloadButton.addClass('video-generator-download-button');
			downloadButton.addEventListener('click', async () => {
				try {
					const localPath = await this.plugin.downloadVideo(videoUrl, 'generated-video');
					new Notice(`视频已下载到: ${localPath}`);
				} catch (error) {
					new Notice('下载失败: ' + error.message);
				}
			});

			// 创建插入到笔记按钮
			const insertButton = resultContainer.createEl('button', { text: '下载并插入到当前笔记' });
			insertButton.addClass('video-generator-insert-button');
			insertButton.addEventListener('click', async () => {
				try {
					const localPath = await this.plugin.downloadVideo(videoUrl, 'generated-video');
					await this.insertVideoToNote(localPath);
					new Notice('视频已下载并插入到笔记中');
				} catch (error) {
					new Notice('下载或插入失败: ' + error.message);
				}
			});
		} else {
			// 如果没有找到视频URL，显示调试信息
			resultContainer.innerHTML = `
				<div class="video-generator-error">
					未找到视频URL，请检查API响应结构<br>
					<details>
						<summary>调试信息</summary>
						<pre>${JSON.stringify(result, null, 2)}</pre>
					</details>
				</div>
			`;
		}
	}

	// 插入视频到当前笔记
	async insertVideoToNote(videoPath: string) {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView) {
			const editor = activeView.editor;
			// 只使用文件名，不包含路径
			const fileName = videoPath.split('/').pop() || videoPath;
			// 使用 Obsidian 标准的视频引用格式 ![[filename.mp4]]
			const videoMarkdown = `\n\n![[${fileName}]]\n\n`;
			editor.replaceSelection(videoMarkdown);
			new Notice('视频已插入到笔记中');
		} else {
			new Notice('请先打开一个笔记文件');
		}
	}


	// 获取比例描述
	getAspectRatioDescription(ratio: string): string {
		const descriptions: { [key: string]: string } = {
			'16:9': '(横屏)',
			'9:16': '(竖屏)',
			'1:1': '(正方形)',
			'4:3': '(传统)',
			'3:4': '(竖屏传统)'
		};
		return descriptions[ratio] || '';
	}

	// 获取尺寸描述
	getSizeDescription(size: string): string {
		const descriptions: { [key: string]: string } = {
			'small': '标准',
			'medium': '中等',
			'large': '高清'
		};
		return descriptions[size] || size;
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// 视频生成侧边栏视图
class VideoGeneratorView extends ItemView {
	plugin: VideoGeneratorPlugin;
	initialPrompt: string;

	constructor(leaf: WorkspaceLeaf, plugin: VideoGeneratorPlugin, initialPrompt: string = '') {
		super(leaf);
		this.plugin = plugin;
		this.initialPrompt = initialPrompt;
	}

	getViewType(): string {
		return 'video-generator-view';
	}

	getDisplayText(): string {
		return 'AI Video Generator';
	}

	getIcon(): string {
		return 'video';
	}

	async onOpen() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('video-generator-sidebar');

		// 创建侧边栏标题
		const headerEl = containerEl.createDiv('video-generator-header');
		headerEl.createEl('h2', { text: 'AI Video Generator' });

		// 检查API密钥
		if (!this.plugin.settings.apiKey) {
			const errorEl = containerEl.createDiv('video-generator-error');
			errorEl.createEl('p', { text: '请先在设置中配置API密钥' });
			const settingsBtn = errorEl.createEl('button', { text: '打开设置' });
			settingsBtn.addClass('video-generator-button');
			settingsBtn.onclick = () => {
				(this.app as any).setting.open();
				(this.app as any).setting.openTabById(this.plugin.manifest.id);
			};
			return;
		}

		// 提示词输入
		const promptContainer = containerEl.createDiv('video-generator-prompt-container');
		const promptLabel = promptContainer.createEl('label', { text: '视频描述 (Prompt):' });
		const promptInput = promptContainer.createEl('textarea', {
			placeholder: '描述您想要生成的视频内容...',
			value: this.initialPrompt
		});
		promptInput.setAttr('rows', '3');

		// 参考图片URL输入
		const imageContainer = containerEl.createDiv('video-generator-image-container');
		const imageLabel = imageContainer.createEl('label', { text: '参考图片URL (可选):' });
		const imageInput = imageContainer.createEl('input', {
			type: 'text',
			placeholder: 'https://example.com/image.jpg'
		});

		// 视频参数设置
		const paramsContainer = containerEl.createDiv('video-generator-params-container');
		
		// 模型选择
		const modelContainer = paramsContainer.createDiv('video-generator-param');
		const modelLabel = modelContainer.createEl('label', { text: 'AI模型:' });
		const modelSelect = modelContainer.createEl('select');
		const enabledModels = this.plugin.settings.modelConfigs.filter(model => model.enabled);
		for (const model of enabledModels) {
			const option = modelSelect.createEl('option', { value: model.value, text: model.name });
			if (model.value === this.plugin.settings.defaultModel) {
				option.selected = true;
			}
		}

		// 视频比例
		const aspectRatioContainer = paramsContainer.createDiv('video-generator-param');
		const aspectRatioLabel = aspectRatioContainer.createEl('label', { text: '视频比例:' });
		const aspectRatioSelect = aspectRatioContainer.createEl('select');
		for (const ratio of this.plugin.settings.availableAspectRatios) {
			const option = aspectRatioSelect.createEl('option', { 
				value: ratio, 
				text: `${ratio} ${this.getAspectRatioDescription(ratio)}` 
			});
			if (ratio === this.plugin.settings.defaultAspectRatio) {
				option.selected = true;
			}
		}

		// 视频时长
		const durationContainer = paramsContainer.createDiv('video-generator-param');
		const durationLabel = durationContainer.createEl('label', { text: '视频时长:' });
		const durationSelect = durationContainer.createEl('select');
		for (const duration of this.plugin.settings.availableDurations) {
			const option = durationSelect.createEl('option', { 
				value: duration.toString(), 
				text: `${duration}秒` 
			});
			if (duration === this.plugin.settings.defaultDuration) {
				option.selected = true;
			}
		}

		// 视频尺寸
		const sizeContainer = paramsContainer.createDiv('video-generator-param');
		const sizeLabel = sizeContainer.createEl('label', { text: '视频尺寸:' });
		const sizeSelect = sizeContainer.createEl('select');
		for (const size of this.plugin.settings.availableSizes) {
			const option = sizeSelect.createEl('option', { 
				value: size, 
				text: `${size} ${this.getSizeDescription(size)}` 
			});
			if (size === this.plugin.settings.defaultSize) {
				option.selected = true;
			}
		}

		// 生成按钮
		const buttonContainer = containerEl.createDiv('video-generator-button-container');
		const generateButton = buttonContainer.createEl('button', { text: '生成视频' });
		generateButton.addClass('video-generator-button');

		// 进度显示容器
		const progressContainer = containerEl.createDiv('video-generator-progress-container');
		progressContainer.style.display = 'none';

		// 结果显示容器
		const resultContainer = containerEl.createDiv('video-generator-result-container');
		resultContainer.style.display = 'none';

		// 生成按钮点击事件
		generateButton.onclick = async () => {
			const prompt = promptInput.value.trim();
			if (!prompt) {
				new Notice('请输入视频描述');
				return;
			}

			const imageUrl = imageInput.value.trim();
			const model = modelSelect.value;
			const aspectRatio = aspectRatioSelect.value;
			const duration = parseInt(durationSelect.value);
			const size = sizeSelect.value;

			// 显示进度
			progressContainer.style.display = 'block';
			progressContainer.innerHTML = '<div class="video-generator-progress">正在生成视频...</div>';
			resultContainer.style.display = 'none';
			generateButton.disabled = true;
			generateButton.textContent = '生成中...';

			try {
				const initialResponse = await this.plugin.generateVideo({
					prompt,
					imageUrl: imageUrl || undefined,
					model,
					aspectRatio,
					duration,
					size
				});

				const renderFromResult = (result: any) => {
					// 显示结果
					progressContainer.style.display = 'none';
					resultContainer.style.display = 'block';
					resultContainer.empty();

					// console.log('=== 视频生成结果调试 ===');
					// console.log('Result object:', result);
					// console.log('Result type:', typeof result);
					// console.log('Result keys:', Object.keys(result || {}));
					
					let videoUrl: string | null = null;
					const possibleFields = [
						'video_url', 'videoUrl', 'url', 'video', 'output_url', 'file_url',
						'videoUrl', 'video_path', 'download_url', 'media_url'
					];
					for (const field of possibleFields) {
						if (result[field] && typeof result[field] === 'string' && result[field].startsWith('http')) {
							videoUrl = result[field];
							// console.log(`Found video URL in field '${field}':`, videoUrl);
							break;
						}
					}
					if (!videoUrl) {
						const nestedObjects = ['data', 'result', 'output', 'file', 'response'];
						for (const obj of nestedObjects) {
							if (result[obj] && typeof result[obj] === 'object') {
								for (const field of possibleFields) {
									if (result[obj][field] && typeof result[obj][field] === 'string' && result[obj][field].startsWith('http')) {
										videoUrl = result[obj][field];
										// console.log(`Found video URL in nested field '${obj}.${field}':`, videoUrl);
										break;
									}
								}
								if (videoUrl) break;
							}
						}
					}
					if (!videoUrl) {
						const arrayFields = ['results', 'files', 'videos', 'data'];
						for (const field of arrayFields) {
							if (Array.isArray(result[field]) && result[field].length > 0) {
								const firstItem = result[field][0];
								if (firstItem && typeof firstItem === 'object') {
									for (const urlField of possibleFields) {
										if (firstItem[urlField] && typeof firstItem[urlField] === 'string' && firstItem[urlField].startsWith('http')) {
											videoUrl = firstItem[urlField];
											// console.log(`Found video URL in array field '${field}[0].${urlField}':`, videoUrl);
											break;
										}
									}
									if (videoUrl) break;
								}
							}
						}
					};
					// console.log('Final videoUrl:', videoUrl);
					// console.log('VideoUrl type:', typeof videoUrl);
					// console.log('VideoUrl length:', videoUrl ? videoUrl.length : 'N/A');
					if (!videoUrl || videoUrl === 'undefined' || (videoUrl as string).trim() === '') {
						console.error('No valid video URL found in result:', result);
						throw new Error(`未找到有效的视频URL。结果对象: ${JSON.stringify(result)}`);
					}
					const videoEl = resultContainer.createEl('video');
					// console.log('Setting video src to:', videoUrl);
					videoEl.setAttribute('src', videoUrl);
					videoEl.setAttribute('controls', 'true');
					const buttonRow = resultContainer.createDiv();
					buttonRow.style.marginTop = '10px';
					const downloadBtn = buttonRow.createEl('button', { text: '下载视频' });
					downloadBtn.addClass('video-generator-download-button');
					downloadBtn.onclick = () => {
						const link = document.createElement('a');
						link.href = videoUrl!;
						link.download = `video_${Date.now()}.mp4`;
						link.click();
					};
					const insertBtn = buttonRow.createEl('button', { text: '插入到笔记' });
					insertBtn.addClass('video-generator-insert-button');
					insertBtn.onclick = () => {
						let mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
						if (!mdView) {
							const mdLeaves = this.app.workspace.getLeavesOfType('markdown');
							if (mdLeaves && mdLeaves.length > 0) {
								mdView = mdLeaves[mdLeaves.length - 1].view as MarkdownView;
							}
						}
						if (mdView) {
							const editor = mdView.editor;
							const cursor = editor.getCursor();
							editor.replaceRange(`![Generated Video](${videoUrl})`, cursor);
						} else {
							new Notice('请先打开一个笔记文件');
						}
					};
				};

				// 解析任务ID
				let taskId: string | null = null;
				const resp: any = initialResponse;
				if (resp?.id) taskId = resp.id;
				else if (resp?.data?.id) taskId = resp.data.id;
				else if (resp?.task_id) taskId = resp.task_id;
				else if (resp?.data?.task_id) taskId = resp.data.task_id;
				else if (resp?.data?.taskId) taskId = resp.data.taskId;

				if (taskId) {
					let pollCount = 0;
					const maxAttempts = this.plugin.settings.maxPollingAttempts;
					const intervalId = setInterval(async () => {
						pollCount++;
						if (pollCount > maxAttempts) {
							clearInterval(intervalId);
							progressContainer.innerHTML = `<div class="video-generator-error">轮询超时，请稍后手动检查结果</div>`;
							generateButton.disabled = false;
							generateButton.textContent = '生成视频';
							new Notice('轮询超时，请稍后手动检查结果');
							return;
						}
						try {
							const result = await this.plugin.getVideoResult(taskId!);
							// console.log('Video generation result:', result);
							const progress = result.progress || 0;
							const progressText = progress > 0 ? `生成进度: ${progress}%` : '正在生成视频...';
							progressContainer.innerHTML = `<div class=\"video-generator-progress\">${progressText} (${pollCount}/${maxAttempts})</div>`;
							const status = result.status || result.state || result.task_status;
							if (status === 'succeeded' || status === 'completed' || status === 'success' || progress === 100) {
								clearInterval(intervalId);
								generateButton.disabled = false;
								generateButton.textContent = '生成视频';
								new Notice('视频生成成功！');
								renderFromResult(result);
							} else if (status === 'failed' || status === 'error') {
								clearInterval(intervalId);
								const errorMsg = result.failure_reason || result.error || result.message || '未知错误';
								progressContainer.innerHTML = `<div class=\"video-generator-error\">生成失败: ${errorMsg}</div>`;
								generateButton.disabled = false;
								generateButton.textContent = '生成视频';
								new Notice(`生成失败: ${errorMsg}`);
							}
						} catch (e) {
							console.error('Get video result error:', e);
						}
					}, 2000);
				} else {
					// 没有任务ID，直接尝试渲染（兼容同步返回URL）
					renderFromResult(initialResponse);
				}

			} catch (error) {
				console.error('Video generation error:', error);
				progressContainer.style.display = 'none';
				resultContainer.style.display = 'block';
				resultContainer.empty();
				resultContainer.createEl('div', { 
					text: `生成失败: ${error.message}`,
					cls: 'video-generator-error'
				});
				generateButton.disabled = false;
				generateButton.textContent = '生成视频';
			}
		};
	}

	getAspectRatioDescription(ratio: string): string {
		const descriptions: { [key: string]: string } = {
			'16:9': '(横屏)',
			'9:16': '(竖屏)',
			'1:1': '(正方形)',
			'4:3': '(传统)',
			'3:4': '(传统竖屏)'
		};
		return descriptions[ratio] || ratio;
	}

	getSizeDescription(size: string): string {
		const descriptions: { [key: string]: string } = {
			'small': '(小尺寸)',
			'medium': '(中尺寸)',
			'large': '(大尺寸)',
			'hd': '(高清)',
			'4k': '(4K)'
		};
		return descriptions[size] || size;
	}

	async onClose() {
		const { containerEl } = this;
		containerEl.empty();
	}
}

// 设置页面
class VideoGeneratorSettingTab extends PluginSettingTab {
	plugin: VideoGeneratorPlugin;

	constructor(app: App, plugin: VideoGeneratorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'AI Video Generator 设置' });

		// === API 配置区域 ===
		containerEl.createEl('h3', { text: 'API 配置' });

		// API密钥设置
		new Setting(containerEl)
			.setName('API密钥')
			.setDesc('请输入您的API密钥')
			.addText(text => text
				.setPlaceholder('输入API密钥')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}));

		// API主机选择
		new Setting(containerEl)
			.setName('选择API主机')
			.setDesc('选择当前使用的API服务器')
			.addDropdown(dropdown => {
				// 添加可用的API主机选项
				for (const host of this.plugin.settings.apiHosts) {
					if (host.enabled) {
						dropdown.addOption(host.id, `${host.name} (${host.url})`);
					}
				}
				dropdown.setValue(this.plugin.settings.selectedApiHost)
					.onChange(async (value) => {
						this.plugin.settings.selectedApiHost = value;
						await this.plugin.saveSettings();
					});
			});

		// API主机管理
		containerEl.createEl('h4', { text: 'API主机管理' });
		
		// 显示当前配置的主机列表
		for (const host of this.plugin.settings.apiHosts) {
			const hostContainer = containerEl.createDiv('api-host-item');
			hostContainer.style.border = '1px solid var(--background-modifier-border)';
			hostContainer.style.padding = '10px';
			hostContainer.style.margin = '5px 0';
			hostContainer.style.borderRadius = '4px';

			// 主机名称和状态
			const headerDiv = hostContainer.createDiv();
			headerDiv.style.display = 'flex';
			headerDiv.style.justifyContent = 'space-between';
			headerDiv.style.alignItems = 'center';
			headerDiv.style.marginBottom = '5px';

			const nameSpan = headerDiv.createSpan();
			nameSpan.textContent = host.name;
			nameSpan.style.fontWeight = 'bold';

			const statusSpan = headerDiv.createSpan();
			statusSpan.textContent = host.enabled ? '✅ 启用' : '❌ 禁用';
			statusSpan.style.color = host.enabled ? 'var(--text-accent)' : 'var(--text-muted)';

			// 主机URL
			const urlDiv = hostContainer.createDiv();
			urlDiv.textContent = `URL: ${host.url}`;
			urlDiv.style.fontSize = '0.9em';
			urlDiv.style.color = 'var(--text-muted)';
			urlDiv.style.marginBottom = '5px';

			// 描述
			if (host.description) {
				const descDiv = hostContainer.createDiv();
				descDiv.textContent = host.description;
				descDiv.style.fontSize = '0.8em';
				descDiv.style.color = 'var(--text-muted)';
				descDiv.style.marginBottom = '5px';
			}

			// 操作按钮
			const buttonDiv = hostContainer.createDiv();
			buttonDiv.style.display = 'flex';
			buttonDiv.style.gap = '5px';

			// 启用/禁用按钮
			const toggleButton = buttonDiv.createEl('button', { text: host.enabled ? '禁用' : '启用' });
			toggleButton.style.fontSize = '0.8em';
			toggleButton.onclick = async () => {
				host.enabled = !host.enabled;
				await this.plugin.saveSettings();
				this.display(); // 重新渲染
			};

			// 测试连接按钮
			const testButton = buttonDiv.createEl('button', { text: '测试连接' });
			testButton.style.fontSize = '0.8em';
			testButton.onclick = async () => {
				await this.testApiHost(host);
			};

			// 删除按钮（仅对非默认主机显示）
			if (host.id !== 'default' && host.id !== 'overseas') {
				const deleteButton = buttonDiv.createEl('button', { text: '删除' });
				deleteButton.style.fontSize = '0.8em';
				deleteButton.style.color = 'var(--text-error)';
				deleteButton.onclick = async () => {
					if (confirm(`确定要删除主机 "${host.name}" 吗？`)) {
						this.plugin.settings.apiHosts = this.plugin.settings.apiHosts.filter(h => h.id !== host.id);
						// 如果删除的是当前选中的主机，切换到默认主机
						if (this.plugin.settings.selectedApiHost === host.id) {
							this.plugin.settings.selectedApiHost = 'default';
						}
						await this.plugin.saveSettings();
						this.display(); // 重新渲染
					}
				};
			}
		}

		// 添加新主机按钮
		const addHostButton = containerEl.createEl('button', { text: '➕ 添加新API主机' });
		addHostButton.style.marginTop = '10px';
		addHostButton.onclick = () => {
			this.showAddHostModal();
		};

		// === 默认参数配置区域 ===
		containerEl.createEl('h3', { text: '默认参数' });

		// 默认模型
		new Setting(containerEl)
			.setName('默认AI模型')
			.setDesc('设置默认使用的AI模型')
			.addDropdown(dropdown => {
				const enabledModels = this.plugin.settings.modelConfigs.filter(model => model.enabled);
				for (const model of enabledModels) {
					dropdown.addOption(model.value, model.name);
				}
				dropdown.setValue(this.plugin.settings.defaultModel)
					.onChange(async (value) => {
						this.plugin.settings.defaultModel = value;
						await this.plugin.saveSettings();
					});
			});

		// 默认视频比例
		new Setting(containerEl)
			.setName('默认视频比例')
			.setDesc('设置默认的视频比例')
			.addDropdown(dropdown => {
				for (const ratio of this.plugin.settings.availableAspectRatios) {
					dropdown.addOption(ratio, `${ratio} ${this.getAspectRatioDescription(ratio)}`);
				}
				dropdown.setValue(this.plugin.settings.defaultAspectRatio)
					.onChange(async (value) => {
						this.plugin.settings.defaultAspectRatio = value;
						await this.plugin.saveSettings();
					});
			});

		// 默认视频时长
		new Setting(containerEl)
			.setName('默认视频时长')
			.setDesc('设置默认的视频时长')
			.addDropdown(dropdown => {
				for (const duration of this.plugin.settings.availableDurations) {
					dropdown.addOption(duration.toString(), `${duration}秒`);
				}
				dropdown.setValue(this.plugin.settings.defaultDuration.toString())
					.onChange(async (value) => {
						this.plugin.settings.defaultDuration = parseInt(value);
						await this.plugin.saveSettings();
					});
			});

		// 默认视频清晰度
		new Setting(containerEl)
			.setName('默认视频清晰度')
			.setDesc('设置默认的视频清晰度')
			.addDropdown(dropdown => {
				for (const size of this.plugin.settings.availableSizes) {
					dropdown.addOption(size, `${this.getSizeDescription(size)} (${size})`);
				}
				dropdown.setValue(this.plugin.settings.defaultSize)
					.onChange(async (value) => {
						this.plugin.settings.defaultSize = value;
						await this.plugin.saveSettings();
					});
			});

		// === AI模型管理区域 ===
		containerEl.createEl('h3', { text: 'AI模型管理' });

		// 显示当前模型配置
		for (const model of this.plugin.settings.modelConfigs) {
			const modelCard = containerEl.createDiv('model-card');
			modelCard.style.border = '1px solid var(--background-modifier-border)';
			modelCard.style.borderRadius = '6px';
			modelCard.style.padding = '12px';
			modelCard.style.marginBottom = '8px';
			modelCard.style.backgroundColor = 'var(--background-secondary)';

			// 模型信息
			const modelInfo = modelCard.createDiv('model-info');
			modelInfo.style.display = 'flex';
			modelInfo.style.justifyContent = 'space-between';
			modelInfo.style.alignItems = 'center';

			const modelDetails = modelInfo.createDiv('model-details');
			modelDetails.style.flex = '1';

			const modelName = modelDetails.createEl('div', { text: model.name });
			modelName.style.fontWeight = 'bold';
			modelName.style.fontSize = '0.9em';

			const modelValue = modelDetails.createEl('div', { text: `值: ${model.value}` });
			modelValue.style.fontSize = '0.8em';
			modelValue.style.color = 'var(--text-muted)';

			if (model.description) {
				const modelDesc = modelDetails.createEl('div', { text: model.description });
				modelDesc.style.fontSize = '0.8em';
				modelDesc.style.color = 'var(--text-muted)';
				modelDesc.style.marginTop = '2px';
			}

			// 操作按钮
			const buttonDiv = modelInfo.createDiv('model-actions');
			buttonDiv.style.display = 'flex';
			buttonDiv.style.gap = '8px';

			// 启用/禁用按钮
			const toggleButton = buttonDiv.createEl('button', { 
				text: model.enabled ? '禁用' : '启用' 
			});
			toggleButton.style.fontSize = '0.8em';
			toggleButton.style.color = model.enabled ? 'var(--text-error)' : 'var(--text-accent)';
			toggleButton.onclick = async () => {
				model.enabled = !model.enabled;
				await this.plugin.saveSettings();
				this.display(); // 重新渲染
			};

			// 编辑按钮（仅对自定义模型显示）
			if (model.isCustom) {
				const editButton = buttonDiv.createEl('button', { text: '编辑' });
				editButton.style.fontSize = '0.8em';
				editButton.onclick = () => {
					this.showEditModelModal(model);
				};

				// 删除按钮（仅对自定义模型显示）
				const deleteButton = buttonDiv.createEl('button', { text: '删除' });
				deleteButton.style.fontSize = '0.8em';
				deleteButton.style.color = 'var(--text-error)';
				deleteButton.onclick = async () => {
					if (confirm(`确定要删除模型 "${model.name}" 吗？`)) {
						this.plugin.settings.modelConfigs = this.plugin.settings.modelConfigs.filter(m => m.id !== model.id);
						// 如果删除的是当前默认模型，切换到第一个启用的模型
						if (this.plugin.settings.defaultModel === model.value) {
							const firstEnabled = this.plugin.settings.modelConfigs.find(m => m.enabled);
							if (firstEnabled) {
								this.plugin.settings.defaultModel = firstEnabled.value;
							}
						}
						await this.plugin.saveSettings();
						this.display(); // 重新渲染
					}
				};
			}
		}

		// 添加新模型按钮
		const addModelButton = containerEl.createEl('button', { text: '➕ 添加新AI模型' });
		addModelButton.style.marginTop = '10px';
		addModelButton.onclick = () => {
			this.showAddModelModal();
		};

		// === 高级配置区域 ===
		containerEl.createEl('h3', { text: '高级配置' });

		// Webhook设置
		new Setting(containerEl)
			.setName('使用Webhook回调')
			.setDesc('启用后使用webhook接收生成结果，否则使用轮询方式')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.useWebhook)
				.onChange(async (value) => {
					this.plugin.settings.useWebhook = value;
					await this.plugin.saveSettings();
					this.display(); // 重新渲染以显示/隐藏webhook URL设置
				}));

		// Webhook URL设置
		if (this.plugin.settings.useWebhook) {
			new Setting(containerEl)
				.setName('Webhook URL')
				.setDesc('接收生成结果的回调地址')
				.addText(text => text
					.setPlaceholder('https://your-webhook-url.com/callback')
					.setValue(this.plugin.settings.webhookUrl)
					.onChange(async (value) => {
						this.plugin.settings.webhookUrl = value;
						await this.plugin.saveSettings();
					}));
		}

		// 轮询间隔设置
		new Setting(containerEl)
			.setName('轮询间隔 (毫秒)')
			.setDesc('设置轮询生成结果的间隔时间')
			.addText(text => text
				.setPlaceholder('2000')
				.setValue(this.plugin.settings.pollingInterval.toString())
				.onChange(async (value) => {
					const interval = parseInt(value) || 2000;
					this.plugin.settings.pollingInterval = Math.max(1000, interval); // 最小1秒
					await this.plugin.saveSettings();
				}));

		// 最大轮询次数
		new Setting(containerEl)
			.setName('最大轮询次数')
			.setDesc('设置轮询的最大尝试次数')
			.addText(text => text
				.setPlaceholder('150')
				.setValue(this.plugin.settings.maxPollingAttempts.toString())
				.onChange(async (value) => {
					const attempts = parseInt(value) || 150;
					this.plugin.settings.maxPollingAttempts = Math.max(10, attempts); // 最小10次
					await this.plugin.saveSettings();
				}));

		// === UI 配置区域 ===
		containerEl.createEl('h3', { text: '界面配置' });

		// 显示功能区图标
		new Setting(containerEl)
			.setName('显示功能区图标')
			.setDesc('在左侧功能区显示视频生成图标')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showRibbonIcon)
				.onChange(async (value) => {
					this.plugin.settings.showRibbonIcon = value;
					await this.plugin.saveSettings();
				}));

		// 显示状态栏
		new Setting(containerEl)
			.setName('显示状态栏')
			.setDesc('在状态栏显示插件信息')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showStatusBar)
				.onChange(async (value) => {
					this.plugin.settings.showStatusBar = value;
					await this.plugin.saveSettings();
				}));

		// 模态框宽度
		new Setting(containerEl)
			.setName('模态框宽度')
			.setDesc('设置生成视频对话框的宽度')
			.addText(text => text
				.setPlaceholder('600px')
				.setValue(this.plugin.settings.modalWidth)
				.onChange(async (value) => {
					this.plugin.settings.modalWidth = value || '600px';
					await this.plugin.saveSettings();
				}));

		// 模态框高度
		new Setting(containerEl)
			.setName('模态框高度')
			.setDesc('设置生成视频对话框的高度')
			.addText(text => text
				.setPlaceholder('auto')
				.setValue(this.plugin.settings.modalHeight)
				.onChange(async (value) => {
					this.plugin.settings.modalHeight = value || 'auto';
					await this.plugin.saveSettings();
				}));
	}

	// 获取比例描述
	getAspectRatioDescription(ratio: string): string {
		const descriptions: { [key: string]: string } = {
			'16:9': '(横屏)',
			'9:16': '(竖屏)',
			'1:1': '(正方形)',
			'4:3': '(传统)',
			'3:4': '(竖屏传统)'
		};
		return descriptions[ratio] || '';
	}

	// 获取尺寸描述
	getSizeDescription(size: string): string {
		const descriptions: { [key: string]: string } = {
			'small': '标准',
			'medium': '中等',
			'large': '高清'
		};
		return descriptions[size] || size;
	}

	// 测试API主机连接
	async testApiHost(host: ApiHostConfig): Promise<void> {
		if (!this.plugin.settings.apiKey) {
			new Notice('请先配置API密钥');
			return;
		}

		try {
			new Notice(`正在测试连接 ${host.name}...`);
			
			const testUrl = `${host.url}/v1/video/sora-video`;
			const headers = {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.plugin.settings.apiKey}`
			};

			// 发送测试请求
			const response = await fetch(testUrl, {
				method: 'POST',
				headers: headers,
				body: JSON.stringify({
					model: 'sora-2',
					prompt: 'test',
					aspect_ratio: '16:9',
					duration: 5,
					size: 'small',
					webHook: '-1'
				})
			});

			if (response.ok) {
				new Notice(`✅ ${host.name} 连接成功！`);
			} else {
				const errorText = await response.text();
				new Notice(`❌ ${host.name} 连接失败: ${response.status} - ${errorText}`);
			}
		} catch (error) {
			new Notice(`❌ ${host.name} 连接失败: ${error.message}`);
		}
	}

	// 显示添加新主机的模态框
	showAddHostModal(): void {
		const modal = new AddApiHostModal(this.app, this.plugin, (newHost) => {
			// 添加新主机到设置中
			this.plugin.settings.apiHosts.push(newHost);
			this.plugin.saveSettings();
			this.display(); // 重新渲染设置页面
		});
		modal.open();
	}

	// 显示添加模型模态框
	showAddModelModal(): void {
		const modal = new AddModelModal(this.app, this.plugin, (newModel) => {
			// 添加新模型到设置中
			this.plugin.settings.modelConfigs.push(newModel);
			this.plugin.saveSettings();
			this.display(); // 重新渲染设置页面
		});
		modal.open();
	}

	// 显示编辑模型模态框
	showEditModelModal(model: ModelConfig): void {
		const modal = new EditModelModal(this.app, this.plugin, model, (updatedModel) => {
			// 更新模型配置
			const index = this.plugin.settings.modelConfigs.findIndex(m => m.id === model.id);
			if (index !== -1) {
				this.plugin.settings.modelConfigs[index] = updatedModel;
				this.plugin.saveSettings();
				this.display(); // 重新渲染设置页面
			}
		});
		modal.open();
	}
}

// 添加API主机模态框
class AddApiHostModal extends Modal {
	plugin: VideoGeneratorPlugin;
	onSubmit: (host: ApiHostConfig) => void;

	constructor(app: App, plugin: VideoGeneratorPlugin, onSubmit: (host: ApiHostConfig) => void) {
		super(app);
		this.plugin = plugin;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: '添加新API主机' });

		// 主机名称
		const nameDiv = contentEl.createDiv();
		nameDiv.createEl('label', { text: '主机名称' });
		const nameInput = nameDiv.createEl('input', { type: 'text', placeholder: '例如：备用服务器' });
		nameInput.style.width = '100%';
		nameInput.style.marginBottom = '10px';

		// 主机URL
		const urlDiv = contentEl.createDiv();
		urlDiv.createEl('label', { text: '主机URL' });
		const urlInput = urlDiv.createEl('input', { type: 'text', placeholder: 'https://api.example.com' });
		urlInput.style.width = '100%';
		urlInput.style.marginBottom = '10px';

		// 描述
		const descDiv = contentEl.createDiv();
		descDiv.createEl('label', { text: '描述（可选）' });
		const descInput = descDiv.createEl('input', { type: 'text', placeholder: '例如：备用服务器，稳定性好' });
		descInput.style.width = '100%';
		descInput.style.marginBottom = '20px';

		// 按钮
		const buttonDiv = contentEl.createDiv();
		buttonDiv.style.display = 'flex';
		buttonDiv.style.gap = '10px';
		buttonDiv.style.justifyContent = 'flex-end';

		const cancelButton = buttonDiv.createEl('button', { text: '取消' });
		cancelButton.onclick = () => this.close();

		const addButton = buttonDiv.createEl('button', { text: '添加' });
		addButton.style.backgroundColor = 'var(--interactive-accent)';
		addButton.style.color = 'var(--text-on-accent)';
		addButton.onclick = () => {
			const name = nameInput.value.trim();
			const url = urlInput.value.trim();
			const description = descInput.value.trim();

			if (!name || !url) {
				new Notice('请填写主机名称和URL');
				return;
			}

			// 验证URL格式
			try {
				new URL(url);
			} catch {
				new Notice('请输入有效的URL格式');
				return;
			}

			// 检查是否已存在相同的主机
			if (this.plugin.settings.apiHosts.some(host => host.url === url)) {
				new Notice('该URL已存在');
				return;
			}

			// 创建新主机配置
			const newHost: ApiHostConfig = {
				id: `custom_${Date.now()}`,
				name: name,
				url: url,
				enabled: true,
				description: description || undefined
			};

			this.onSubmit(newHost);
			this.close();
			new Notice(`已添加主机 "${name}"`);
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// 添加AI模型模态框
class AddModelModal extends Modal {
	plugin: VideoGeneratorPlugin;
	onSubmit: (model: ModelConfig) => void;

	constructor(app: App, plugin: VideoGeneratorPlugin, onSubmit: (model: ModelConfig) => void) {
		super(app);
		this.plugin = plugin;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: '添加新AI模型' });

		// 模型名称
		const nameDiv = contentEl.createDiv();
		nameDiv.createEl('label', { text: '模型名称' });
		const nameInput = nameDiv.createEl('input', { type: 'text', placeholder: '例如：GPT-4 Video' });
		nameInput.style.width = '100%';
		nameInput.style.marginBottom = '10px';

		// 模型值
		const valueDiv = contentEl.createDiv();
		valueDiv.createEl('label', { text: '模型值（API参数）' });
		const valueInput = valueDiv.createEl('input', { type: 'text', placeholder: '例如：gpt-4-video' });
		valueInput.style.width = '100%';
		valueInput.style.marginBottom = '10px';

		// 描述
		const descDiv = contentEl.createDiv();
		descDiv.createEl('label', { text: '描述（可选）' });
		const descInput = descDiv.createEl('input', { type: 'text', placeholder: '例如：OpenAI最新视频生成模型' });
		descInput.style.width = '100%';
		descInput.style.marginBottom = '20px';

		// 按钮
		const buttonDiv = contentEl.createDiv();
		buttonDiv.style.display = 'flex';
		buttonDiv.style.gap = '10px';
		buttonDiv.style.justifyContent = 'flex-end';

		const cancelButton = buttonDiv.createEl('button', { text: '取消' });
		cancelButton.onclick = () => this.close();

		const addButton = buttonDiv.createEl('button', { text: '添加' });
		addButton.style.backgroundColor = 'var(--interactive-accent)';
		addButton.style.color = 'var(--text-on-accent)';
		addButton.onclick = () => {
			const name = nameInput.value.trim();
			const value = valueInput.value.trim();
			const description = descInput.value.trim();

			if (!name || !value) {
				new Notice('请填写模型名称和值');
				return;
			}

			// 检查是否已存在相同的模型值
			if (this.plugin.settings.modelConfigs.some(model => model.value === value)) {
				new Notice('该模型值已存在');
				return;
			}

			// 创建新模型配置
			const newModel: ModelConfig = {
				id: `custom_${Date.now()}`,
				name: name,
				value: value,
				enabled: true,
				description: description || undefined,
				isCustom: true
			};

			this.onSubmit(newModel);
			this.close();
			new Notice(`已添加模型 "${name}"`);
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// 编辑AI模型模态框
class EditModelModal extends Modal {
	plugin: VideoGeneratorPlugin;
	model: ModelConfig;
	onSubmit: (model: ModelConfig) => void;

	constructor(app: App, plugin: VideoGeneratorPlugin, model: ModelConfig, onSubmit: (model: ModelConfig) => void) {
		super(app);
		this.plugin = plugin;
		this.model = model;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: '编辑AI模型' });

		// 模型名称
		const nameDiv = contentEl.createDiv();
		nameDiv.createEl('label', { text: '模型名称' });
		const nameInput = nameDiv.createEl('input', { type: 'text', value: this.model.name });
		nameInput.style.width = '100%';
		nameInput.style.marginBottom = '10px';

		// 模型值
		const valueDiv = contentEl.createDiv();
		valueDiv.createEl('label', { text: '模型值（API参数）' });
		const valueInput = valueDiv.createEl('input', { type: 'text', value: this.model.value });
		valueInput.style.width = '100%';
		valueInput.style.marginBottom = '10px';

		// 描述
		const descDiv = contentEl.createDiv();
		descDiv.createEl('label', { text: '描述（可选）' });
		const descInput = descDiv.createEl('input', { type: 'text', value: this.model.description || '' });
		descInput.style.width = '100%';
		descInput.style.marginBottom = '20px';

		// 按钮
		const buttonDiv = contentEl.createDiv();
		buttonDiv.style.display = 'flex';
		buttonDiv.style.gap = '10px';
		buttonDiv.style.justifyContent = 'flex-end';

		const cancelButton = buttonDiv.createEl('button', { text: '取消' });
		cancelButton.onclick = () => this.close();

		const saveButton = buttonDiv.createEl('button', { text: '保存' });
		saveButton.style.backgroundColor = 'var(--interactive-accent)';
		saveButton.style.color = 'var(--text-on-accent)';
		saveButton.onclick = () => {
			const name = nameInput.value.trim();
			const value = valueInput.value.trim();
			const description = descInput.value.trim();

			if (!name || !value) {
				new Notice('请填写模型名称和值');
				return;
			}

			// 检查是否已存在相同的模型值（排除当前模型）
			if (this.plugin.settings.modelConfigs.some(model => model.value === value && model.id !== this.model.id)) {
				new Notice('该模型值已存在');
				return;
			}

			
			// 更新模型配置
			const updatedModel: ModelConfig = {
				...this.model,
				name: name,
				value: value,
				description: description || undefined
			};

			this.onSubmit(updatedModel);
			this.close();
			new Notice(`已更新模型 "${name}"`);
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}