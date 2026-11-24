import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	CheckCircle2,
	Clock,
	Fingerprint,
	Search,
	Users,
	UserX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
	RegisterDialog,
	type RegisterPhase,
} from "#/components/registration/register-dialog";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import {
	describeRegistrationError,
	type RegistrationStudent,
	usePasskeyRegistration,
} from "#/hooks/use-passkey-registration";
import { useTRPC } from "#/integrations/trpc/react";
import { sessionDateSchema } from "#/lib/date";
import { parseRoom, roomCodeSchema } from "#/lib/room";

const registerSearchSchema = z.object({
	q: z.string().optional().catch(undefined),
	room: roomCodeSchema.optional().catch(undefined),
	date: sessionDateSchema.optional().catch(undefined),
	from: z.enum(["home", "attendance"]).optional().catch(undefined),
});

export const Route = createFileRoute("/register")({
	validateSearch: registerSearchSchema,
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(
			context.trpc.registration.list.queryOptions(),
		);
	},
	head: () => ({
		meta: [{ title: "Passkey Registration · PassKey Attend" }],
	}),
	component: RegistrationPage,
});

type DialogState = {
	open: boolean;
	phase: RegisterPhase;
	student: RegistrationStudent | null;
};

const createdAtFormatter = new Intl.DateTimeFormat("en-US", {
	year: "numeric",
	month: "short",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
});

function formatCreatedAt(value: Date | string | null) {
	if (!value) return "—";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "—";
	return createdAtFormatter.format(date);
}

