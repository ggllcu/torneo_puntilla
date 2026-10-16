// Re-fetches the current page every 20 s and swaps the #live region, so submitted scores appear without a reload.
const INTERVAL_MS = 20_000;

async function refresh() {
	if (document.hidden) return;
	try {
		const res = await fetch(location.href, { cache: "no-store" });
		if (!res.ok) return;
		const doc = new DOMParser().parseFromString(await res.text(), "text/html");
		const next = doc.getElementById("live");
		const current = document.getElementById("live");
		if (next && current && next.innerHTML !== current.innerHTML) current.innerHTML = next.innerHTML;
	} catch {
		// offline or a transient error: try again next tick
	}
}

setInterval(refresh, INTERVAL_MS);
document.addEventListener("visibilitychange", () => {
	if (!document.hidden) refresh();
});
