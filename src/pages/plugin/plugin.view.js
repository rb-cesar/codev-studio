import TabView from "components/tabView";
import toast from "components/toast";
import dayjs from "dayjs/esm";
import dayjsRelativeTime from "dayjs/esm/plugin/relativeTime";
import dayjsUpdateLocale from "dayjs/esm/plugin/updateLocale";
import dayjsUtc from "dayjs/esm/plugin/utc";
import alert from "dialogs/alert";
import DOMPurify from "dompurify";
import config from "lib/config";
import helpers from "utils/helpers";
import Url from "utils/Url";
import { getRatingClass, getRatingLabel } from "./reviewUtils";

dayjs.extend(dayjsRelativeTime);
dayjs.extend(dayjsUtc);
dayjs.extend(dayjsUpdateLocale);

// Configure dayjs for shorter relative time format
dayjs.updateLocale("en", {
	relativeTime: {
		future: "in %s",
		past: (value, withoutSuffix) => {
			if (value === "now") {
				return value;
			}
			return withoutSuffix ? value : `${value} ago`;
		},
		s: "now",
		ss: "now",
		m: "1m",
		mm: "%dm",
		h: "1h",
		hh: "%dh",
		d: "1d",
		dd: "%dd",
		M: "1mo",
		MM: "%dmo",
		y: "1y",
		yy: "%dy",
	},
});

export const cleanups = [];

export default (props) => {
	const {
		id,
		name,
		body,
		icon,
		author,
		downloads,
		license,
		changelogs,
		repository,
		keywords: keywordsRaw,
		contributors: contributorsRaw,
		votes_up: votesUp,
		votes_down: votesDown,
		author_verified: authorVerified,
		author_github: authorGithub,
		package_updated_at: packageUpdatedAt,
		showEditorSupportWarning,
		unsupportedEditor,
	} = props;

	const rating = getRatingLabel(
		Number(votesUp) || 0,
		Number(votesDown) || 0,
	);
	const ratingText =
		rating === "unrated" ? strings["plugin-review:unrated"] : rating;
	const hasRating = votesUp !== undefined;

	const keywords =
		typeof keywordsRaw === "string" ? JSON.parse(keywordsRaw) : keywordsRaw;
	const contributors =
		typeof contributorsRaw === "string"
			? JSON.parse(contributorsRaw)
			: contributorsRaw;

	const formatUpdatedDate = (dateString) => {
		if (!dateString) return null;

		try {
			const updateTime = dayjs.utc(dateString);
			if (!updateTime.isValid()) return null;

			return updateTime.fromNow();
		} catch (error) {
			console.warn("Error parsing date with dayjs:", dateString, error);
			return null;
		}
	};

	return (
		<div
			className="main"
			id="plugin"
		>
			<div className="plugin-header">
				<div
					className="plugin-icon"
					style={{ backgroundImage: `url(${icon})` }}
				></div>
				<div className="plugin-info">
					<div className="title-wrapper">
						<h1 className="plugin-name">{name}</h1>
						{repository ? (
							<a href={repository} className="source-indicator">
								<i className="icon github"></i>
								<span>{strings.open_source}</span>
							</a>
						) : null}
					</div>
					<div className="plugin-meta">
						<span className="meta-item">
							<i className="icon tag" style={{ fontSize: "12px" }}></i>
							<Version
								{...props}
								packageUpdatedAt={packageUpdatedAt}
								formatUpdatedDate={formatUpdatedDate}
							/>
						</span>
						<span className="meta-item author-name">
							<i className="icon person"></i>
							<a href={`https://github.com/${authorGithub}`} className="">
								{author}
							</a>
							{authorVerified ? (
								<i
									on:click={() => {
										toast(strings["verified publisher"]);
									}}
									className="icon verified verified-tick"
								></i>
							) : (
								""
							)}
						</span>
						<span className="meta-item">
							<span className="icon scale" style={{ fontSize: "12px" }}></span>
							{license || "Unknown"}
						</span>
					</div>
					{hasRating ? (
						<div className="metrics-row">
							<div className="metric">
								<span className="icon save_alt"></span>
								<span className="metric-value">
									{helpers.formatDownloadCount(
										typeof downloads === "string"
											? Number.parseInt(downloads)
											: downloads,
									)}
								</span>
								<span>{strings.downloads}</span>
							</div>
							<div className="metric">
								<i className="icon like-solid"></i>
								<span className={getRatingClass(rating)}>{ratingText}</span>
							</div>
						</div>
					) : null}
					{Array.isArray(keywords) && keywords.length ? (
						<div className="keywords">
							{keywords.map((keyword) => (
								<span className="keyword" title={keyword}>
									{keyword}
								</span>
							))}
						</div>
					) : null}
					{showEditorSupportWarning ? (
						<LegacyEditorWarning unsupportedEditor={unsupportedEditor} />
					) : null}
				</div>
				<div className="action-buttons">
					<Buttons {...props} />
				</div>
			</div>
			<TabView id="plugin-tab" disableSwipe={true}>
				<div className="options" onclick={handleTabClick}>
					<span className="tab active" data-tab="overview" tabindex="0">
						{strings.overview}
					</span>
					<span className="tab" data-tab="contributors" tabindex="0">
						{strings.contributors}
					</span>
					<span className="tab" data-tab="changelog" tabindex="0">
						{strings.changelog}
					</span>
				</div>
				<div className="tab-content">
					<div id="overview" className="content-section active md">
						<section
							innerHTML={DOMPurify.sanitize(body, { FORBID_TAGS: ["style"] })}
						/>
					</div>
					<div id="contributors" className="content-section">
						{(() => {
							let contributorsList = contributors?.length
								? [
										{ name: author, role: "Developer", github: authorGithub },
										...contributors,
									]
								: [{ name: author, role: "Developer", github: authorGithub }];

							return contributorsList.map(({ name, role, github }) => {
								let dp = Url.join(config.API_BASE, `../user.png`);
								if (github) {
									dp = `https://avatars.githubusercontent.com/${github}`;
								}
								return (
									<a
										className="contributor"
										href={`https://github.com/${github}`}
										style={{ textDecoration: "none" }}
									>
										<img src={dp} alt={name} />
										<div className="contributor-info">
											<div className="contributor-name">{name}</div>
											<div className="contributor-role">{role}</div>
										</div>
									</a>
								);
							});
						})()}
					</div>

					<div
						id="changelog"
						className="content-section md"
						innerHTML={
							DOMPurify.sanitize(changelogs, { FORBID_TAGS: ["style"] }) ||
							`
							<div class="no-changelog">
								<i class="icon historyrestore"></i>
								<p style="font-size: 1.1rem;">
									No changelog is available for this plugin yet.
								</p>
								<p style="font-size: 0.9rem; font-style: italic;">
									Check back later for updates!
								</p>
							</div>
					`
						}
					></div>
				</div>
			</TabView>
		</div>
	);
};

