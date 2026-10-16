// Settings → Admin: sign in with the admin password, or sign out.
const post = (url: string, body?: unknown) =>
	fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });

const openButton = document.getElementById("admin-open");
const form = document.getElementById("admin-form");
const error = document.getElementById("admin-error");

openButton?.addEventListener("click", () => {
	openButton.hidden = true;
	if (form) form.hidden = false;
	document.getElementById("admin-password")?.focus();
});

form?.addEventListener("submit", async (event) => {
	event.preventDefault();
	const password = (document.getElementById("admin-password") as unknown as { value: string } | null)?.value ?? "";
	const res = await post("/api/admin/login", { password }).catch(() => null);
	if (res?.ok) location.reload();
	else if (error) error.textContent = res?.status === 401 ? "Wrong password" : "Could not sign in, try again.";
});

document.getElementById("admin-logout")?.addEventListener("click", async () => {
	await post("/api/admin/logout").catch(() => null);
	location.reload();
});
export {};
