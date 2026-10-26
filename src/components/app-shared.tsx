import type { ReactNode } from "react";
import { ClipboardListIcon, ExternalLinkIcon, LayoutGridIcon, MailIcon, RouteIcon, ScrollTextIcon, ShieldIcon, UsersIcon, WatchIcon } from "lucide-react";

export type SidebarNavItem = {
	title: string;
	path?: string;
	icon?: ReactNode;
	isActive?: boolean;
	/** Lien hors du back office (site public, coach) : rechargement complet. */
	external?: boolean;
	subItems?: SidebarNavItem[];
};

export type SidebarNavGroup = {
	label?: string;
	items: SidebarNavItem[];
};

export const navGroups: SidebarNavGroup[] = [
	{
		label: "Pilotage",
		items: [
			{ title: "Vue d’ensemble", path: "/admin", icon: <LayoutGridIcon /> },
			{ title: "Inscriptions", path: "/admin/inscriptions", icon: <UsersIcon /> },
			{ title: "Onboardings", path: "/admin/onboardings", icon: <RouteIcon /> },
			{ title: "Plans", path: "/admin/plans", icon: <ClipboardListIcon /> },
		],
	},
	{
		label: "Administration",
		items: [
			{ title: "Accès et réglages", path: "/admin/administration", icon: <ShieldIcon /> },
			{ title: "E-mails", path: "/admin/emails", icon: <MailIcon /> },
			{ title: "Journal", path: "/admin/journal", icon: <ScrollTextIcon /> },
		],
	},
];

export const footerNavLinks: SidebarNavItem[] = [
	{ title: "Site public", path: "/", icon: <ExternalLinkIcon />, external: true },
	{ title: "Coach personnel", path: "/app/", icon: <WatchIcon />, external: true },
];

export const navLinks: SidebarNavItem[] = [
	...navGroups.flatMap((group) =>
		group.items.flatMap((item) =>
			item.subItems?.length ? [item, ...item.subItems] : [item]
		)
	),
	...footerNavLinks,
];

/** Entrée de menu de la page courante : la plus longue qui préfixe l'URL. */
export function activeNavItem(pathname: string) {
	return navLinks
		.filter((item) => item.path && !item.external && (pathname === item.path || pathname.startsWith(`${item.path}/`)))
		.sort((a, b) => (b.path?.length ?? 0) - (a.path?.length ?? 0))[0];
}
