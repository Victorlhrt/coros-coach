"use client";

import { Avatar, AvatarFallback } from "@/components/shadcn/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { useLogout, useMe } from "@/platform/session";
import { LogOutIcon, ShieldIcon, UserIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

const initials = (name: string) =>
	name
		.split(/\s+/)
		.map((part) => part[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();

export function NavUser() {
	const { data: user } = useMe();
	const logout = useLogout();
	const navigate = useNavigate();
	if (!user) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button aria-label="My account" className="rounded-full" type="button">
					<Avatar className="size-8">
						<AvatarFallback>{initials(user.name)}</AvatarFallback>
					</Avatar>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-60">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="pointer-events-none flex items-center gap-2">
						<Avatar className="isolate size-8">
							<AvatarFallback>{initials(user.name)}</AvatarFallback>
						</Avatar>
						<div className="min-w-0">
							<span className="font-medium text-foreground">{user.name}</span>
							<div className="truncate text-muted-foreground text-xs">{user.email}</div>
						</div>
					</DropdownMenuLabel>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem onSelect={() => navigate("/account")}>
						<UserIcon />
						My runner space
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => navigate("/admin/administration")}>
						<ShieldIcon />
						Access & settings
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onSelect={() => void logout().then(() => navigate("/login"))}
					variant="destructive"
				>
					<LogOutIcon />
					Log out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
