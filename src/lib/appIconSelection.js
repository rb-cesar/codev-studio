import toast from "components/toast";
import confirm from "dialogs/confirm";
import helpers from "utils/helpers";
import { APP_ICONS } from "./appIcons";
import appSettings from "./settings";

// Also exclude a newly opened picker while an earlier native change is pending.
let selecting = false;

export default async function selectAppIcon(
	iconId,
	{ signal, onBusy, onLoading, onChange },
) {
	const icon = APP_ICONS.find(({ id }) => id === iconId);
	if (!icon || selecting || signal.aborted) return;
	if (iconId === (appSettings.value.appIcon || "default")) return;

	selecting = true;
	onBusy(true);
	try {
		// Applying an icon toggles the launcher alias, which restarts the app.
		// Warn first so the user can back out.
		const proceed = await confirm(
			strings["app icon"],
			strings["app icon change warning"] ||
				"The app will exit after the app icon is changed.",
			false,
			{ signal },
		);
		if (!proceed || signal.aborted) return;
		onLoading(true);
		await helpers.promisify(system.setAppIcon, iconId);
		// Once Android has applied the change, keep persisted state in sync
		// even if the picker closed while the native callback was in flight.
		await appSettings.update({ appIcon: iconId }, false);
		if (!signal.aborted) {
			onChange();
			toast(strings["app icon changed"]);
		}
	} catch (error) {
		if (!signal.aborted) helpers.error(error);
	} finally {
		selecting = false;
		if (!signal.aborted) {
			onLoading(false);
			onBusy(false);
		}
	}
}
