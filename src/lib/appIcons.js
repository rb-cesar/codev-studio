/**
 * Available app icons that can be selected from the settings.
 * The `id` matches the icon names accepted by `system.setAppIcon`.
 * The `image` is a relative path (relative to the www root) to an SVG
 * preview that is rendered inside the UI.
 */

// Update system.java map and the activity aliases in config.xml too if this is updated
export const APP_ICONS = [
	{ id: "default", label: "Codev", image: "icons/ic_codev_default.svg" },
	{ id: "indigo", label: "Índigo", image: "icons/ic_codev_indigo.svg" },
	{ id: "ember", label: "Brasa", image: "icons/ic_codev_ember.svg" },
	{ id: "ocean", label: "Oceano", image: "icons/ic_codev_ocean.svg" },
	{ id: "porcelain", label: "Porcelana", image: "icons/ic_codev_porcelain.svg" },
	{ id: "graphite", label: "Grafite", image: "icons/ic_codev_graphite.svg" },
	{ id: "forest", label: "Floresta", image: "icons/ic_codev_forest.svg" },
	{ id: "rose", label: "Rosa", image: "icons/ic_codev_rose.svg" },
];

export const APP_ICON_IDS = APP_ICONS.map((icon) => icon.id);
