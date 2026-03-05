/**
 * pi-remotion — Remotion video rendering for pi
 *
 * Commands:
 *   /remotion <project> [--out file] [--fps N]  — render a Remotion project to MP4
 *
 * LLM tools:
 *   remotion_render — render Remotion project programmatically
 *
 * Note: Generic ffmpeg operations (probe, transcode, trim, etc.) are in pi-ffmpeg.
 *       This extension is ONLY for Remotion rendering.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";

function run(cmd: string, args: string[], cwd?: string): { stdout: string; stderr: string; ok: boolean } {
	try {
		const stdout = execFileSync(cmd, args, {
			encoding: "utf-8", timeout: 300_000, cwd: cwd ? resolve(cwd) : undefined,
			stdio: ["ignore", "pipe", "pipe"],
		});
		return { stdout, stderr: "", ok: true };
	} catch (e: any) {
		return { stdout: e.stdout?.toString() ?? "", stderr: e.stderr?.toString() ?? e.message, ok: false };
	}
}

export default function (pi: ExtensionAPI) {

	// ── /remotion — render a project ─────────────────────────────────────
	pi.registerCommand("remotion", {
		description: [
			"Render a Remotion project to MP4.",
			"Usage: /remotion <project-dir> [--out file.mp4] [--fps 30]",
			"The project dir must contain render.mjs",
		].join("\n"),
		handler: async (args, ctx) => {
			const parts = args.trim().split(/\s+/);
			const project = parts[0];
			if (!project) { ctx.ui.notify("Usage: /remotion <project-dir> [--out file] [--fps N]", "warning"); return; }

			const renderScript = join(resolve(project), "render.mjs");
			if (!existsSync(renderScript)) {
				ctx.ui.notify(`render.mjs not found in ${project}`, "error");
				return;
			}

			const nodeArgs = ["render.mjs"];
			// Extract --out and --fps flags
			for (let i = 1; i < parts.length; i++) {
				if (parts[i] === "--out" && parts[i + 1]) { nodeArgs.push("--out", parts[++i]); }
				else if (parts[i] === "--fps" && parts[i + 1]) { nodeArgs.push("--fps", parts[++i]); }
			}

			ctx.ui.notify(`🎬 Rendering Remotion project: ${project}...`, "info");
			const r = run("node", nodeArgs, project);
			if (!r.ok) {
				ctx.ui.notify(`❌ Render failed:\n${r.stderr.slice(-500)}`, "error");
				return;
			}
			const match = r.stdout.match(/✅\s*(.+)/);
			ctx.ui.notify(match ? `✅ ${match[1].trim()}` : "✅ Render complete", "success");
		},
	});

	// ── LLM Tool ─────────────────────────────────────────────────────────
	pi.registerTool({
		name: "remotion_render",
		label: "Remotion Render",
		description: "Render a Remotion project to video. The project dir must contain render.mjs.",
		parameters: Type.Object({
			project: Type.String({ description: "Path to Remotion project directory (must contain render.mjs)" }),
			out: Type.Optional(Type.String({ description: "Output file path" })),
			fps: Type.Optional(Type.Number({ description: "Framerate (default: 30)" })),
		}),
		async execute(_id, params) {
			const renderScript = join(resolve(params.project), "render.mjs");
			if (!existsSync(renderScript)) {
				return { content: [{ type: "text", text: `render.mjs not found in ${params.project}` }], isError: true };
			}
			const args = ["render.mjs"];
			if (params.out) args.push("--out", params.out);
			if (params.fps) args.push("--fps", String(params.fps));
			const r = run("node", args, params.project);
			if (!r.ok) return { content: [{ type: "text", text: `Error: ${r.stderr.slice(-300)}` }], isError: true };
			const match = r.stdout.match(/✅\s*(.+)/);
			return { content: [{ type: "text", text: match ? `OK: ${match[1].trim()}` : "OK: render complete" }] };
		},
	});
}
