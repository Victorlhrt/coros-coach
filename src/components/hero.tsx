import { cn } from "@/lib/utils";
import { ArrowRightIcon } from "lucide-react";
import { appHref } from "@/platform/brand";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/** Logos qui défilent dans le titre : les IA qui écrivent le plan, les montres qui le portent. */
const LOGOS = [
	{ name: "Claude", src: "/partners/claude.png", invert: false },
	{ name: "ChatGPT", src: "/partners/openai.png", invert: true },
	{ name: "COROS", src: "/partners/coros.png", invert: false },
	{ name: "Garmin", src: "/partners/garmin.png", invert: true },
];

/** Une pastille à la taille du texte qui pivote d'un logo à l'autre (immobile si l'animation est réduite). */
function RotatingLogo() {
	const reduce = useReducedMotion();
	const [index, setIndex] = useState(0);
	useEffect(() => {
		if (reduce) return;
		const t = window.setInterval(() => setIndex((i) => (i + 1) % LOGOS.length), 1800);
		return () => window.clearInterval(t);
	}, [reduce]);
	const logo = LOGOS[index];
	return (
		<span
			aria-label={LOGOS.map((l) => l.name).join(", ")}
			className="relative mx-[0.08em] inline-flex size-[0.9em] translate-y-[0.1em] [perspective:400px]"
			role="img"
		>
			<AnimatePresence initial={false} mode="popLayout">
				<motion.span
					animate={{ rotateY: 0, opacity: 1, scale: 1 }}
					className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[0.24em] border bg-card shadow-lg"
					exit={{ rotateY: -90, opacity: 0, scale: 0.9 }}
					initial={{ rotateY: 90, opacity: 0, scale: 0.9 }}
					key={logo.name}
					transition={{ type: "spring", visualDuration: 0.5, bounce: 0.2 }}
				>
					<img alt="" className={cn("size-full object-contain", logo.invert && "p-[0.14em] invert")} src={logo.src} />
				</motion.span>
			</AnimatePresence>
		</span>
	);
}

/**
 * Bouton principal du hero : « Build my plan » suivi de trois traits de vitesse. Au survol, les traits
 * s'étirent en vague ; au clic, ils filent hors du bouton, le bouton se remplit, puis l'onboarding s'ouvre.
 */
const SPEED_LINES = [
	{ width: 16, delay: 0 },
	{ width: 11, delay: 0.06 },
	{ width: 7, delay: 0.12 },
];

function RunCta({ href }: { href: string }) {
	const reduce = useReducedMotion();
	const [hover, setHover] = useState(false);
	const [launch, setLaunch] = useState(false);

	return (
		<a
			className="group relative inline-flex h-12 items-center gap-4 overflow-hidden rounded-full bg-primary pr-5 pl-6 font-medium text-base text-primary-foreground shadow-lg outline-none ring-ring/50 focus-visible:ring-[3px]"
			href={href}
			onClick={(e) => {
				if (reduce || launch) return;
				e.preventDefault();
				setLaunch(true);
				window.setTimeout(() => window.location.assign(href), 650);
			}}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
		>
			{/* Remplissage qui balaie le bouton au départ */}
			<motion.span
				aria-hidden="true"
				animate={{ scaleX: launch ? 1 : 0 }}
				className="absolute inset-0 origin-left bg-black/10"
				initial={false}
				transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
			/>
			<motion.span animate={{ x: launch ? -4 : 0, opacity: launch ? 0.6 : 1 }} className="relative" transition={{ duration: 0.3 }}>
				{launch ? "Let’s go" : "Build my plan"}
			</motion.span>
			<span aria-hidden="true" className="relative flex w-4 flex-col items-end gap-[3px]">
				{SPEED_LINES.map((l) => (
					<motion.span
						key={l.width}
						animate={
							launch
								? { x: 60, opacity: 0, scaleX: 1.8 }
								: hover && !reduce
									? { x: [0, 3, 0], scaleX: [1, 1.35, 1], opacity: 1 }
									: { x: 0, scaleX: 1, opacity: 1 }
						}
						className="block h-[2.5px] origin-right rounded-full bg-primary-foreground"
						style={{ width: l.width }}
						transition={
							launch
								? { duration: 0.45, delay: l.delay, ease: [0.55, 0, 1, 0.45] }
								: { duration: 0.7, delay: l.delay, repeat: hover ? Infinity : 0, ease: "easeInOut" }
						}
					/>
				))}
			</span>
		</a>
	);
}

