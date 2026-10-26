import type React from "react";
import { cn } from "@/lib/utils";
import { BRAND } from "@/platform/brand";

/**
 * Marque Paice.run (provisoire, en attendant le design system) : un cube isométrique en niveaux de gris,
 * dont la facette claire dessine un P. Les teintes sont fixes : la marque reste la même dans les deux thèmes.
 */
export const LogoIcon = (props: React.ComponentProps<"svg">) => (
	<svg aria-hidden="true" viewBox="0 0 24 24" {...props}>
		<rect fill="#000" height="24" rx="5.5" width="24" />
		{/* Faces du cube */}
		<path d="M12 4 18.9 8v8L12 20 5.1 16V8Z" fill="#3a3a3a" />
		<path d="M12 4 18.9 8 12 12 5.1 8Z" fill="#8a8a8a" />
		<path d="M12 12 18.9 8v8L12 20Z" fill="#5c5c5c" />
		{/* Le P : jambage sur l'arête avant, panse sur la face du dessus */}
		<path d="M10.2 9.2 12 8.1l3.4 1.95v1.9L12 13.9v4.2l-1.8 1.05Z" fill="#f5f5f5" />
		<path d="M12 9.95 13.6 10.9 12 11.85Z" fill="#3a3a3a" />
	</svg>
);

export const Logo = ({ className, ...props }: React.ComponentProps<"span">) => (
	<span
		className={cn("inline-flex items-center gap-2 font-semibold text-foreground tracking-tight", className)}
		{...props}
	>
		<LogoIcon className="size-5" />
		{BRAND.name}
	</span>
);
