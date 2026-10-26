import { useId } from "react";
import type React from "react";
import { cn } from "@/lib/utils";
import { BRAND } from "@/platform/brand";

/**
 * Marque Raice.run « Ruban foulée » : un R d'un seul trait (barre, boucle, jambe), penché vers l'avant,
 * attaque en biseau et jambe allongée en enjambée. Dégradé du blanc au gris, comme une lumière du dessus.
 */
const R_PATH =
	"M28 24H70C81 24 90 33 90 44C90 53.5 83.5 61.5 74.5 63.5L104 100L100 104H80L54 62.5V50H70C73.3 50 76 47.3 76 44C76 40.7 73.3 38 70 38H20Z";

export const LogoIcon = (props: React.ComponentProps<"svg">) => {
	const id = useId().replace(/:/g, "");
	return (
		<svg aria-hidden="true" fill="none" viewBox="16 18 84 88" {...props}>
			<defs>
				<linearGradient gradientUnits="userSpaceOnUse" id={`${id}-fill`} x1="40" x2="88" y1="24" y2="104">
					<stop offset="0" stopColor="#fff" />
					<stop offset="0.42" stopColor="#fff" />
					<stop offset="1" stopColor="#8e8e8e" />
				</linearGradient>
			</defs>
			<path d={R_PATH} fill={`url(#${id}-fill)`} transform="translate(8 -2) skewX(-10)" />
		</svg>
	);
};

export const Logo = ({ className, ...props }: React.ComponentProps<"span">) => (
	<span
		className={cn("inline-flex items-center gap-1.5 font-semibold text-foreground italic tracking-tight", className)}
		{...props}
	>
		<LogoIcon className="size-5" />
		{BRAND.name}
	</span>
);