function RegistrationPage() {
	const { q, room: returnRoom, date: returnDate, from } = Route.useSearch();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const listOptions = trpc.registration.list.queryOptions();

	const { data: students } = useSuspenseQuery(listOptions);
	const registerPasskey = usePasskeyRegistration();

	const [search, setSearch] = useState(q ?? "");
	const [dialog, setDialog] = useState<DialogState>({
		open: false,
		phase: "form",
		student: null,
	});
	const searchRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (q !== undefined) {
			setSearch(q);
		}
	}, [q]);

	// ⌘K / Ctrl+K focuses the search box.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				searchRef.current?.focus();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	const registeredCount = useMemo(
		() => students.filter((s) => s.isRegistered).length,
		[students],
	);

	const visible = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return students;
		return students.filter(
			(student) =>
				student.name.toLowerCase().includes(query) ||
				student.username.toLowerCase().includes(query),
		);
	}, [students, search]);

	const closeDialog = useCallback(
		() => setDialog((current) => ({ ...current, open: false, phase: "form" })),
		[],
	);

	const handleRegisterSubmit = async (email: string) => {
		const target = dialog.student;
		if (!target) return;

		try {
			const result = await registerPasskey({
				studentId: target.id,
				username: target.username,
				email,
				onCreatingPasskey: () =>
					setDialog((current) => ({ ...current, phase: "creating" })),
			});

			queryClient.setQueryData<RegistrationStudent[]>(
				listOptions.queryKey,
				(current) =>
					current?.map((row) =>
						row.id === target.id
							? {
									...row,
									userId: result.userId,
									email: result.email,
									createdAt: result.createdAt,
									isRegistered: true,
								}
							: row,
					),
			);
			void queryClient.invalidateQueries({ queryKey: listOptions.queryKey });
			void queryClient.invalidateQueries(trpc.attendance.roster.pathFilter());

			closeDialog();
			toast.success(`Registered ${target.name}`, {
				description: `Username ${target.username} (${result.email})`,
			});
		} catch (error) {
			setDialog((current) => ({ ...current, phase: "form" }));
			toast.error("Registration failed", {
				description: describeRegistrationError(error),
			});
			void queryClient.invalidateQueries({ queryKey: listOptions.queryKey });
			void queryClient.invalidateQueries(trpc.attendance.roster.pathFilter());
		}
	};

	return (
		<div className="flex min-h-dvh flex-col [overflow-anchor:none]">
			<a
				href="#register-main"
				className="visually-hidden focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-3 focus-visible:py-2 focus-visible:font-semibold focus-visible:text-primary-foreground focus-visible:text-xs focus-visible:shadow-md"
			>
				Skip to main content
			</a>
			<header className="sticky-page-header sticky top-0 z-20">
				<div className="sticky-page-header-bar border-b bg-background/80 backdrop-blur-md">
					<div className="mx-auto flex w-full max-w-360 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
						<div className="flex w-full max-w-3xl items-center gap-2">
							<Button
								asChild
								variant="ghost"
								size="icon"
								className="shrink-0 rounded-full"
							>
								{returnRoom && from !== "home" ? (
									<Link
										to="/attendance/$roomId"
										params={{ roomId: returnRoom }}
										search={{ date: returnDate }}
										aria-label={`Back to Room ${parseRoom(returnRoom).label}`}
									>
										<ArrowLeft />
									</Link>
								) : (
									<Link
										to="/"
										search={{ room: returnRoom, date: returnDate }}
										aria-label="Back to home"
									>
										<ArrowLeft />
									</Link>
								)}
							</Button>
							<search className="relative flex-1">
								<Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-4 size-4 text-outline" />
								<Input
									ref={searchRef}
									type="search"
									name="q"
									autoComplete="off"
									autoCorrect="off"
									autoCapitalize="none"
									spellCheck={false}
									value={search}
									onChange={(event) => setSearch(event.target.value)}
									placeholder="Search by name or username…"
									aria-label="Search students"
									className="h-10 rounded-full bg-card pr-16 pl-11 shadow-sm"
								/>
								<kbd className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 hidden rounded border bg-secondary px-2 py-0.5 font-mono text-[10px] text-outline sm:inline-flex">
									⌘K
								</kbd>
							</search>
						</div>

						<div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
							<div className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 shadow-sm">
								<span className="size-2 rounded-full bg-primary" />
								<span className="font-medium font-mono text-[11px]">
									WebAuthn Registration
								</span>
							</div>
							<div className="rounded-full border bg-secondary px-3 py-1.5 font-medium font-mono text-[11px] text-muted-foreground">
								{registeredCount} / {students.length} Registered
							</div>
						</div>
					</div>
				</div>
			</header>

			<main
				id="register-main"
				className="mx-auto w-full max-w-360 flex-1 space-y-6 px-4 py-6 sm:px-6"
			>
				<div className="space-y-1">
					<h1
						id="register-heading"
						className="font-bold font-display text-2xl text-foreground tracking-tight"
					>
						Student Passkey Registration
					</h1>
					<p className="text-muted-foreground text-sm">
						Register student WebAuthn credentials using{" "}
						<code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-foreground">
							student_id
						</code>{" "}
						as the username.
					</p>
				</div>

				{students.length === 0 ? (
					<EmptyTableState
						icon={<Users className="size-8" />}
						title="No students found"
						body="The student table has no records yet. Run bun run db:seed to populate student records."
					/>
				) : visible.length === 0 ? (
					<EmptyTableState
						icon={<UserX className="size-8" />}
						title="No matching students"
						body={`No student name or username matches “${search.trim()}”.`}
					/>
				) : (
					<div className="overflow-hidden rounded-xl border bg-card shadow-xs">
						<Table
							containerProps={{
								"aria-labelledby": "register-heading",
							}}
						>
							<TableCaption className="visually-hidden">
								Student WebAuthn passkey registration directory
							</TableCaption>
							<TableHeader className="bg-muted/60">
								<TableRow className="hover:bg-transparent">
									<TableHead
										scope="col"
										className="w-16 px-4 text-center font-mono text-xs"
									>
										No.
									</TableHead>
									<TableHead scope="col" className="px-4 font-semibold">
										Name
									</TableHead>
									<TableHead scope="col" className="px-4 font-semibold">
										Username
									</TableHead>
									<TableHead scope="col" className="px-4 font-semibold">
										Created At
									</TableHead>
									<TableHead
										scope="col"
										className="w-28 px-4 text-center font-semibold"
									>
										Status
									</TableHead>
									<TableHead
										scope="col"
										className="w-36 px-4 text-right font-semibold"
									>
										Action
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{visible.map((student, index) => (
									<TableRow
										key={student.id}
										className={index >= 12 ? "defer-row-render" : undefined}
									>
										<TableCell className="px-4 text-center font-mono text-muted-foreground text-xs">
											{index + 1}
										</TableCell>
										<th
											scope="row"
											data-slot="table-cell"
											className="px-4 py-3 text-left align-middle font-medium whitespace-nowrap text-foreground"
										>
											{student.name}
										</th>
										<TableCell className="px-4 py-3 font-mono text-xs">
											{student.username}
										</TableCell>
										<TableCell className="px-4 py-3 font-mono text-muted-foreground text-xs">
											{formatCreatedAt(student.createdAt)}
										</TableCell>
										<TableCell className="px-4 py-3 text-center">
											<div className="flex items-center justify-center">
												{student.isRegistered ? (
													<Badge
														variant="secondary"
														className="gap-1 bg-success/12 font-mono text-[10px] text-emerald-700"
													>
														<CheckCircle2
															aria-hidden="true"
															className="size-3"
														/>
														Registered
													</Badge>
												) : (
													<Badge
														variant="outline"
														className="gap-1 font-mono text-[10px] text-muted-foreground"
													>
														<Clock aria-hidden="true" className="size-3" />
														Pending
													</Badge>
												)}
											</div>
										</TableCell>
										<TableCell className="px-4 py-3 text-right">
											<Button
												type="button"
												size="sm"
												disabled={student.isRegistered}
												aria-label={`Register ${student.name}`}
												onClick={() =>
													setDialog({
														open: true,
														phase: "form",
														student,
													})
												}
												className="font-semibold"
											>
												<Fingerprint className="size-3.5" />
												Register
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</main>

			<RegisterDialog
				key={dialog.student?.id ?? "register-dialog"}
				open={dialog.open}
				phase={dialog.phase}
				student={dialog.student}
				onClose={closeDialog}
				onSubmit={handleRegisterSubmit}
			/>
		</div>
	);
}

function EmptyTableState({
	icon,
	title,
	body,
}: {
	icon: React.ReactNode;
	title: string;
	body: string;
}) {
	return (
		<div className="fade-in-0 zoom-in-95 flex animate-in flex-col items-center justify-center gap-4 rounded-xl border bg-card py-20 text-center duration-300">
			<div className="flex size-16 items-center justify-center rounded-full bg-secondary text-muted-foreground">
				{icon}
			</div>
			<div className="space-y-1 px-4">
				<h2 className="font-display font-semibold text-xl">{title}</h2>
				<p className="max-w-md text-muted-foreground text-sm">{body}</p>
			</div>
		</div>
	);
}
