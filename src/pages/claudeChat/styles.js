// Passed to EditorFile as an inline stylesheet, so it must not start with "/" or "http".
export default `.claude-chat {
	position: relative;
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
	box-sizing: border-box;
	background: var(--secondary-color, #313131);
	color: var(--secondary-text-color, #eee);
	font-size: 15px;
	line-height: 1.5;
}

.claude-chat * {
	box-sizing: border-box;
}

.claude-chat-header {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 6px 8px;
	border-bottom: 1px solid var(--border-color, rgba(204, 204, 204, 0.35));
}

.claude-chat-hbtn {
	flex-shrink: 0;
	min-height: 40px;
	padding: 0 12px;
	border: 1px solid var(--border-color, rgba(204, 204, 204, 0.35));
	border-radius: 10px;
	background: transparent;
	color: inherit;
	font: inherit;
	font-size: 14px;
}

.claude-chat-htitle {
	flex: 1;
	min-width: 0;
	min-height: 40px;
	display: flex;
	flex-direction: column;
	justify-content: center;
	padding: 0 6px;
	border: none;
	background: transparent;
	color: inherit;
	font: inherit;
	text-align: left;
}

.claude-chat-htitle-text,
.claude-chat-htitle-folder {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.claude-chat-htitle-text {
	font-weight: 600;
	line-height: 1.25;
}

.claude-chat-htitle-folder {
	font-size: 12px;
	line-height: 1.25;
	opacity: 0.7;
}

.claude-sessions {
	position: absolute;
	inset: 0;
	z-index: 5;
	display: flex;
	flex-direction: column;
	background: var(--secondary-color, #313131);
}

.claude-sessions-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 6px 8px 6px 14px;
	border-bottom: 1px solid var(--border-color, rgba(204, 204, 204, 0.35));
}

.claude-sessions-list {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	-webkit-overflow-scrolling: touch;
}

.claude-sessions-empty {
	padding: 24px 16px;
	text-align: center;
	opacity: 0.7;
}

.claude-sessions-empty.error {
	color: var(--error-text-color, #ff9b9b);
	opacity: 1;
}

.claude-session-row {
	display: flex;
	align-items: stretch;
	border-bottom: 1px solid var(--border-color, rgba(204, 204, 204, 0.2));
}

.claude-session-row.current {
	box-shadow: inset 3px 0 0 var(--active-color, #888);
}

.claude-session-open {
	flex: 1;
	min-width: 0;
	min-height: 56px;
	display: flex;
	flex-direction: column;
	justify-content: center;
	gap: 2px;
	padding: 8px 12px;
	border: none;
	background: transparent;
	color: inherit;
	font: inherit;
	text-align: left;
}

.claude-session-title {
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
	font-weight: 600;
}

.claude-session-sub {
	font-size: 12px;
	opacity: 0.7;
}

.claude-session-rename {
	flex-shrink: 0;
	padding: 0 14px;
	border: none;
	background: transparent;
	color: var(--link-text-color, #4ba3ff);
	font: inherit;
	font-size: 13px;
}

.claude-chat-messages {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	overflow-x: hidden;
	padding: 12px 12px 4px;
	display: flex;
	flex-direction: column;
	gap: 10px;
	-webkit-overflow-scrolling: touch;
}

.claude-chat-empty {
	margin: auto;
	max-width: 22em;
	text-align: center;
	opacity: 0.7;
}

.claude-chat-empty-note {
	margin-top: 10px;
	font-size: 13px;
	color: var(--error-text-color, #ff9b9b);
}

.claude-msg {
	max-width: 100%;
	display: flex;
	flex-direction: column;
	gap: 6px;
	word-break: break-word;
	overflow-wrap: anywhere;
}

.claude-msg.user {
	align-self: flex-end;
	max-width: 88%;
	background: var(--active-color, #555);
	color: var(--active-text-color, var(--primary-text-color, #fff));
	border-radius: 14px 14px 4px 14px;
	padding: 8px 12px;
	white-space: pre-wrap;
}

.claude-msg.assistant {
	align-self: stretch;
}

.claude-msg.notice {
	align-self: center;
	max-width: 92%;
	font-size: 13px;
	padding: 6px 10px;
	border-radius: 8px;
	border: 1px solid var(--border-color, rgba(204, 204, 204, 0.35));
	opacity: 0.9;
	white-space: pre-wrap;
}

.claude-msg.notice.error {
	color: var(--error-text-color, #ff9b9b);
	border-color: var(--error-text-color, #ff9b9b);
}

.claude-text > :first-child {
	margin-top: 0;
}

.claude-text > :last-child {
	margin-bottom: 0;
}

.claude-text p,
.claude-text ul,
.claude-text ol {
	margin: 0.5em 0;
}

.claude-text pre {
	margin: 0.5em 0;
	padding: 8px 10px;
	overflow-x: auto;
	border-radius: 8px;
	background: var(--primary-color, #1e1e1e);
	font-size: 13px;
	line-height: 1.4;
}

.claude-text code {
	font-family: "Roboto Mono", monospace;
	font-size: 0.9em;
}

.claude-text :not(pre) > code {
	padding: 1px 4px;
	border-radius: 4px;
	background: var(--primary-color, #1e1e1e);
}

.claude-text a {
	color: var(--link-text-color, #4ba3ff);
}

.claude-text table {
	display: block;
	overflow-x: auto;
	border-collapse: collapse;
}

.claude-text th,
.claude-text td {
	padding: 3px 8px;
	border: 1px solid var(--border-color, rgba(204, 204, 204, 0.35));
}

.claude-text img {
	max-width: 100%;
}

.claude-thinking,
.claude-tool {
	border: 1px solid var(--border-color, rgba(204, 204, 204, 0.35));
	border-radius: 8px;
	font-size: 13px;
	overflow: hidden;
}

.claude-thinking > summary,
.claude-tool > summary {
	display: flex;
	gap: 8px;
	align-items: baseline;
	padding: 6px 10px;
	cursor: pointer;
	min-height: 32px;
	list-style: none;
}

.claude-thinking > summary::-webkit-details-marker,
.claude-tool > summary::-webkit-details-marker {
	display: none;
}

.claude-thinking > summary {
	opacity: 0.7;
	font-style: italic;
}

.claude-tool-name {
	font-weight: 600;
	flex-shrink: 0;
}

.claude-tool-summary {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	opacity: 0.75;
	font-family: "Roboto Mono", monospace;
}

.claude-tool-state {
	flex-shrink: 0;
}

.claude-tool.error .claude-tool-state {
	color: var(--error-text-color, #ff9b9b);
}

.claude-tool-body,
.claude-thinking-body {
	margin: 0;
	padding: 8px 10px;
	max-height: 18em;
	overflow: auto;
	border-top: 1px solid var(--border-color, rgba(204, 204, 204, 0.35));
	background: var(--primary-color, #1e1e1e);
	font-family: "Roboto Mono", monospace;
	font-size: 12px;
	line-height: 1.4;
	white-space: pre-wrap;
	word-break: break-all;
}

.claude-thinking-body {
	font-family: inherit;
	font-size: 13px;
	word-break: normal;
}

.claude-tool-body.result.error {
	color: var(--error-text-color, #ff9b9b);
}

.claude-chat-status {
	min-height: 22px;
	padding: 0 14px;
	font-size: 12px;
	opacity: 0.7;
}

.claude-chat-composer {
	display: flex;
	gap: 8px;
	align-items: flex-end;
	padding: 8px 10px calc(8px + env(safe-area-inset-bottom, 0px));
	border-top: 1px solid var(--border-color, rgba(204, 204, 204, 0.35));
	background: var(--secondary-color, #313131);
}

.claude-chat-input {
	flex: 1;
	min-width: 0;
	max-height: 9em;
	min-height: 44px;
	resize: none;
	padding: 10px 12px;
	border-radius: 12px;
	border: 1px solid var(--border-color, rgba(204, 204, 204, 0.35));
	background: var(--primary-color, #1e1e1e);
	color: var(--primary-text-color, #eee);
	font: inherit;
	outline: none;
}

.claude-chat-input:focus {
	border-color: var(--active-color, #888);
}

.claude-chat-button {
	flex-shrink: 0;
	min-width: 64px;
	min-height: 44px;
	padding: 0 14px;
	border: none;
	border-radius: 12px;
	background: var(--active-color, #555);
	color: var(--active-text-color, var(--primary-text-color, #fff));
	font: inherit;
	font-weight: 600;
}

.claude-chat-button:disabled {
	opacity: 0.4;
}

.claude-chat-button.stop {
	background: transparent;
	border: 1px solid var(--error-text-color, #ff9b9b);
	color: var(--error-text-color, #ff9b9b);
}

.claude-chat [hidden] {
	display: none !important;
}
`;
