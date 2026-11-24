import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	type ErrorComponentProps,
	HeadContent,
	Scripts,
	useRouter,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { NotFound } from "#/components/not-found";
import { Button } from "#/components/ui/button";
import { Toaster } from "#/components/ui/sonner";
import type { TRPCRouter } from "#/integrations/trpc/router";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;

	trpc: TRPCOptionsProxy<TRPCRouter>;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	notFoundComponent: NotFound,
	errorComponent: RootErrorBoundary,
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				name: "text-scale",
				content: "scale",
			},
			{
				title: "PassKey Attend",
			},
			{
				name: "theme-color",
				content: "#f8f9ff",
			},
		],
		links: [
			{ rel: "preconnect", href: "https://fonts.googleapis.com" },
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous",
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
			},
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Toaster position="top-center" richColors />
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
						TanStackQueryDevtools,
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}

function RootErrorBoundary({ error, reset }: ErrorComponentProps) {
	const router = useRouter();
	const message =
		error instanceof Error
			? error.message
			: "An unexpected error occurred while loading this page.";

	return (
		<main className="flex min-h-dvh items-center justify-center px-4 py-12">
			<div
				role="alert"
				className="flex w-full max-w-md flex-col items-center gap-4 rounded-xl border bg-card p-6 text-center shadow-xs"
			>
				<div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
					<AlertTriangle aria-hidden="true" className="size-7" />
				</div>
				<div className="space-y-1.5">
					<h1 className="font-bold font-display text-lg text-foreground">
						Unable to load session data
					</h1>
					<p className="text-muted-foreground text-xs">{message}</p>
				</div>
				<Button
					type="button"
					variant="outline"
					onClick={() => {
						reset();
						void router.invalidate();
					}}
				>
					<RotateCcw aria-hidden="true" className="size-4" />
					Try Again
				</Button>
			</div>
		</main>
	);
}
