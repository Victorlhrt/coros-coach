import type { ReactNode } from "react";
import { ClipboardListIcon, ContactIcon, ExternalLinkIcon, FlaskConicalIcon, LayoutGridIcon, MailIcon, RouteIcon, ScrollTextIcon, ShieldIcon, TicketIcon, UsersIcon, WatchIcon } from "lucide-react";

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
		label: "Overview",
		items: [
			{ title: "Dashboard", path: "/admin", icon: <LayoutGridIcon /> },
			{ title: "Sign-ups", path: "/admin/signups", icon: <UsersIcon /> },
			{ title: "Leads", path: "/admin/leads", icon: <ContactIcon /> },
			{ title: "Invitations", path: "/admin/invitations", icon: <TicketIcon /> },
			{ title: "Onboardings", path: "/admin/onboardings", icon: <RouteIcon /> },
			{ title: "Testing", path: "/admin/testing", icon: <FlaskConicalIcon /> },
			{ title: "Plans", path: "/admin/plans", icon: <ClipboardListIcon /> },
		],
	},
	{
		label: "Administration",
		items: [
			{ title: "Access & settings", path: "/admin/settings", icon: <ShieldIcon /> },
			{ title: "Emails", path: "/admin/emails", icon: <MailIcon /> },
			{ title: "Log", path: "/admin/log", icon: <ScrollTextIcon /> },
		],
	},
];

export const footerNavLinks: SidebarNavItem[] = [
	{ title: "Public site", path: "/", icon: <ExternalLinkIcon />, external: true },
	{ title: "Runner space", path: "/account/plan", icon: <WatchIcon />, external: true },
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
