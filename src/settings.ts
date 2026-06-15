import { App, PluginSettingTab, Setting } from 'obsidian';
import ChatBubblePlugin from './main';

export interface ChatBubbleSettings {
	selfNames: string[];
}

export const DEFAULT_SETTINGS: ChatBubbleSettings = {
	selfNames: ['bruceMTY', '我', 'me', '自己'],
};

export class ChatBubbleSettingTab extends PluginSettingTab {
	plugin: ChatBubblePlugin;

	constructor(app: App, plugin: ChatBubblePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Chat Bubble Renderer Settings' });

		new Setting(containerEl)
			.setName('Self identifiers')
			.setDesc('Comma-separated list of names that identify "yourself" (left-aligned vs right-aligned bubbles)')
			.addText((text) =>
				text
					.setPlaceholder('bruceMTY, 我, me, 自己')
					.setValue(this.plugin.settings.selfNames.join(', '))
					.onChange(async (value) => {
						this.plugin.settings.selfNames = value.split(',').map(s => s.trim()).filter(s => s);
						await this.plugin.saveSettings();
					}),
			);
	}
}
