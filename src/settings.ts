import { App, PluginSettingTab, Setting } from 'obsidian';
import ChatBubblePlugin from './main';

export interface ChatBubbleSettings {
	selfNames: string[];
}

export const DEFAULT_SETTINGS: ChatBubbleSettings = {
	selfNames: ['我', 'me'],
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

		new Setting(containerEl)
			.setName('Self identifiers')
			.setDesc('Comma-separated names that identify "yourself". Default: 我, me')
			.addText((text) =>
				text
					.setPlaceholder('我, me')
					.setValue(this.plugin.settings.selfNames.join(', '))
					.onChange(async (value) => {
						this.plugin.settings.selfNames = value.split(/[,，]/).map(s => s.trim()).filter(s => s);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Reset to default')
			.setDesc('Restore self identifiers to 我, me')
			.addButton((btn) =>
				btn
					.setButtonText('Reset')
					.onClick(async () => {
						this.plugin.settings.selfNames = [...DEFAULT_SETTINGS.selfNames];
						await this.plugin.saveSettings();
						// Re-render text field with defaults (avoids deprecated this.display())
						const textComponent = this.containerEl.querySelector('input[type="text"]') as HTMLInputElement;
						if (textComponent) textComponent.value = DEFAULT_SETTINGS.selfNames.join(', ');
					}),
			);
	}
}
