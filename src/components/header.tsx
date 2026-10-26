"use client";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { useScroll } from "@/hooks/use-scroll";
import { Button } from "@/components/shadcn/button";
import { MobileNav } from "@/components/mobile-nav";
import { Link } from "react-router-dom";

export const navLinks = [
	{
		label: "Comment ça marche",
		href: "#fonctionnement",
	},
	{
		label: "Montre",
		href: "#montre",
	},
	{
		label: "Coach IA",
		href: "#coach",
	},
];

export function Header() {
	const scrolled = useScroll(10);

	return (
		<header
			className={cn(
				"sticky top-0 z-50 mx-auto w-full max-w-4xl border-transparent border-b md:rounded-md md:border md:transition-all md:ease-out",
				{
					"border-border bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/50 md:top-2 md:max-w-3xl md:shadow":
						scrolled,
				}
			)}
		>
			<nav
				className={cn(
					"flex h-14 w-full items-center justify-between px-4 md:h-12 md:transition-all md:ease-out",
					{
						"md:px-2": scrolled,
					}
				)}
			>
				<Link
					className="rounded-md p-2 hover:bg-muted dark:hover:bg-muted/50"
					to="/"
				>
					<Logo className="text-sm" />
				</Link>
				<div className="hidden items-center gap-2 md:flex">
					<div>
						{navLinks.map((link) => (
							<Button asChild key={link.label} size="sm" variant="ghost">
								<a href={link.href}>{link.label}</a>
							</Button>
						))}
					</div>
					<Button asChild size="sm" variant="outline">
						<Link to="/connexion">Se connecter</Link>
					</Button>
					<Button asChild size="sm">
						<Link to="/onboarding">Créer mon plan</Link>
					</Button>
				</div>
				<MobileNav />
			</nav>
		</header>
	);
}