export function HeroSection() {
	return (
		<section>
			<div className="relative flex flex-col items-center justify-center gap-5 px-4 py-12 md:px-4 md:py-24 lg:py-28">
				{/* X Faded Borders & Shades */}
				{/* Desktop : la photo est calée à droite de l'écran, le coureur hors de la colonne de texte, fondu vers la gauche */}
				<div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 -z-2 hidden w-screen -translate-x-1/2 overflow-hidden lg:block">
					<img
						alt=""
						className="fade-in absolute top-0 right-0 h-full w-auto max-w-none translate-x-[10%] animate-in opacity-75 duration-1000 [mask-image:linear-gradient(to_right,transparent_0%,black_45%)]"
						fetchPriority="high"
						src="/visuals/hero.webp"
					/>
					<div className="absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-background to-transparent" />
					<div className="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-background to-transparent" />
				</div>
				<div
					aria-hidden="true"
					className="absolute inset-0 -z-1 size-full overflow-hidden"
				>
					<div
						className={cn(
							"absolute -inset-x-20 inset-y-0 z-0 rounded-full",
							"bg-[radial-gradient(ellipse_at_center,theme(--color-foreground/.1),transparent,transparent)]",
							"blur-[50px]"
						)}
					/>
					<div className="absolute inset-y-0 left-4 w-px bg-linear-to-b from-transparent via-border to-border md:left-8" />
					<div className="absolute inset-y-0 right-4 w-px bg-linear-to-b from-transparent via-border to-border md:right-8" />
					<div className="absolute inset-y-0 left-8 w-px bg-linear-to-b from-transparent via-border/50 to-border/50 md:left-12" />
					<div className="absolute inset-y-0 right-8 w-px bg-linear-to-b from-transparent via-border/50 to-border/50 md:right-12" />
				</div>
				<a
					className={cn(
						"group mx-auto flex w-fit items-center gap-3 rounded-sm border bg-card p-1 shadow",
						"fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards transition-all delay-500 duration-500 ease-out"
					)}
					href={appHref("/onboarding")}
				>
					<div className="rounded-xs border bg-card px-1.5 py-0.5 shadow-sm">
						<p className="text-xs">BETA</p>
					</div>

					<span className="text-xs">free training plans during the beta</span>
					<span className="block h-5 border-l" />

					<div className="pr-1">
						<ArrowRightIcon className="size-3 -translate-x-0.5 duration-150 ease-out group-hover:translate-x-0.5" />
					</div>
				</a>

				<h1
					className={cn(
						"font-heading max-w-5xl text-balance text-center font-semibold text-[2rem] text-foreground leading-tight tracking-tight sm:text-4xl md:text-5xl lg:text-6xl",
						"fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-100 duration-500 ease-out"
					)}
				>
					Forget generic running plans, it’s time for <span className="whitespace-nowrap">Agentic running <RotatingLogo /></span>
				</h1>

				<p
					className={cn(
						"max-w-3xl text-center text-muted-foreground text-sm tracking-wide sm:text-lg",
						"fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-200 duration-500 ease-out"
					)}
				>
					AI agents read your watch, build your plan around your real paces, push every session to your wrist and
					rewrite the next week from how you actually felt.
				</p>

				<div className="fade-in slide-in-from-bottom-10 flex w-fit animate-in items-center justify-center fill-mode-backwards pt-2 delay-300 duration-500 ease-out">
					<RunCta href={appHref("/onboarding")} />
				</div>

				{/* Mobile et tablette : la photo sous le bouton, jamais derrière le texte */}
				<div aria-hidden="true" className="relative -mx-4 mt-4 h-64 w-screen overflow-hidden sm:h-80 lg:hidden">
					<img alt="" className="absolute inset-0 size-full object-cover object-[72%_40%] opacity-85" src="/visuals/hero-sm.webp" />
					<div className="absolute inset-x-0 top-0 h-20 bg-linear-to-b from-background to-transparent" />
					<div className="absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-background to-transparent" />
				</div>
			</div>
		</section>
	);
}