function handleTabClick(e) {
	const $target = e.target;
	if (!$target.classList.contains("tab")) return;

	const tabs = document.querySelectorAll(".tab");
	const contents = document.querySelectorAll(".content-section");

	tabs.forEach((tab) => tab.classList.remove("active"));
	contents.forEach((content) => content.classList.remove("active"));

	$target.classList.add("active");
	const tabId = $target.dataset.tab;
	document.getElementById(tabId).classList.add("active");
}

async function Buttons(props) {
	const {
		id,
		name,
		isPaid,
		installed,
		update,
		install,
		uninstall,
		minVersionCode,
	} = props;

	if (
		typeof minVersionCode === "number" &&
		minVersionCode > BuildInfo.versionCode
	) {
		return (
			<div className="error">
				<span className="icon info"></span>
				<a href={config.GITHUB_URL} className="text">
					{strings["plugin min version"]
						.replace("{name}", name)
						.replace("{v-code}", minVersionCode)}
				</a>
			</div>
		);
	}

	if (installed && update) {
		return (
			<>
				<button
					data-type="uninstall"
					onclick={uninstall}
					className="btn btn-uninstall"
				>
					<i className="icon delete_outline"></i>
					{strings.uninstall}
				</button>
				<button data-type="update" className="btn btn-update" onclick={install}>
					<i className="icon update"></i>
					{strings.update}
				</button>
			</>
		);
	}

	if (installed) {
		return (
			<button
				data-type="uninstall"
				className="btn btn-uninstall"
				onclick={uninstall}
			>
				<i className="icon delete_outline"></i>
				{strings.uninstall}
			</button>
		);
	}

	// Plugins pagos dependem de compra pela Google Play, que o app não usa.
	if (isPaid) {
		return (
			<div style={{ margin: "auto" }} className="flex-center">
				<span
					onclick={() => alert(strings.info, strings["no-product-info"])}
					className="icon info"
				></span>
				<span>{strings["product not available"]}</span>
			</div>
		);
	}

	return (
		<button data-type="install" className="btn btn-install" onclick={install}>
			<i className="icon save_alt"></i>
			{strings.install}
		</button>
	);
}

function LegacyEditorWarning({ unsupportedEditor }) {
	const oldEditor =
		unsupportedEditor === "ace" ? "Ace" : unsupportedEditor || "the old editor";
	return (
		<div className="legacy-editor-warning">
			<span className="icon info"></span>
			<span>
				{`Built for older Acode/Codev Studio versions powered by ${oldEditor}. Install with caution; some features may behave unexpectedly in the current CodeMirror version.`}
			</span>
		</div>
	);
}

function Version({
	currentVersion,
	version,
	packageUpdatedAt,
	formatUpdatedDate,
}) {
	const updatedText =
		formatUpdatedDate && packageUpdatedAt
			? formatUpdatedDate(packageUpdatedAt)
			: null;

	if (!currentVersion) {
		return (
			<span>
				v{version}
				{updatedText && (
					<span className="version-updated">({updatedText})</span>
				)}
			</span>
		);
	}

	return (
		<span>
			v{currentVersion}&nbsp;&#8594;&nbsp;v{version}
			{updatedText && <span className="version-updated">({updatedText})</span>}
		</span>
	);
}
