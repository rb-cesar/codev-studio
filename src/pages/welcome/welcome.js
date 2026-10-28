import { getResolvedKeyBindings } from "cm/commandRegistry";
import logoSrc from "components/logo/logo.png?inline";
import EditorFile from "lib/editorFile";

/**
 * Opens the Welcome tab as an EditorFile page
 */
export default function openWelcomeTab() {
	// Check if welcome tab is already open
	const existingFile = editorManager.files.find((f) => f.id === "welcome-tab");
	if (existingFile) {
		existingFile.makeActive();
		return;
	}

	const welcomeContent = createWelcomeContent();

	const welcomeFile = new EditorFile("Welcome", {
		id: "welcome-tab",
		render: true,
		type: "page",
		content: welcomeContent,
		tabIcon: "icon acode",
		hideQuickTools: true,
	});

	// Set custom subtitle for the header
	welcomeFile.setCustomTitle(() => "Get Started");
}

/**
 * Creates the welcome tab content
 * @returns {HTMLElement}
 */
function createWelcomeContent() {
	const bindings = getResolvedKeyBindings();
	const kb = (name) => {
		const binding = bindings[name];
		return binding?.key ? binding.key.split("|")[0].replace(/-/g, "+") : "";
	};

	return (
		<div id="welcome-tab" className="welcome-page scroll">
			{/* Hero Section */}
			<header className="welcome-header">
				<img className="logo" src={logoSrc} width="48" height="48" alt="" />
				<div className="welcome-header-text">
					<h1>Welcome to Codev Studio</h1>
					<p className="tagline">Editor de código e terminal Linux no celular</p>
				</div>
			</header>

			{/* Get Started Section */}
			<section className="welcome-section">
				<h2 className="section-label">GET STARTED</h2>
				<div className="action-list">
					<ActionRow
						icon="add"
						label={strings["new file"]}
						shortcut={kb("newFile")}
						onClick={() => acode.exec("new-file")}
					/>
					<ActionRow
						icon="document-text-outline"
						label={strings["open file"]}
						shortcut={kb("openFile")}
						onClick={() => acode.exec("open-file")}
					/>
					<ActionRow
						icon="folder_open"
						label={strings["open folder"]}
						shortcut={kb("openFolder")}
						onClick={() => acode.exec("open-folder")}
					/>
					<ActionRow
						icon="terminal"
						label={strings.terminal}
						shortcut={kb("openTerminal")}
						onClick={() => acode.exec("new-terminal")}
					/>
					<ActionRow
						icon="terminal"
						label="Claude Code"
						onClick={() => acode.exec("claude-code")}
					/>
					<ActionRow
						icon="message-circle"
						label="Claude Chat"
						onClick={() => acode.exec("claude-chat")}
					/>
					<ActionRow
						icon="historyrestore"
						label={strings.recent}
						onClick={() => acode.exec("recent")}
					/>
					<ActionRow
						icon="tune"
						label={strings["command palette"]}
						shortcut={kb("openCommandPalette")}
						onClick={() => acode.exec("command-palette")}
					/>
				</div>
			</section>

			{/* Configure Section */}
			<section className="welcome-section">
				<h2 className="section-label">CONFIGURE</h2>
				<div className="action-list">
					<ActionRow
						icon="settings"
						label={strings.settings}
						onClick={() => acode.exec("open", "settings")}
					/>
					<ActionRow
						icon="color_lenspalette"
						label={strings["change theme"]}
						onClick={() => acode.exec("change-app-theme")}
					/>
					<ActionRow
						icon="extension"
						label={strings.explore + " " + strings.plugins}
						onClick={() => acode.exec("open", "plugins")}
					/>
				</div>
			</section>

			{/* Learn Section */}
			<section className="welcome-section">
				<h2 className="section-label">LEARN</h2>
				<div className="action-list">
					<ActionRow
						icon="help"
						label={strings.help}
						onClick={() => acode.exec("open", "help")}
					/>
					<ActionRow
						icon="info_outline"
						label={strings.about}
						onClick={() => acode.exec("open", "about")}
					/>
				</div>
			</section>

		</div>
	);
}

/**
 * Action row component
 */
function ActionRow({ icon, label, shortcut, onClick }) {
	return (
		<div className="action-row" onclick={onClick}>
			<span className={`icon ${icon}`}></span>
			<span className="action-label">{label}</span>
			{shortcut && <span className="action-shortcut">{shortcut}</span>}
		</div>
	);
}
