import { useId } from "react";
import type React from "react";
import { cn } from "@/lib/utils";
import { BRAND } from "@/platform/brand";

/** Marque Raice.run « Foulée » : un R penché en verre liquide dont la jambe s'allonge en enjambée. */
const R_PATH =
	"M40 22H79C92.8 22 104 32.3 104 45C104 56 95.6 64.9 84.3 67.3L116 104H92.5L68.4 68H62V92L54 98H40Z M62 37V53H77C81.6 53 84.5 49.6 84.5 45C84.5 40.4 81.6 37 77 37Z";

type LogoIconProps = React.ComponentProps<"svg"> & {
	/** Verre translucide avec reflets, pour les grandes tailles (≥ 64 px). Par défaut, version dense lisible en petit. */
	glass?: boolean;
};

export const LogoIcon = ({ glass = false, ...props }: LogoIconProps) => {
	const id = useId().replace(/:/g, "");
	const stops = glass ? ["0.62", "0.2", "0.1"] : ["0.95", "0.62", "0.5"];
	return (
		<svg aria-hidden="true" fill="none" viewBox="40 18 82 90" {...props}>
			<defs>
				<linearGradient gradientUnits="userSpaceOnUse" id={`${id}-glass`} x1="40" x2="112" y1="18" y2="104">
					<stop offset="0" stopColor="#fff" stopOpacity={stops[0]} />
					<stop offset="0.45" stopColor="#fff" stopOpacity={stops[1]} />
					<stop offset="1" stopColor="#fff" stopOpacity={stops[2]} />
				</linearGradient>
				<linearGradient gradientUnits="userSpaceOnUse" id={`${id}-sheen`} x1="0" x2="0" y1="22" y2="46">
					<stop offset="0" stopColor="#fff" stopOpacity="0.75" />
					<stop offset="1" stopColor="#fff" stopOpacity="0" />
				</linearGradient>
				<linearGradient gradientUnits="userSpaceOnUse" id={`${id}-rim`} x1="40" x2="112" y1="20" y2="104">
					<stop offset="0" stopColor="#fff" />
					<stop offset="0.5" stopColor="#fff" stopOpacity="0.35" />
					<stop offset="1" stopColor="#fff" stopOpacity="0.9" />
				</linearGradient>
			</defs>
			<g transform="translate(28 0) skewX(-14)">
				<path d={R_PATH} fill={`url(#${id}-glass)`} fillRule="evenodd" />
				{glass && <path d={R_PATH} fill={`url(#${id}-sheen)`} fillRule="evenodd" />}
				{glass && (
					<path
						d="M44 25.5H78.5C88 25.5 96.5 30.5 99.5 38"
						stroke="#fff"
						strokeLinecap="round"
						strokeOpacity="0.9"
						strokeWidth="1.4"
					/>
				)}
				<path
					d={R_PATH}
					fillRule="evenodd"
					stroke={`url(#${id}-rim)`}
					strokeLinejoin="round"
					strokeWidth={glass ? 1.2 : 1.8}
				/>
			</g>
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
