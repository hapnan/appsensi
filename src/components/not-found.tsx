import { Link } from "@tanstack/react-router";
import { ArrowLeft, Compass } from "lucide-react";
import { Button } from "#/components/ui/button";

export function NotFound() {
	return (
		<main className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
			<div className="mb-4 flex size-16 items-center justify-center rounded-full bg-secondary text-muted-foreground">
				<Compass className="size-8" />
			</div>
			<h1 className="font-bold font-display text-2xl text-foreground">
				Page Not Found
			</h1>
			<p className="mt-2 mb-6 max-w-sm text-muted-foreground text-sm">
				The page or resource you are looking for doesn&apos;t exist or has been
				moved.
			</p>
			<Button asChild variant="outline">
				<Link to="/">
					<ArrowLeft />
					Back to Home
				</Link>
			</Button>
		</main>
	);
}
