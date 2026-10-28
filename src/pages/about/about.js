import "./about.scss";
import Logo from "components/logo";
import Page from "components/page";
import Reactive from "html-tag-js/reactive";
import actionStack from "lib/actionStack";
import config from "lib/config";

export default function AboutInclude() {
	const $page = Page(strings.about.capitalize());
	const webviewVersionName = Reactive("N/A");
	const webviewPackageName = Reactive("N/A");

	$page.classList.add("about-us");
	$page.body = (
		<main id="about-page" className="main scroll">
			<Logo />

			<div className="version-info">
				<h1 className="version-title">Codev Studio</h1>
				<div className="version-number">
					Versão {BuildInfo.version} ({BuildInfo.versionCode})
				</div>
				<div className="version-number">
					Editor de código e terminal Linux no celular
				</div>
			</div>

			<div className="info-section">
				<a href={config.GITHUB_URL} className="info-item">
					<div className="info-item-icon">
						<span className="icon github"></span>
					</div>
					<div className="info-item-text">
						Código-fonte
						<div className="info-item-subtext">{config.GITHUB_URL}</div>
					</div>
				</a>
				<a href="https://github.com/Acode-Foundation/Acode" className="info-item">
					<div className="info-item-icon">
						<span className="icon acode"></span>
					</div>
					<div className="info-item-text">
						Baseado no Acode (licença MIT)
						<div className="info-item-subtext">
							Foxdebug e Acode Foundation
						</div>
					</div>
				</a>
				<a
					href="#"
					className="info-item"
					onclick={(e) => {
						e.preventDefault();
						system.openInBrowser(
							`https://play.google.com/store/apps/details?id=${webviewPackageName.value}`,
						);
					}}
				>
					<div className="info-item-icon">
						<span className="icon googlechrome"></span>
					</div>
					<div className="info-item-text">
						Webview {webviewVersionName}
						<div className="info-item-subtext">{webviewPackageName}</div>
					</div>
				</a>
			</div>
		</main>
	);

	system.getWebviewInfo((res) => {
		webviewPackageName.value = res?.packageName || "N/A";
		webviewVersionName.value = res?.versionName || "N/A";
	});

	actionStack.push({
		id: "about",
		action: $page.hide,
	});

	$page.onhide = function () {
		actionStack.remove("about");
	};

	app.append($page);
}
